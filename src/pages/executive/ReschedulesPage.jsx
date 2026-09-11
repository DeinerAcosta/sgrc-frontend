import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, PieChart, Pie, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, Legend, LabelList,
} from 'recharts'
import { format, startOfMonth, startOfYear, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { informeService, sedeService } from '@/services/api'
import { Spinner, EmptyState } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'
import focaLogo from '@/assets/brand/foca-azul.png'

// ============================================================================
// Fase 4 (sep-2026 · rediseño FOCA) — Dashboard Reprogramaciones
//
// Look inspirado en el tablero gerencial de FOCA: encabezado con logo, chip de
// gestion, segmentacion por mes con botones, 4 tabs, KPI cards grandes con
// numeros de colores, tarjetas de "Hallazgos que exigen decision" narrativas.
// TODOS los datos vienen del backend (endpoint /reprogramaciones-dashboard).
// ============================================================================

const FAMILIAS = [
  { value: 'reprogramacion_operativa', label: 'Reprogramación operativa', color: '#1e3a8a' },
  { value: 'ausencia_profesional',     label: 'Ausencia profesional',     color: '#f59e0b' },
  { value: 'ajuste_cupos',             label: 'Ajuste de cupos',          color: '#93c5fd' },
  { value: 'movilidad_regional',       label: 'Movilidad / Regional',     color: '#60a5fa' },
  { value: 'calendario_festivo',       label: 'Calendario / Festivo',     color: '#f97316' },
  { value: 'otros',                    label: 'Otros',                    color: '#94a3b8' },
]
const FAMILIA_COLOR = Object.fromEntries(FAMILIAS.map((f) => [f.value, f.color]))
const FAMILIA_LABEL = Object.fromEntries(FAMILIAS.map((f) => [f.value, f.label]))

const TIPO_LABEL = Object.fromEntries(TIPOS_RECURSO.map((t) => [t.value, t.label]))

const TABS = [
  { key: 'resumen',    label: 'Resumen ejecutivo' },
  { key: 'medicos',    label: 'Médicos' },
  { key: 'reposicion', label: 'Reposición & cobertura' },
  { key: 'causas',     label: 'Causas & especialidades' },
]

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_ES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const fmtNum = (n) => Number(n ?? 0).toLocaleString('es-CO')

// Rango: desde 1-ene del anio actual hasta hoy — "año calendario en curso".
// Cambia el mes con los botones de la segmentacion.
function rangoAnio() {
  const hoy = new Date()
  return {
    desde: format(startOfYear(hoy), 'yyyy-MM-dd'),
    hasta: format(hoy, 'yyyy-MM-dd'),
  }
}

// Header FOCA (estilo tablero gerencial: logo + titulo grande serif + chips)
function HeaderFOCA({ rango, totalEventos, totalPacientes }) {
  const gestion = useMemo(() => {
    const d = new Date(rango.desde)
    const h = new Date(rango.hasta)
    return `${MESES_ES_ABREV[d.getMonth()]}–${MESES_ES_ABREV[h.getMonth()]} ${h.getFullYear()}`
  }, [rango])
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
      <div className="w-16 h-16 bg-white border border-gray-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
        <img src={focaLogo} alt="FOCA" className="h-10 w-auto object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-widest uppercase text-brand-600 font-semibold">Central de citas</div>
        <div className="text-xl sm:text-2xl font-semibold text-gray-900 leading-tight">Reprogramación de agendas médicas</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700">
          Gestión: <strong className="text-gray-900">{gestion}</strong>
        </div>
        <div className="px-3 py-1.5 bg-amber-100 text-amber-900 rounded-full text-xs font-medium">
          {fmtNum(totalEventos)} eventos · {fmtNum(totalPacientes)} pac.
        </div>
      </div>
    </div>
  )
}

// Segmentacion por mes: "Todos" o un mes especifico del anio en curso.
function BannerSegmentacion({ mesActivo, setMesActivo, onRefresh }) {
  const hoy = new Date()
  const mesesDisponibles = Array.from({ length: hoy.getMonth() + 1 }, (_, i) => i)
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold shrink-0">
        Segmentación de tiempo
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5">
        <button
          onClick={() => setMesActivo(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mesActivo === null ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >Todos</button>
        {mesesDisponibles.map((m) => (
          <button
            key={m}
            onClick={() => setMesActivo(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mesActivo === m ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >{MESES_ES[m]}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="hidden sm:inline">
          Mes de gestión · <strong className="text-gray-800">{mesActivo === null ? 'Todos los meses' : MESES_ES[mesActivo]}</strong>
        </span>
        <button onClick={onRefresh} className="btn text-xs py-1 px-3">↻ Actualizar</button>
      </div>
    </div>
  )
}

// KPI grande estilo FOCA (numero enorme de color, label pequeno arriba).
function KpiFoca({ label, value, color = 'text-brand-800', sub, big = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold">{label}</div>
      <div className={`font-semibold ${big ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'} ${color} leading-none mt-2`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
    </div>
  )
}

// Panel con titulo serif + descripcion en gris + contenido.
function Panel({ eyebrow, title, description, children }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="text-[10px] tracking-widest uppercase text-brand-600 font-semibold">{eyebrow}</div>}
      <h2 className="font-semibold text-xl sm:text-2xl text-gray-900 mt-1">{title}</h2>
      {description && <p className="text-xs text-gray-600 mt-1 max-w-3xl">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

// Tarjeta de hallazgo gerencial (colores: red/amber/blue/green segun severidad)
function HallazgoCard({ eyebrow, title, body, color = 'red' }) {
  const COLORS = {
    red:   { border: 'border-l-red-500',   eye: 'text-red-600' },
    amber: { border: 'border-l-amber-500', eye: 'text-amber-600' },
    blue:  { border: 'border-l-blue-500',  eye: 'text-blue-600' },
    green: { border: 'border-l-green-500', eye: 'text-green-600' },
  }
  const c = COLORS[color] ?? COLORS.blue
  return (
    <div className={`bg-white rounded-lg border border-gray-100 border-l-4 ${c.border} p-3`}>
      <div className={`text-[10px] tracking-widest uppercase font-semibold ${c.eye}`}>{eyebrow}</div>
      <div className="font-semibold text-sm text-gray-900 mt-1">{title}</div>
      <div className="text-xs text-gray-600 mt-1 leading-relaxed">{body}</div>
    </div>
  )
}

// Tarjeta chart (fondo blanco, header + contenido)
function ChartCard({ title, description, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base sm:text-lg text-gray-900">{title}</h3>
          {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function ReprogramacionesPage() {
  const [tab, setTab] = useState('resumen')
  const [mesActivo, setMesActivo] = useState(null)  // null = todos, 0..11 = mes
  const [sedesSel] = useState([])
  const [familiasSel] = useState([])
  const [tiposSel] = useState([])

  // Rango efectivo: anio en curso, opcionalmente filtrado a un mes.
  const rango = useMemo(() => {
    const base = rangoAnio()
    if (mesActivo === null) return base
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), mesActivo, 1)
    const hasta = endOfMonth(desde)
    return {
      desde: format(desde, 'yyyy-MM-dd'),
      hasta: format(hasta, 'yyyy-MM-dd'),
    }
  }, [mesActivo])

  useQuery({
    queryKey: ['sedes-reprog'],
    queryFn: () => sedeService.list(),
    staleTime: 10 * 60 * 1000,
  })

  const params = useMemo(() => {
    const p = { desde: rango.desde, hasta: rango.hasta }
    if (sedesSel.length) p.site_id = sedesSel.join(',')
    if (familiasSel.length) p.family = familiasSel.join(',')
    if (tiposSel.length) p.resource_type = tiposSel.join(',')
    return p
  }, [rango, sedesSel, familiasSel, tiposSel])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reprogramaciones-dashboard', params],
    queryFn: () => informeService.reprogramacionesDashboard(params),
    keepPreviousData: true,
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Spinner /></div>
  }
  if (!data) {
    return <div className="p-4"><EmptyState title="Sin datos" description="Aún no hay reprogramaciones registradas en el rango seleccionado." /></div>
  }

  const k = data.kpis ?? {}
  const totalEventos = k.total_ausencias ?? 0
  const totalPac = k.patients_affected ?? 0

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto" style={{ background: '#eef1f7', minHeight: '100vh' }}>
      <HeaderFOCA rango={rango} totalEventos={totalEventos} totalPacientes={totalPac} />

      <BannerSegmentacion
        mesActivo={mesActivo}
        setMesActivo={setMesActivo}
        onRefresh={() => refetch()}
      />

      {/* Tabs — botones grandes estilo FOCA */}
      <div className="bg-white rounded-xl border border-gray-100 p-1.5 mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'resumen'    && <TabResumen data={data} />}
      {tab === 'medicos'    && <TabMedicos data={data} />}
      {tab === 'reposicion' && <TabReposicion data={data} />}
      {tab === 'causas'     && <TabCausas data={data} />}

      <div className="border-t border-gray-200 mt-8 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-gray-500">
        <div>
          Fuente: <strong>SGRC — tabla ausencias</strong> · datos en vivo del sistema, actualizados cada 60 s.
        </div>
        <div>Tablero analítico · uso interno gerencial · FOCA Fundación</div>
      </div>
    </div>
  )
}

// =============================================================================
// TAB 1 — Resumen ejecutivo
// =============================================================================
function TabResumen({ data }) {
  const k = data.kpis ?? {}
  const totalEventos = k.total_ausencias ?? 0
  const totalPac = k.patients_affected ?? 0
  const tasaRep = k.tasa_reposicion_pct ?? 0
  const sinCobertura = data.pacientes_sin_cobertura ?? 0
  const cubiertos = data.pacientes_cubiertos ?? 0
  const medicos = data.medicos_involucrados ?? 0
  const pctAntel = data.pct_antelacion_ok ?? 0
  const pctSinRep = 100 - tasaRep
  const promPorEvento = totalEventos > 0 ? (totalPac / totalEventos).toFixed(1) : '0'
  const mediaAntel = data.antelacion_reporte
    ? (function () {
        // Aproximacion: uso ponderado del bucket para calcular la mediana estimada
        const a = data.antelacion_reporte
        const total = a.retroactivo + a.uno + a.dos_a_siete + a.ocho_a_treinta + a.mas_30
        const acumulado = a.retroactivo * 0 + a.uno * 1 + a.dos_a_siete * 4 + a.ocho_a_treinta * 18 + a.mas_30 * 45
        return total > 0 ? Math.round(acumulado / total) : 0
      })()
    : 0

  const porMes = data.por_mes ?? []
  const dataPorMes = porMes.map((m) => ({
    mes: MESES_ES_ABREV[Number(m.mes.slice(5, 7)) - 1] ?? m.mes,
    pacientes: m.pacientes,
    eventos: m.count,
  }))

  const donutData = [
    { name: 'Repuestas', value: cubiertos, color: '#3b82f6' },
    { name: 'Sin reponer', value: sinCobertura, color: '#f97316' },
  ]
  const repuestasCount = (data.makeups?.aprobadas ?? 0) + (data.makeups?.realizadas ?? 0)
  const sinReponerCount = Math.max(0, totalEventos - repuestasCount)

  // Top medico y % del total
  const top3Pac = (data.por_recurso ?? []).slice(0, 3).reduce((s, r) => s + (r.pacientes ?? 0), 0)
  const pctTop3 = totalPac > 0 ? Math.round((top3Pac / totalPac) * 100) : 0

  // Causa raiz dominante
  const topFam = (data.por_familia ?? [])[0]
  const causaOperativaCount = (data.por_familia ?? []).find((f) => f.family === 'reprogramacion_operativa')?.count ?? 0
  const pctOperativa = totalEventos > 0 ? Math.round((causaOperativaCount / totalEventos) * 100) : 0

  return (
    <>
      <Panel
        eyebrow="Visión general"
        title="Pulso de la reprogramación de agendas"
        description="Reprogramaciones gestionadas en el rango seleccionado y su impacto en pacientes, cobertura y comportamiento operativo. Usa la segmentación superior para aislar un mes."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiFoca label="Reprogramaciones" value={fmtNum(totalEventos)} color="text-brand-800" sub="En la selección" />
          <KpiFoca label="Pacientes impactados" value={fmtNum(totalPac)} color="text-amber-600" sub={`${promPorEvento} por evento`} />
          <KpiFoca label="Tasa de reposición" value={`${tasaRep}%`} color="text-red-600" sub={`${pctSinRep}% no se repuso`} />
          <KpiFoca label="Pacientes sin cobertura" value={fmtNum(sinCobertura)} color="text-red-600" sub="Sin reagenda registrada" />
          <KpiFoca label="Médicos involucrados" value={fmtNum(medicos)} color="text-brand-800" sub="Profesionales distintos" />
          <KpiFoca label="Reporte con antelación" value={`${pctAntel}%`} color="text-blue-600" sub={`Mediana ${mediaAntel} días`} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <ChartCard
          title="Tendencia mensual de reprogramaciones"
          description="Barras = pacientes afectados · línea = nº de reprogramaciones · por mes de gestión"
          right={<span className="text-[10px] text-gray-400">clic para filtrar</span>}
        >
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={dataPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar yAxisId="left" dataKey="pacientes" fill="#1e3a8a" barSize={38} radius={[4, 4, 0, 0]} name="Pacientes" />
                <Line yAxisId="right" type="monotone" dataKey="eventos" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} name="Reprogramaciones" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="¿Se repuso la agenda?"
          description="Repuestas vs. no repuestas (en la selección)"
        >
          <div className="flex items-center gap-3">
            <div style={{ width: 130, height: 130 }} className="shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={2}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtNum(v) + ' pac.'} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs space-y-2 flex-1 min-w-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                  <strong className="text-blue-600">{fmtNum(repuestasCount)} repuestas</strong>
                </div>
                <div className="text-[11px] text-gray-500 ml-4">
                  {(k.tasa_reposicion_pct ?? 0)}% · {fmtNum(cubiertos)} pac.
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
                  <strong className="text-orange-600">{fmtNum(sinReponerCount)} sin reponer</strong>
                </div>
                <div className="text-[11px] text-gray-500 ml-4">
                  {pctSinRep}% · {fmtNum(sinCobertura)} pac.
                </div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      <Panel
        eyebrow="Lectura gerencial"
        title="Hallazgos que exigen decisión"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <HallazgoCard
            color="red"
            eyebrow="Brecha crítica"
            title={`${Math.round(pctSinRep / 33)} de cada 3 agendas no se reponen`}
            body={`${fmtNum(sinReponerCount)} de ${fmtNum(totalEventos)} reprogramaciones quedaron sin reposición, dejando ${fmtNum(sinCobertura)} pacientes sin reagenda registrada.`}
          />
          <HallazgoCard
            color="amber"
            eyebrow="Concentración"
            title="Carga muy concentrada"
            body={`Los 3 profesionales con más eventos generan el ${pctTop3}% del impacto en pacientes. Revisar modelo de agenda y causa estructural.`}
          />
          <HallazgoCard
            color="blue"
            eyebrow="Causa raíz"
            title={topFam?.family === 'reprogramacion_operativa' ? 'Mayoría operativa, no clínica' : `Predomina: ${topFam?.label ?? '—'}`}
            body={`Las reprogramaciones operativas (cambio horario, formato) suman ${fmtNum(causaOperativaCount)} eventos: ${pctOperativa}% del total, en gran parte planificables.`}
          />
          <HallazgoCard
            color="blue"
            eyebrow="Antelación"
            title="El aviso llega a tiempo"
            body={`El ${pctAntel}% de los reportes se hace con antelación (mediana ${mediaAntel} días). El cuello de botella es reponer, no avisar.`}
          />
          <HallazgoCard
            color="amber"
            eyebrow="Pacientes"
            title="Impacto por evento"
            body={`Cada reprogramación afecta en promedio ${promPorEvento} pacientes en esta selección.`}
          />
          <HallazgoCard
            color="green"
            eyebrow="Cobertura"
            title="Pacientes cubiertos"
            body={`Solo ${fmtNum(cubiertos)} pacientes quedaron en agendas repuestas frente a ${fmtNum(sinCobertura)} sin cobertura.`}
          />
        </div>
      </Panel>
    </>
  )
}

// =============================================================================
// TAB 2 — Médicos
// =============================================================================
function TabMedicos({ data }) {
  const rec = data.por_recurso ?? []
  const totalPac = data.kpis?.patients_affected ?? 0
  const top3Pac = rec.slice(0, 3).reduce((s, r) => s + (r.pacientes ?? 0), 0)
  const pctTop3 = totalPac > 0 ? Math.round((top3Pac / totalPac) * 100) : 0
  const lider = rec[0]

  // Mejor reposicion: el que tenga mayor approved / count (min 3 eventos)
  const mejorRep = [...rec].filter((r) => (r.count ?? 0) >= 3)
    .map((r) => ({ ...r, ratio: r.count > 0 ? r.approved_makeups / r.count : 0 }))
    .sort((a, b) => b.ratio - a.ratio)[0]

  // Ordenar por pacientes, top 12
  const top12 = [...rec].sort((a, b) => (b.pacientes ?? 0) - (a.pacientes ?? 0)).slice(0, 12).reverse()

  return (
    <>
      <Panel
        eyebrow="Profundización · Médicos"
        title="Concentración y reposición por profesional"
        description="Quién genera el mayor impacto en pacientes y qué tan frecuentemente repone su agenda. Barra = eventos, segmentada entre repuestos y no repuestos."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiFoca label="Top 3 médicos" value={`${pctTop3}%`} color="text-amber-600" sub="de los pacientes afectados" />
          <KpiFoca label="Líder de impacto" value={lider?.name?.split(' ')[0] ?? '—'} color="text-red-600" sub={`${fmtNum(lider?.pacientes ?? 0)} pac · ${lider?.count > 0 ? Math.round((lider.approved_makeups / lider.count) * 100) : 0}% repone`} />
          <KpiFoca label="Mejor reposición" value={mejorRep?.name?.split(' ')[0] ?? '—'} color="text-blue-600" sub={`${mejorRep?.approved_makeups ?? 0} de ${mejorRep?.count ?? 0} repuestos`} />
          <KpiFoca label="Médicos en selección" value={fmtNum(data.medicos_involucrados ?? 0)} color="text-brand-800" sub="distribución asimétrica" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <ChartCard
          title="Eventos por médico — ¿repuso o no?"
          description="Azul = repuestos · coral = sin reponer · ordenado por pacientes afectados"
        >
          <div style={{ width: '100%', height: Math.max(220, top12.length * 28) }}>
            <ResponsiveContainer>
              <BarChart data={top12} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="approved_makeups" stackId="a" fill="#3b82f6" name="Repuestos" />
                <Bar dataKey={(r) => Math.max(0, (r.count ?? 0) - (r.approved_makeups ?? 0))} stackId="a" fill="#f97316" name="Sin reponer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="space-y-3">
          <div className="bg-brand-800 text-white rounded-xl p-4">
            <div className="text-[10px] tracking-widest uppercase text-white/70 font-semibold">Caso prioritario</div>
            <div className="font-semibold text-2xl mt-1">{lider?.name ?? '—'}</div>
            <div className="text-[11px] text-white/60 mt-0.5">{lider?.count ?? 0} eventos en la selección</div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{lider?.count ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Eventos</div>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{fmtNum(lider?.pacientes ?? 0)}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Pacientes</div>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{lider?.count > 0 ? Math.round((lider.approved_makeups / lider.count) * 100) : 0}%</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Repone</div>
              </div>
            </div>
            <div className="text-[11px] text-white/70 mt-3 leading-relaxed">
              Mayor generador de impacto en la selección. Revisar contrato, modelo de agenda y causa estructural de los cambios.
            </div>
          </div>

          {mejorRep && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-[10px] tracking-widest uppercase text-blue-700 font-semibold">Recomendación</div>
              <div className="font-semibold text-base text-gray-900 mt-1">Replicar a quienes sí reponen</div>
              <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                <strong>{mejorRep.name}</strong> repuso {mejorRep.approved_makeups} de {mejorRep.count} eventos. Documentar el modelo y estandarizarlo como protocolo de reposición.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// =============================================================================
// TAB 3 — Reposición & cobertura
// =============================================================================
function TabReposicion({ data }) {
  const cubiertos = data.pacientes_cubiertos ?? 0
  const sinCob = data.pacientes_sin_cobertura ?? 0
  const ratio = cubiertos > 0 ? (sinCob / cubiertos).toFixed(1) : '∞'
  const total = cubiertos + sinCob
  const pctCub = total > 0 ? (cubiertos / total) * 100 : 0

  const porSede = data.por_sede ?? []
  const sla = data.sla_reposicion ?? {}
  const antel = data.antelacion_reporte ?? {}

  const dataSede = porSede.map((s) => ({ name: s.name, pct: s.pct }))
  const dataSla = [
    { name: 'Adelantada', value: sla.adelantada ?? 0, color: '#3b82f6' },
    { name: 'Mismo día',  value: sla.mismo_dia ?? 0,  color: '#1e3a8a' },
    { name: '1-7 d',      value: sla.uno_a_siete ?? 0, color: '#93c5fd' },
    { name: '8-30 d',     value: sla.ocho_a_treinta ?? 0, color: '#1e3a8a' },
    { name: '>30 d',      value: sla.mas_30 ?? 0, color: '#1e3a8a' },
  ]
  const dataAntel = [
    { name: 'Retroact.', value: antel.retroactivo ?? 0, color: '#f97316' },
    { name: '≤1 día',    value: antel.uno ?? 0,          color: '#f59e0b' },
    { name: '2-7 d',     value: antel.dos_a_siete ?? 0,  color: '#1e3a8a' },
    { name: '8-30 d',    value: antel.ocho_a_treinta ?? 0, color: '#1e3a8a' },
    { name: '>30 d',     value: antel.mas_30 ?? 0,         color: '#1e3a8a' },
  ]

  return (
    <>
      <Panel
        eyebrow="Profundización · Cobertura"
        title="La brecha de reposición"
        description="La organización avisa a tiempo, pero no siempre logra reponer. Aquí se contrasta el impacto cubierto frente al no cubierto y la oportunidad de la reposición."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="font-semibold text-lg text-gray-900 mb-3">Pacientes: cubiertos vs. sin cobertura</div>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="font-semibold text-4xl text-blue-600">{fmtNum(cubiertos)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Con reposición</div>
              </div>
              <div className="text-2xl text-gray-300 font-semibold">vs</div>
              <div className="text-center">
                <div className="font-semibold text-4xl text-orange-600">{fmtNum(sinCob)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Sin cobertura</div>
              </div>
            </div>
            <div className="mt-4 h-2 bg-orange-500 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${pctCub}%` }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-2">
              Por cada paciente cuya agenda se repuso, <strong className="text-orange-600">{ratio} pacientes</strong> quedaron sin reagenda registrada.
            </div>
          </div>

          <ChartCard
            title="Tasa de reposición por sede"
            description="% de eventos repuestos sobre el total de cada sede"
          >
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={dataSede}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {dataSede.map((d, i) => (
                      <Cell key={i} fill={d.pct >= 80 ? '#3b82f6' : d.pct >= 50 ? '#f59e0b' : '#f97316'} />
                    ))}
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: '#475569' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard
          title="Oportunidad de la reposición (SLA)"
          description="Cuándo se repone respecto a la fecha de ausencia · solo eventos repuestos"
        >
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={dataSla}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {dataSla.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Antelación del reporte"
          description="Días entre el reporte y la fecha de la cita"
        >
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={dataAntel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {dataAntel.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </>
  )
}

// =============================================================================
// TAB 4 — Causas & especialidades
// =============================================================================
function TabCausas({ data }) {
  const totalEventos = data.kpis?.total_ausencias ?? 0
  const familias = data.por_familia ?? []
  const donut = familias.map((f) => ({
    name: f.label,
    value: f.count,
    pac: f.pacientes,
    color: FAMILIA_COLOR[f.family] ?? '#94a3b8',
  }))

  const topMotivos = (data.top_motivos ?? []).map((m) => ({
    name: (m.name ?? m.code ?? '').charAt(0).toUpperCase() + (m.name ?? m.code ?? '').slice(1),
    count: m.count,
  })).reverse()

  const porEsp = (data.por_especialidad ?? []).map((e) => ({
    name: TIPO_LABEL[e.type] ?? e.type,
    pacientes: e.pacientes ?? 0,
  })).reverse()

  const porSub = data.por_subespecialidad ?? []
  const topSub = porSub.slice(0, 10).map((s) => ({
    name: s.specialty,
    pacientes: s.pacientes ?? 0,
  })).reverse()

  const cruceTop = porSub.slice(0, 10).map((s) => ({
    name: `${TIPO_LABEL[s.type] ?? s.type} · ${s.specialty}`,
    pacientes: s.pacientes ?? 0,
  })).reverse()

  const dias = data.por_dia_semana ?? []
  const LABELS_DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const maxDia = Math.max(...dias.map((d) => d.pacientes ?? 0), 0)
  const dataDow = dias.map((d, i) => ({
    name: LABELS_DOW[i],
    pacientes: d.pacientes ?? 0,
    eventos: d.count ?? 0,
    color: (d.pacientes ?? 0) === maxDia ? '#f97316' : '#1e3a8a',
  }))

  return (
    <>
      <Panel
        eyebrow="Profundización · Operación"
        title="Causas, especialidades y subespecialidades"
        description="De dónde nacen las reprogramaciones y dónde golpean. Distinguir lo operativo de la ausencia profesional real cambia las palancas de acción."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCard title="Naturaleza de la reprogramación" description="Eventos por causa raíz">
            <div className="flex items-start gap-3">
              <div style={{ width: 180, height: 180 }} className="shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => `${v} eventos · ${p.payload.pac} pac.`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1 text-xs min-w-0">
                {donut.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="truncate text-gray-700">{d.name}</span>
                    </div>
                    <span className="text-gray-500 text-[11px] shrink-0">
                      {d.value} · <span className="tabular-nums">{fmtNum(d.pac)} pac.</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Motivos específicos más frecuentes" description="Nº de eventos por tipo de ausencia">
            <div style={{ width: '100%', height: Math.max(200, topMotivos.length * 24) }}>
              <ResponsiveContainer>
                <BarChart data={topMotivos} layout="vertical" margin={{ top: 5, right: 45, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1e3a8a" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: '#475569' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ChartCard title="Impacto por especialidad" description="Pacientes afectados">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={porEsp} layout="vertical" margin={{ top: 5, right: 45, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Impacto por subespecialidad" description="Pacientes afectados · top subespecialidades">
          <div style={{ width: '100%', height: Math.max(220, topSub.length * 24) }}>
            <ResponsiveContainer>
              <BarChart data={topSub} layout="vertical" margin={{ top: 5, right: 45, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Patrón por día de la semana" description="Barras = pacientes · línea = nº de reprogramaciones">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={dataDow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar yAxisId="left" dataKey="pacientes" barSize={32} radius={[4, 4, 0, 0]} name="Pacientes">
                  {dataDow.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="eventos" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Reprogramaciones" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Especialidad × subespecialidad" description="Mayor detalle del top de impacto">
          <div style={{ width: '100%', height: Math.max(220, cruceTop.length * 24) }}>
            <ResponsiveContainer>
              <BarChart data={cruceTop} layout="vertical" margin={{ top: 5, right: 45, left: 150, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" fill="#1e3a8a" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </>
  )
}
