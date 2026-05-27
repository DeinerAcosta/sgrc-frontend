import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { informeService, sedeService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner, Badge, Semaforo, EmptyState } from '@/components/ui'
import { formatPct, formatCOP, formatHoras, TIPOS_RECURSO } from '@/utils/helpers'
import { format, subWeeks, startOfWeek } from 'date-fns'
import toast from 'react-hot-toast'

const CONFIG = {
  ocupacion: {
    titulo: 'Ocupación de consultorios',
    desc: 'Horas asignadas vs horas disponibles por consultorio y sede.',
    cols: ['Consultorio', 'Sede', 'Especialidad', 'Horas asignadas', 'Horas base', '% Ocupación'],
    meta: 80,
    fn: informeService.ocupacion,
  },
  productividad: {
    titulo: 'Productividad por recurso',
    desc: 'Horas y pacientes programados vs ejecutados por recurso.',
    cols: ['Recurso', 'Tipo', 'Sede', 'H. programadas', 'H. ejecutadas', 'Pac. programados', 'Pac. atendidos', '% Cumplimiento'],
    meta: 85,
    fn: informeService.productividad,
  },
  ausentismo: {
    titulo: 'Ausentismo y ranking',
    desc: 'Ranking de recursos por número de ausencias, pacientes afectados y costo estimado.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Ausencias', 'Días', 'Pac. afectados', 'Costo estimado', 'Quejas'],
    meta: null,
    fn: informeService.ausentismo,
  },
  subutilizacion: {
    titulo: 'Recursos subutilizados',
    desc: 'Recursos con horas disponibles sin asignar. Meta: ≥90% utilización para auxiliares y optómetras.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Horas asignadas', 'Horas disponibles', '% Utilización', 'Semanas consecutivas'],
    meta: 90,
    fn: informeService.subutilizacion,
  },
  impacto: {
    titulo: 'Impacto económico de ausencias',
    desc: 'Costo de oportunidad y costos operativos por ausencias.',
    cols: ['Recurso', 'Fecha', 'Tipo', 'Pac. afectados', 'Costo oportunidad', 'Costo personal', 'Costo reprogramación', 'Total'],
    meta: null,
    fn: informeService.impacto,
  },
  'ausentismo-impacto': {
    titulo: 'Ausentismo e impacto económico',
    desc: 'Ranking de ausencias por recurso con su impacto económico: pacientes afectados y costos.',
    cols: ['Recurso', 'Tipo', 'Sede', 'Ausencias', 'Días', 'Pac. afectados', 'Costo oportunidad', 'Costo personal', 'Costo total'],
    meta: null,
    fn: informeService.ausentismoImpacto,
  },
  'horas-prog-ejec': {
    titulo: 'Horas programadas vs ejecutadas',
    desc: 'Comparación entre lo que se programó y lo que realmente se ejecutó por sede y semana. Meta: ≥85% de cumplimiento.',
    cols: ['Sede', 'Semana', 'H. programadas', 'H. ejecutadas', 'Diferencia', '% Cumplimiento'],
    meta: 85,
    fn: informeService.horasProgEjec,
  },
  'cierre-semanas': {
    titulo: 'Cumplimiento de cierre de semanas',
    desc: 'Quién cerró cada semana, cuándo y si fue a tiempo (cerrada en o antes del inicio de la semana).',
    cols: ['Semana', 'Coordinador', 'Fecha de cierre', 'Días anticipación', 'Estado'],
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

export default function InformePage() {
  const { tipo = 'ocupacion' } = useParams()
  const cfg = CONFIG[tipo] ?? CONFIG.ocupacion
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const dashboardPath = user?.rol === 'coordinador' ? '/app/dashboard-coord' : '/app/dashboard'

  const hoy = new Date()
  const [desde, setDesde] = useState(format(subWeeks(startOfWeek(hoy, { weekStartsOn: 1 }), 4), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(hoy, 'yyyy-MM-dd'))
  // Arrays para soportar selección múltiple. Los informes no-ocupación
  // usan un <select> simple que setea un array de 0 o 1 elemento.
  const [sedesSel, setSedesSel] = useState([])
  const [tiposSel, setTiposSel] = useState([])

  // Sedes reales del backend. El coordinador solo ve las suyas.
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-informe'],
    queryFn: () => sedeService.list(),
  })
  const sedesDisponibles =
    user?.rol === 'coordinador' && user?.sedes?.length
      ? sedes.filter((s) => user.sedes.includes(s.id))
      : sedes

  const { data = [], isLoading } = useQuery({
    queryKey: ['informe', tipo, desde, hasta, sedesSel, tiposSel],
    queryFn: () =>
      cfg.fn({
        desde,
        hasta,
        sede_id: sedesSel.length ? sedesSel.join(',') : undefined,
        tipo_recurso: tiposSel.length ? tiposSel.join(',') : undefined,
      }),
  })

  const exportar = async (formato) => {
    try {
      const blob = await informeService.exportar(tipo, formato, {
        desde,
        hasta,
        sede_id: sedesSel.length ? sedesSel.join(',') : undefined,
        tipo_recurso: tiposSel.length ? tiposSel.join(',') : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `informe_${tipo}_${desde}_${hasta}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Informe exportado en ${formato.toUpperCase()}`)
    } catch (err) {
      toast.error(err?.message ?? 'Error al exportar el informe')
    }
  }

  return (
    <div className="p-4">
      <button className="text-xs text-brand-600 hover:underline mb-2" onClick={() => navigate(dashboardPath)}>
        ← Volver al dashboard
      </button>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-base font-semibold text-gray-900">{cfg.titulo}</h1>
        <div className="flex gap-2">
          <button className="btn text-xs" onClick={() => exportar('pdf')}>📥 PDF</button>
          <button className="btn text-xs" onClick={() => exportar('excel')}>📊 Excel</button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">{cfg.desc}</p>

      {/* Filtros — mismo grid de 4 columnas de siempre */}
      <div className="card mb-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label">Desde</label>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <label className="label">Sede</label>
            <MultiSelect
              opciones={sedesDisponibles.map((s) => ({ value: s.id, label: s.nombre }))}
              seleccionados={sedesSel}
              onChange={setSedesSel}
              placeholder="Todas las sedes"
            />
          </div>
          <div>
            <label className="label">Tipo de recurso</label>
            <MultiSelect
              opciones={TIPOS_RECURSO.map((t) => ({ value: t.value, label: t.label }))}
              seleccionados={tiposSel}
              onChange={setTiposSel}
              placeholder="Todos"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : data.length === 0 ? (
          <EmptyState icon="📊" title="Sin datos para los filtros seleccionados" description="Ajusta el rango de fechas o los filtros para ver resultados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {cfg.cols.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const pct = row.pct_ocupacion ?? row.pct_cumplimiento ?? row.pct_utilizacion
                  const semaforo = pct !== undefined
                    ? pct >= (cfg.meta ?? 80) ? 'green' : pct >= (cfg.meta ?? 80) - 10 ? 'amber' : 'red'
                    : null
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      {cfg.cols.map((col, j) => {
                        const val = Object.values(row)[j]
                        const isSemaforo = j === cfg.cols.length - 1 && semaforo
                        return (
                          <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {isSemaforo ? (
                              <div className="flex items-center gap-1.5">
                                <Semaforo pct={val} metaVerde={cfg.meta ?? 80} />
                                <span className={semaforo === 'red' ? 'text-red-700 font-medium' : semaforo === 'amber' ? 'text-amber-700' : 'text-green-700 font-medium'}>
                                  {typeof val === 'number' ? formatPct(val) : val}
                                </span>
                              </div>
                            ) : typeof val === 'number' && col.toLowerCase().includes('costo') ? (
                              formatCOP(val)
                            ) : typeof val === 'number' && col.toLowerCase().includes('hora') ? (
                              formatHoras(val)
                            ) : typeof val === 'number' && col.includes('%') ? (
                              formatPct(val)
                            ) : val ?? '—'}
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
