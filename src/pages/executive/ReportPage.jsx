import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { informeService, sedeService, semanaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner, Badge, Semaforo, EmptyState } from '@/components/ui'
import { formatPct, formatCOP, formatHoras, titleCase, compareNatural, TIPOS_RECURSO, ESPECIALIDADES } from '@/utils/helpers'
import { format, subWeeks, startOfWeek } from 'date-fns'
import toast from 'react-hot-toast'

// Tooltips por cabecera — al pasar el mouse por una columna en el ranking
// de ausentismo/ausentismo-impacto, explica su significado. Otros informes
// no tienen tooltips (los coord entienden bien los campos técnicos).
const TOOLTIPS_AUSENTISMO = {
  'Recurso': 'Nombre del recurso (médico, técnico, auxiliar, etc.)',
  'Tipo': 'Rol del recurso: oftalmólogo, optómetra, técnico, auxiliar, asesor, anestesiólogo, etc.',
  'Sede': 'Sede(s) donde trabaja el recurso',
  'Ausencias': 'Total de ausencias CONFIRMADAS del recurso en el período seleccionado. Las pendientes o rechazadas no cuentan.',
  'Programadas': 'Ausencias reportadas con MÁS de 15 días de anticipación (dio tiempo a reprogramar pacientes).',
  'Imprevistas': 'Ausencias reportadas con 15 días o MENOS de anticipación (impacto operativo alto).',
  'Días': 'Suma de días totales de ausencia (fecha fin − fecha inicio + 1 por cada ausencia).',
  'Pac. afectados': 'Suma de pacientes que quedaron sin atención en todas las ausencias. Se calcula día por día por RN-18/19.',
  'Costo estimado': 'Costo de oportunidad estimado = pacientes afectados × costo por consulta (según parámetro vigente en la fecha).',
  'Costo oportunidad': 'Ingresos que dejó de generar la clínica por los pacientes no atendidos.',
  'Costo personal': 'Costo del personal inactivo (recurso pagado que no trabajó por la ausencia).',
  'Costo total': 'Costo oportunidad + costo personal.',
  'Quejas': 'ESTIMACIÓN de quejas esperadas: 9% de pacientes afectados si la ausencia se reportó con >30 días de anticipación, 8% si fue ≤30 días. Redondeo estándar por ausencia individual.',
}

// Formulario extendido con la fórmula completa, para el panel "Cómo se calcula".
const METODOLOGIA_AUSENTISMO = `
Anticipación = días entre la FECHA DE REPORTE de la ausencia y la FECHA DE INICIO de la ausencia.

┌─────────────────────────────────────────────────────────────────────┐
│ Programada / Imprevista                                             │
├─────────────────────────────────────────────────────────────────────┤
│ Anticipación > 15 días  →  PROGRAMADA (hay tiempo de reprogramar)   │
│ Anticipación ≤ 15 días  →  IMPREVISTA (impacto operativo alto)      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Quejas estimadas (por ausencia individual, luego se suman)          │
├─────────────────────────────────────────────────────────────────────┤
│ Anticipación > 30 días  →  9% de pacientes afectados                │
│ Anticipación ≤ 30 días  →  8% de pacientes afectados                │
│ Redondeo estándar: 1.5 → 2, 1.4 → 1, 0.5 → 1                        │
└─────────────────────────────────────────────────────────────────────┘

Ejemplo real:
  Neyda Rosa Gutierrez — 3.678 pacientes afectados, reportada el mismo día (0d)
  → 3.678 × 8% = 294,24 → Math.round = 294 quejas estimadas

Pacientes afectados (RN-18 y RN-19):
  Se cuenta la capacidad de agenda del recurso ausente día por día,
  incluyendo cuando aparece como titular (recurso) o como auxiliar.
  Si la ausencia es parcial (por horas), se prorratea contra la jornada
  estándar de 10h. Si el motivo tiene "factor de impacto" reducido
  (ej. permiso académico corto = 0.5), también se atenúa.

Costo oportunidad:
  pacientes_afectados × costo_por_consulta_vigente_en_la_fecha
  Los recursos tipo "asesor de servicios" no tienen costo por consulta
  configurado, por lo que su costo aparece en $0 aunque sí hay
  pacientes afectados.

Orden del ranking: por Costo total DESC (los más costosos primero).
`.trim()

const CONFIG = {
  ocupacion: {
    title: 'Ocupación de consultorios',
    desc: 'Horas asignadas vs horas disponibles por consultorio y sede. Asesores se excluyen (no son consultorios físicos) — ver "Ocupación de asesores".',
    cols: ['Consultorio', 'Sede', 'Especialidad', 'Horas asignadas', 'Horas base', '% Ocupación'],
    meta: 80,
    fn: informeService.ocupacion,
    porSemana: true,  // usa selector de semana en lugar de rango Desde/Hasta
  },
  'ocupacion-asesores': {
    title: 'Ocupación del área de asesores',
    desc: 'Ocupación de los asesores de servicios por sede. Capacidad = N° de asesores × tope semanal individual. Mide qué tan cargada está la recepción.',
    cols: ['Sede', '# Asesores', 'Horas asignadas', 'Horas base', '% Ocupación'],
    meta: 80,
    fn: informeService.ocupacionAsesores,
    porSemana: true,
    sinFiltroTipo: true,  // ya está fijado a asesor_servicios en backend
  },
  productividad: {
    title: 'Productividad por recurso',
    desc: 'Horas y pacientes programados vs ejecutados por recurso.',
    cols: ['Recurso', 'Tipo', 'Sede', 'H. programadas', 'H. ejecutadas', 'Pac. programados', 'Pac. atendidos', '% Cumplimiento'],
    meta: 85,
    fn: informeService.productividad,
  },
  ausentismo: {
    title: 'Ausentismo y ranking',
    desc: 'Ranking de recursos por número de ausencias, pacientes afectados y costo estimado. Programadas: reportadas con >15 días de anticipación. Imprevistas: ≤15 días. Quejas estimadas: 9% de pacientes afectados si la anticipación fue >30 días, 8% si fue menor.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Ausencias', 'Programadas', 'Imprevistas', 'Días', 'Pac. afectados', 'Costo estimado', 'Quejas'],
    // Columnas visibles SOLO para gerencia+supervisor+directivo (ago-2026):
    // coord no ve Programadas/Imprevistas/Quejas para no exponer datos que
    // se usan para análisis de reprogramación y responsabilidad.
    colsRestringidasACoord: new Set([4, 5, 9]),
    meta: null,
    fn: informeService.ausentismo,
  },
  subutilizacion: {
    title: 'Recursos subutilizados',
    desc: 'Recursos con horas disponibles sin asignar. Meta: ≥90% utilización para auxiliares y optómetras.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Horas asignadas', 'Horas disponibles', '% Utilización', 'Semanas consecutivas'],
    meta: 90,
    fn: informeService.subutilizacion,
  },
  impacto: {
    title: 'Impacto económico de ausencias',
    desc: 'Costo de oportunidad y costos operativos por ausencias.',
    cols: ['Recurso', 'Fecha', 'Tipo', 'Pac. afectados', 'Costo oportunidad', 'Costo personal', 'Costo reprogramación', 'Total'],
    meta: null,
    fn: informeService.impacto,
  },
  'ausentismo-impacto': {
    title: 'Ausentismo e impacto económico',
    desc: 'Ranking de ausencias por recurso con su impacto económico. Programadas: reportadas con >15 días de anticipación. Imprevistas: ≤15 días. Quejas estimadas: 9% de pacientes afectados si la anticipación fue >30 días, 8% si fue menor.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Ausencias', 'Programadas', 'Imprevistas', 'Días', 'Pac. afectados', 'Quejas', 'Costo oportunidad', 'Costo personal', 'Costo total'],
    // Coord no ve Programadas/Imprevistas/Quejas (ago-2026, política de negocio)
    colsRestringidasACoord: new Set([4, 5, 8]),
    meta: null,
    fn: informeService.ausentismoImpacto,
  },
  'horas-prog-ejec': {
    title: 'Horas programadas vs ejecutadas',
    desc: 'Comparación entre lo que se programó y lo que realmente se ejecutó por sede y semana. Meta: ≥85% de cumplimiento.',
    cols: ['Sede', 'Semana', 'H. programadas', 'H. ejecutadas', 'Diferencia', '% Cumplimiento'],
    meta: 85,
    fn: informeService.horasProgEjec,
  },
  'cierre-semanas': {
    title: 'Cumplimiento de cierre por sede',
    desc: 'Cada coordinador cierra su sede tras la ejecución semanal. "Días tras fin" = días entre el sábado (fin de la semana) y la fecha de cierre. Período de gracia: 4 días — pasada esa ventana el sistema cierra automáticamente y aparece como "Auto (Sistema)".',
    cols: ['Semana', 'Sede', 'Coordinador', 'Fecha de cierre', 'Días tras fin', 'Estado'],
    meta: null,
    fn: informeService.cierreSemanas,
  },
}

/**
 * Dropdown de selección múltiple con checkboxes. Cerrado se ve igual que un
 * <select> (mismo estilo .input); abierto muestra la lista con checkboxes.
 */
function MultiSelect({ opciones, seleccionados, onChange, placeholder }) {
  const [open, setOpen] = useState(false)

  const resumen =
    seleccionados.length === 0
      ? placeholder
      : seleccionados.length === 1
        ? opciones.find((o) => o.value === seleccionados[0])?.label ?? placeholder
        : `${seleccionados.length} seleccionados`

  const toggle = (value) => {
    onChange(
      seleccionados.includes(value)
        ? seleccionados.filter((v) => v !== value)
        : [...seleccionados, value]
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="input text-left flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={seleccionados.length === 0 ? 'text-gray-400' : 'text-gray-900'}>{resumen}</span>
        <span className="text-gray-400 text-xs ml-2">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1">
            {opciones.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded"
                  checked={seleccionados.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Normaliza un valor string de una celda según la columna:
 *  - "Tipo" / "Tipo de recurso" → mapea al label oficial con tildes ("Oftalmólogo").
 *  - "Especialidad" → mapea al label oficial ("Oftalmología", "Diagnóstico", ...).
 *  - El resto → Title Case ("KAREN ROSSANA" o "karen rossana" → "Karen Rossana").
 */
function formatCelda(col, val) {
  const c = col.toLowerCase()
  if (c === 'tipo' || c === 'tipo de recurso') {
    return TIPOS_RECURSO.find((t) => t.value === val)?.label ?? titleCase(val)
  }
  if (c === 'especialidad') {
    return ESPECIALIDADES.find((e) => e.value === val)?.label ?? titleCase(val)
  }
  return titleCase(val)
}

export default function InformePage() {
  const { tipo = 'ocupacion' } = useParams()
  const cfg = CONFIG[tipo] ?? CONFIG.ocupacion
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const dashboardPath = user?.role === 'coordinador' ? '/app/dashboard-coord' : '/app/dashboard'

  const hoy = new Date()
  const [desde, setDesde] = useState(format(subWeeks(startOfWeek(hoy, { weekStartsOn: 1 }), 4), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(hoy, 'yyyy-MM-dd'))
  // semanaSel = id de la semana seleccionada en el dropdown (solo informes
  // marcados con cfg.porSemana). Vacío = "semana actual" según el backend.
  const [semanaSel, setSemanaSel] = useState('')
  // Arrays para soportar selección múltiple. Los informes no-ocupación
  // usan un <select> simple que setea un array de 0 o 1 elemento.
  const [sedesSel, setSedesSel] = useState([])
  const [tiposSel, setTiposSel] = useState([])
  // Panel expandible "Cómo se calcula" — solo aparece en informes de ausentismo.
  const [mostrarMetodologia, setMostrarMetodologia] = useState(false)

  // Sedes reales del backend. El coordinador solo ve las suyas.
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-informe'],
    queryFn: () => sedeService.list(),
  })
  const sedesDisponibles =
    user?.role === 'coordinador' && user?.sites?.length
      ? sedes.filter((s) => user.sites.includes(s.id))
      : sedes

  // Lista de semanas para el dropdown (solo si el informe es por-semana).
  const { data: semanasList = [] } = useQuery({
    queryKey: ['semanas-informe'],
    queryFn: () => semanaService.list(),
    enabled: !!cfg.porSemana,
  })

  const { data = [], isLoading } = useQuery({
    queryKey: ['informe', tipo, desde, hasta, semanaSel, sedesSel, tiposSel],
    queryFn: () =>
      cfg.fn({
        ...(cfg.porSemana
          ? (semanaSel ? { week_id: semanaSel } : {})
          : { desde, hasta }),
        site_id: sedesSel.length ? sedesSel.join(',') : undefined,
        resource_type: tiposSel.length ? tiposSel.join(',') : undefined,
      }),
  })

  // Wendy (gerencia) pidió consultorios en orden numérico natural
  // (1, 2, 3, ..., 10, 11) en lugar del orden por defecto del backend.
  // Para los demás informes respetamos el ranking del servidor.
  const dataOrdenada = tipo === 'ocupacion'
    ? [...data].sort((x, y) => compareNatural(Object.values(x)[0], Object.values(y)[0]))
    : data

  // Columnas visibles según rol: si el CONFIG define colsRestringidasACoord
  // y el usuario es coordinador, ocultamos esos índices (ago-2026: en el
  // informe de ausentismo, coord no ve Programadas/Imprevistas/Quejas).
  const indicesVisibles = cfg.cols.map((_, i) => i).filter((i) =>
    user?.role === 'coordinador' && cfg.colsRestringidasACoord?.has(i) ? false : true
  )
  const colsVisibles = indicesVisibles.map((i) => cfg.cols[i])

  // KPIs resumen — solo para informes de ausentismo (tienen columnas Programadas/Imprevistas/Quejas)
  const esAusentismo = tipo === 'ausentismo' || tipo === 'ausentismo-impacto'
  const puedeVerColsRestringidas = user?.role !== 'coordinador'
  const kpis = esAusentismo && puedeVerColsRestringidas ? {
    totalAusencias: dataOrdenada.reduce((a, r) => a + (r.absences ?? 0), 0),
    programadas: dataOrdenada.reduce((a, r) => a + (r.programadas ?? 0), 0),
    imprevistas: dataOrdenada.reduce((a, r) => a + (r.imprevistas ?? 0), 0),
    pacAfectados: dataOrdenada.reduce((a, r) => a + (r.pac_afectados ?? 0), 0),
    quejas: dataOrdenada.reduce((a, r) => a + (r.quejas ?? 0), 0),
    resources: dataOrdenada.length,
  } : null

  const exportar = async (formato) => {
    try {
      const params = {
        ...(cfg.porSemana
          ? (semanaSel ? { week_id: semanaSel } : {})
          : { desde, hasta }),
        site_id: sedesSel.length ? sedesSel.join(',') : undefined,
        resource_type: tiposSel.length ? tiposSel.join(',') : undefined,
      }
      const blob = await informeService.exportar(tipo, formato, params)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // En informes por-semana el nombre lleva la semana elegida (o "actual")
      const sufijoSemana =
        cfg.porSemana
          ? (semanaSel
              ? (semanasList.find((s) => s.id === semanaSel)
                  ? (semanasList.find((s) => s.id === semanaSel).start_date ?? semanasList.find((s) => s.id === semanaSel).startDate ?? '').slice(0, 10)
                  : 'semana')
              : 'actual')
          : `${desde}_${hasta}`
      a.download = `informe_${tipo}_${sufijoSemana}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Informe exportado en ${formato.toUpperCase()}`)
    } catch (err) {
      toast.error(err?.message ?? 'Error al exportar el informe')
    }
  }

  return (
    <div className="p-3 sm:p-4">
      <button className="text-xs text-brand-600 hover:underline mb-2" onClick={() => navigate(dashboardPath)}>
        ← Volver al dashboard
      </button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-1">
        <h1 className="text-base font-semibold text-gray-900">{cfg.title}</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn text-xs" onClick={() => exportar('pdf')}>📥 PDF</button>
          <button className="btn text-xs" onClick={() => exportar('excel')}>📊 Excel</button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">{cfg.desc}</p>

      {/* Filtros: informes "por semana" muestran un selector de semana en vez
          del rango Desde/Hasta (la ocupación se mide siempre por semana). */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cfg.porSemana ? (
            <div className="lg:col-span-2">
              <label className="label">Semana</label>
              <select
                className="input"
                value={semanaSel}
                onChange={(e) => setSemanaSel(e.target.value)}
              >
                <option value="">Semana actual (la que contiene hoy)</option>
                {semanasList.map((s) => {
                  const ini = (s.start_date ?? s.startDate ?? '').slice(0, 10)
                  const fin = (s.end_date ?? s.endDate ?? '').slice(0, 10)
                  return (
                    <option key={s.id} value={s.id}>
                      {ini} → {fin}{s.status === 'cerrada' ? ' · cerrada' : ' · abierta'}
                    </option>
                  )
                })}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Desde</label>
                <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div>
                <label className="label">Hasta</label>
                <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="label">Sede</label>
            <MultiSelect
              opciones={sedesDisponibles.map((s) => ({ value: s.id, label: s.name }))}
              seleccionados={sedesSel}
              onChange={setSedesSel}
              placeholder="Todas las sedes"
            />
          </div>
          {!cfg.sinFiltroTipo && (
            <div>
              <label className="label">Tipo de recurso</label>
              <MultiSelect
                opciones={TIPOS_RECURSO.map((t) => ({ value: t.value, label: t.label }))}
                seleccionados={tiposSel}
                onChange={setTiposSel}
                placeholder="Todos"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPIs resumen — solo para informes de ausentismo, y solo si el rol puede
          ver las columnas restringidas (gerencia/supervisor/directivo). */}
      {kpis && !isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <div className="card p-3" title="Recursos con al menos 1 ausencia confirmada en el período">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Recursos</div>
            <div className="text-lg font-semibold text-gray-900">{kpis.resources}</div>
            <div className="text-[10px] text-gray-400">con ausencias</div>
          </div>
          <div className="card p-3" title="Suma total de ausencias confirmadas del período">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Ausencias</div>
            <div className="text-lg font-semibold text-gray-900">{kpis.totalAusencias}</div>
            <div className="text-[10px] text-gray-400">confirmadas</div>
          </div>
          <div className="card p-3 border-l-4 border-l-green-400" title="Ausencias reportadas con MÁS de 15 días de anticipación (dio tiempo a reprogramar)">
            <div className="text-[10px] uppercase tracking-wide text-green-700 mb-1">📅 Programadas</div>
            <div className="text-lg font-semibold text-green-700">{kpis.programadas}</div>
            <div className="text-[10px] text-gray-400">&gt; 15 días anticipación</div>
          </div>
          <div className="card p-3 border-l-4 border-l-amber-400" title="Ausencias reportadas con 15 días o menos de anticipación (impacto operativo alto)">
            <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-1">⚡ Imprevistas</div>
            <div className="text-lg font-semibold text-amber-700">{kpis.imprevistas}</div>
            <div className="text-[10px] text-gray-400">≤ 15 días anticipación</div>
          </div>
          <div className="card p-3" title="Pacientes que quedaron sin atender por las ausencias del período (RN-18/19)">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Pac. afectados</div>
            <div className="text-lg font-semibold text-gray-900">{kpis.pacAfectados.toLocaleString('es-CO')}</div>
            <div className="text-[10px] text-gray-400">sin atención</div>
          </div>
          <div className="card p-3 border-l-4 border-l-red-400" title="Estimación de quejas: 9% de pacientes afectados si anticipación >30 días, 8% si ≤30 días. Por ausencia individual y luego sumadas.">
            <div className="text-[10px] uppercase tracking-wide text-red-700 mb-1">🎫 Quejas est.</div>
            <div className="text-lg font-semibold text-red-700">{kpis.quejas.toLocaleString('es-CO')}</div>
            <div className="text-[10px] text-gray-400">8% ó 9% de pac.</div>
          </div>
        </div>
      )}

      {/* Leyenda + botón "Cómo se calcula" — solo para ausentismo */}
      {esAusentismo && puedeVerColsRestringidas && (
        <div className="mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-medium mb-1">📖 Cómo leer este informe</div>
                <ul className="space-y-0.5 text-blue-800">
                  <li>• <strong>📅 Programada</strong>: ausencia reportada con <strong>MÁS de 15 días</strong> de anticipación (permite reprogramar pacientes con tiempo).</li>
                  <li>• <strong>⚡ Imprevista</strong>: ausencia reportada con <strong>15 días o menos</strong> de anticipación (impacto operativo alto).</li>
                  <li>• <strong>🎫 Quejas estimadas</strong>: <strong>9%</strong> de pacientes afectados si anticipación &gt;30 días, <strong>8%</strong> si ≤30 días. Redondeo estándar por ausencia individual.</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setMostrarMetodologia((v) => !v)}
                className="btn text-xs whitespace-nowrap"
                title="Ver la fórmula completa con ejemplos"
              >
                {mostrarMetodologia ? '▲ Ocultar' : 'ℹ️ Cómo se calcula'}
              </button>
            </div>
            {mostrarMetodologia && (
              <pre className="mt-3 p-3 bg-white/70 border border-blue-100 rounded text-[11px] text-gray-700 overflow-x-auto whitespace-pre font-mono leading-relaxed">
                {METODOLOGIA_AUSENTISMO}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : dataOrdenada.length === 0 ? (
          <EmptyState icon="📊" title="Sin datos para los filtros seleccionados" description="Ajusta el rango de fechas o los filtros para ver resultados." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50">
                  {colsVisibles.map((col) => {
                    // Tooltip explicativo — solo aplica a informes de ausentismo
                    const tooltip = esAusentismo ? TOOLTIPS_AUSENTISMO[col] : null
                    // Cabeceras nuevas con ícono para destacarlas visualmente
                    const label = col === 'Programadas' ? '📅 Programadas'
                      : col === 'Imprevistas' ? '⚡ Imprevistas'
                      : col === 'Quejas' ? '🎫 Quejas'
                      : col
                    return (
                      <th
                        key={col}
                        title={tooltip ?? undefined}
                        className={`px-3 py-2.5 text-left text-xs font-medium border-b border-gray-100 whitespace-nowrap ${tooltip ? 'text-gray-700 cursor-help border-b-dashed' : 'text-gray-500'}`}
                      >
                        {label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {dataOrdenada.map((row, i) => {
                  const pct = row.pct_ocupacion ?? row.pct_cumplimiento ?? row.pct_utilizacion
                  const semaforo = pct !== undefined
                    ? pct >= (cfg.meta ?? 80) ? 'green' : pct >= (cfg.meta ?? 80) - 10 ? 'amber' : 'red'
                    : null
                  const valores = Object.values(row)
                  // Detección de anomalías — solo en informes de ausentismo:
                  //  · días negativos = fechas corruptas (fin<inicio o typo en el año)
                  //  · ausencias con 0 días es sospechoso pero puede ser legítimo (mismo día)
                  const anomaliaDiasNegativos = esAusentismo && typeof row.dias === 'number' && row.dias < 0
                  const rowClass = anomaliaDiasNegativos
                    ? 'border-b border-red-100 bg-red-50/40 hover:bg-red-50 transition-colors'
                    : 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
                  return (
                    <tr key={i} className={rowClass} title={anomaliaDiasNegativos ? '⚠️ Alguna ausencia de este recurso tiene fechas corruptas (fin antes que inicio, o año mal escrito). Requiere corrección manual en el módulo de Ausencias.' : undefined}>
                      {indicesVisibles.map((origIdx, j) => {
                        const col = cfg.cols[origIdx]
                        const val = valores[origIdx]
                        const isSemaforo = j === indicesVisibles.length - 1 && semaforo
                        // Ícono de warning al lado del nombre si la fila tiene anomalía
                        const iconoWarning = anomaliaDiasNegativos && col === 'Recurso'
                          ? <span className="text-red-500 mr-1" title="⚠️ Fechas corruptas detectadas en al menos una ausencia">⚠️</span>
                          : null
                        // Badges visuales para las 3 columnas nuevas de ausentismo
                        const badgeCol =
                          col === 'Programadas' && typeof val === 'number'
                            ? (val > 0 ? <Badge variant="green">{val}</Badge> : <span className="text-gray-300">0</span>)
                          : col === 'Imprevistas' && typeof val === 'number'
                            ? (val > 0 ? <Badge variant="amber">{val}</Badge> : <span className="text-gray-300">0</span>)
                          : col === 'Quejas' && typeof val === 'number'
                            ? (val === 0 ? <span className="text-gray-300">0</span>
                              : val > 20 ? <Badge variant="red">{val}</Badge>
                              : <Badge variant="amber">{val}</Badge>)
                          : null
                        return (
                          <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {iconoWarning}
                            {isSemaforo ? (
                              <div className="flex items-center gap-1.5">
                                <Semaforo pct={val} metaVerde={cfg.meta ?? 80} />
                                <span className={semaforo === 'red' ? 'text-red-700 font-medium' : semaforo === 'amber' ? 'text-amber-700' : 'text-green-700 font-medium'}>
                                  {typeof val === 'number' ? formatPct(val) : val}
                                </span>
                              </div>
                            ) : badgeCol !== null ? (
                              badgeCol
                            ) : typeof val === 'number' && col.toLowerCase().includes('costo') ? (
                              formatCOP(val)
                            ) : typeof val === 'number' && col.toLowerCase().includes('hora') ? (
                              formatHoras(val)
                            ) : typeof val === 'number' && col.includes('%') ? (
                              formatPct(val)
                            ) : typeof val === 'string' ? formatCelda(col, val) : val ?? '—'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cfg.meta && (
        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="semaforo-g" />≥{cfg.meta}% (meta)</span>
          <span className="flex items-center gap-1"><span className="semaforo-a" />{cfg.meta - 10}–{cfg.meta - 1}%</span>
          <span className="flex items-center gap-1"><span className="semaforo-r" />&lt;{cfg.meta - 10}%</span>
        </div>
      )}
    </div>
  )
}
