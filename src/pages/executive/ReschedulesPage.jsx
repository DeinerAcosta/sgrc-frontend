import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, Legend,
} from 'recharts'
import { format, subMonths, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { informeService, sedeService } from '@/services/api'
import { Spinner, EmptyState, KpiCard, Badge, SectionHeader } from '@/components/ui'
import { TIPOS_RECURSO, formatCOP } from '@/utils/helpers'

// ============================================================================
// Fase 4 · Dashboard "Reprogramaciones" (ago-2026)
//
// 4 tabs internas replicando el tablero FOCA:
//   1. Resumen ejecutivo
//   2. Médicos
//   3. Reposición & cobertura
//   4. Causas & especialidades
//
// Filtros globales compartidos: rango (default 3 meses), sedes, familias, tipos.
// Un solo endpoint agregado + cache 60s.
// ============================================================================

const FAMILIAS = [
  { value: 'ausencia_profesional',     label: 'Ausencia profesional',     color: '#ef4444' },
  { value: 'reprogramacion_operativa', label: 'Reprogramación operativa', color: '#3b82f6' },
  { value: 'ajuste_cupos',             label: 'Ajuste de cupos',          color: '#22c55e' },
  { value: 'movilidad_regional',       label: 'Movilidad / Regional',     color: '#f59e0b' },
  { value: 'calendario_festivo',       label: 'Calendario / Festivo',     color: '#64748b' },
  { value: 'otros',                    label: 'Otros',                    color: '#9ca3af' },
]
const FAMILIA_COLOR = Object.fromEntries(FAMILIAS.map((f) => [f.value, f.color]))
const FAMILIA_LABEL = Object.fromEntries(FAMILIAS.map((f) => [f.value, f.label]))

const TIPO_LABEL = Object.fromEntries(TIPOS_RECURSO.map((t) => [t.value, t.label]))

const TABS = [
  { key: 'resumen',      label: 'Resumen ejecutivo' },
  { key: 'medicos',      label: 'Médicos' },
  { key: 'reposicion',   label: 'Reposición & cobertura' },
  { key: 'causas',       label: 'Causas & especialidades' },
]

// Rango por defecto: últimos 3 meses hasta hoy
function rangoDefault() {
  const hoy = new Date()
  return {
    desde: format(startOfMonth(subMonths(hoy, 2)), 'yyyy-MM-dd'),
    hasta: format(hoy, 'yyyy-MM-dd'),
  }
}

export default function ReprogramacionesPage() {
  const [tab, setTab] = useState('resumen')
  const [{ desde, hasta }, setRango] = useState(rangoDefault)
  const [sedesSel, setSedesSel] = useState([])       // [] = todas
  const [familiasSel, setFamiliasSel] = useState([]) // [] = todas
  const [tiposSel, setTiposSel] = useState([])       // [] = todos

  // Sedes disponibles (para el multiselect)
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-reprog'],
    queryFn: () => sedeService.list(),
    staleTime: 10 * 60 * 1000,
  })

  // Params al backend — el endpoint acepta CSV
  const params = useMemo(() => {
    const p = { desde, hasta }
    if (sedesSel.length) p.site_id = sedesSel.join(',')
    if (familiasSel.length) p.family = familiasSel.join(',')
    if (tiposSel.length) p.resource_type = tiposSel.join(',')
    return p
  }, [desde, hasta, sedesSel, familiasSel, tiposSel])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reprogramaciones-dashboard', params],
    queryFn: () => informeService.reprogramacionesDashboard(params),
    staleTime: 30 * 1000,
  })

  const rangoTxt = data?.rango
    ? `${format(new Date(data.rango.desde), 'd MMM yyyy', { locale: es })} — ${format(new Date(data.rango.hasta), 'd MMM yyyy', { locale: es })}`
    : ''

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* HEADER */}
      <div>
        <h1 className="text-base font-semibold text-gray-900">📊 Reprogramaciones</h1>
        <p className="text-xs text-gray-500">
          Dashboard gerencial de ausencias, causas y reposiciones · {rangoTxt}
          {isFetching && <span className="ml-2 text-brand-600">actualizando…</span>}
        </p>
      </div>

      {/* FILTROS GLOBALES */}
      <div className="card p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label text-xs">Desde</label>
            <input
              type="date"
              className="input text-xs"
              value={desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            />
          </div>
          <div>
            <label className="label text-xs">Hasta</label>
            <input
              type="date"
              className="input text-xs"
              value={hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              min={desde}
            />
          </div>
          <MultiSelectField
            label="Sedes"
            values={sedesSel}
            options={sedes.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSedesSel}
            allLabel="Todas las sedes"
          />
          <MultiSelectField
            label="Tipo de recurso"
            values={tiposSel}
            options={TIPOS_RECURSO.map((t) => ({ value: t.value, label: t.label }))}
            onChange={setTiposSel}
            allLabel="Todos los tipos"
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-500 mb-1">Familia:</div>
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle active={familiasSel.length === 0} onClick={() => setFamiliasSel([])} label="Todas" />
            {FAMILIAS.map((f) => (
              <ChipToggle
                key={f.value}
                active={familiasSel.includes(f.value)}
                onClick={() =>
                  setFamiliasSel((prev) => prev.includes(f.value)
                    ? prev.filter((v) => v !== f.value)
                    : [...prev, f.value]
                  )
                }
                label={f.label}
                dotColor={f.color}
              />
            ))}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !data ? (
        <EmptyState icon="📊" title="Sin datos" description="No se pudo cargar el dashboard." />
      ) : tab === 'resumen'    ? <TabResumen data={data} />
        : tab === 'medicos'    ? <TabMedicos data={data} />
        : tab === 'reposicion' ? <TabReposicion data={data} />
        : tab === 'causas'     ? <TabCausas data={data} />
        : null}
    </div>
  )
}

// ============================================================================
// TAB 1 · Resumen ejecutivo
// ============================================================================
function TabResumen({ data }) {
  const { kpis, por_mes, por_familia, top_motivos } = data
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Ausencias" value={kpis.total_ausencias} />
        <KpiCard label="Días perdidos" value={kpis.dias_perdidos} />
        <KpiCard label="Pacientes impactados" value={kpis.patients_affected} color={kpis.patients_affected > 0 ? 'danger' : 'default'} />
        <KpiCard label="Costo oportunidad" value={formatCOP(kpis.opportunity_cost)} />
        <KpiCard label="Tasa reposición" value={`${kpis.tasa_reposicion_pct}%`} color={kpis.tasa_reposicion_pct >= 50 ? 'success' : kpis.tasa_reposicion_pct >= 30 ? 'warning' : 'danger'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolución mensual */}
        <div className="card">
          <SectionHeader title="Evolución mensual" subtitle="Ausencias por mes en el rango" />
          {por_mes.length === 0 ? (
            <EmptyState icon="📈" title="Sin datos" description="No hay ausencias en el rango." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={por_mes} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="count" stroke="#1B2A6C" name="Ausencias" strokeWidth={2} />
                <Line type="monotone" dataKey="pacientes" stroke="#ef4444" name="Pacientes" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie por familia */}
        <div className="card">
          <SectionHeader title="Distribución por familia" subtitle="5 causas raíz FOCA" />
          {por_familia.length === 0 ? (
            <EmptyState icon="🥧" title="Sin datos" description="Sin familias registradas en el rango." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={por_familia}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  label={(entry) => `${entry.pct}%`}
                >
                  {por_familia.map((f, i) => (
                    <Cell key={i} fill={FAMILIA_COLOR[f.family] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [v, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top motivos */}
      <div className="card">
        <SectionHeader title="Top 10 motivos" subtitle="Con más ocurrencias en el rango" />
        {top_motivos.length === 0 ? (
          <EmptyState icon="🏷" title="Sin motivos" description="Sin datos en el rango." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, top_motivos.length * 28)}>
            <BarChart data={top_motivos} layout="vertical" margin={{ left: 120, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Ausencias">
                {top_motivos.map((m, i) => (
                  <Cell key={i} fill={FAMILIA_COLOR[m.family] ?? '#9ca3af'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TAB 2 · Médicos
// ============================================================================
function TabMedicos({ data }) {
  const { por_recurso } = data
  const [filtroTipo, setFiltroTipo] = useState('')

  const filtrados = filtroTipo ? por_recurso.filter((r) => r.type === filtroTipo) : por_recurso
  const top = filtrados.slice(0, 15)

  return (
    <div className="space-y-4">
      <div className="card">
        <SectionHeader
          title="Ranking por días de ausencia"
          subtitle="Top 15 profesionales del rango"
          action={
            <select className="input w-auto text-xs" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          }
        />
        {top.length === 0 ? (
          <EmptyState icon="🩺" title="Sin médicos" description="Sin ausencias en el rango." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, top.length * 30)}>
            <BarChart data={top} layout="vertical" margin={{ left: 130, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={130} />
              <Tooltip />
              <Bar dataKey="dias" fill="#1B2A6C" radius={[0, 4, 4, 0]} name="Días" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <SectionHeader title="Detalle por profesional" subtitle={`${filtrados.length} profesionales`} />
        {filtrados.length === 0 ? (
          <EmptyState icon="📋" title="Sin datos" description="Sin profesionales con ausencias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left px-2 py-2">Profesional</th>
                  <th className="text-left px-2 py-2">Tipo</th>
                  <th className="text-right px-2 py-2">Ausencias</th>
                  <th className="text-right px-2 py-2">Días</th>
                  <th className="text-right px-2 py-2">Pacientes</th>
                  <th className="text-right px-2 py-2">Reposiciones</th>
                  <th className="text-right px-2 py-2">Tasa</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const tasa = r.count > 0 ? Math.round((r.approved_makeups / r.count) * 100) : 0
                  return (
                    <tr key={r.resource_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-2 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="px-2 py-2 text-gray-500">{TIPO_LABEL[r.type] ?? r.type ?? '—'}</td>
                      <td className="px-2 py-2 text-right">{r.count}</td>
                      <td className="px-2 py-2 text-right">{r.dias}</td>
                      <td className="px-2 py-2 text-right">{r.pacientes}</td>
                      <td className="px-2 py-2 text-right">{r.approved_makeups}</td>
                      <td className="px-2 py-2 text-right">
                        <Badge variant={tasa >= 50 ? 'green' : tasa >= 30 ? 'amber' : 'gray'}>{tasa}%</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TAB 3 · Reposición & cobertura
// ============================================================================
function TabReposicion({ data }) {
  const { makeups: reposiciones } = data
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Solicitadas" value={reposiciones.solicitadas} />
        <KpiCard label="Aprobadas" value={reposiciones.aprobadas} color="success" />
        <KpiCard label="Rechazadas" value={reposiciones.rechazadas} color={reposiciones.rechazadas > 0 ? 'danger' : 'default'} />
        <KpiCard label="Realizadas" value={reposiciones.realizadas} />
        <KpiCard label="% Aprobación" value={`${reposiciones.pct_aprobacion}%`} color={reposiciones.pct_aprobacion >= 70 ? 'success' : reposiciones.pct_aprobacion >= 40 ? 'warning' : 'danger'} />
        <KpiCard label="Tiempo medio" value={reposiciones.tiempo_medio_aprobacion_h != null ? `${reposiciones.tiempo_medio_aprobacion_h}h` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <SectionHeader title="Evolución mensual" subtitle="Solicitadas vs aprobadas" />
          {reposiciones.por_mes.length === 0 || reposiciones.solicitadas === 0 ? (
            <EmptyState icon="🔁" title="Sin reposiciones" description="No hay reposiciones en el rango." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={reposiciones.por_mes} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="solicitadas" stroke="#f59e0b" name="Solicitadas" strokeWidth={2} />
                <Line type="monotone" dataKey="aprobadas" stroke="#22c55e" name="Aprobadas" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <SectionHeader title="Top médicos que más reponen" subtitle="Ranking por cantidad" />
          {reposiciones.top_medicos.length === 0 ? (
            <EmptyState icon="🏅" title="Sin datos" description="Nadie ha propuesto reposiciones aún." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, reposiciones.top_medicos.length * 30)}>
              <BarChart data={reposiciones.top_medicos} layout="vertical" margin={{ left: 130, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={130} />
                <Tooltip />
                <Bar dataKey="count" fill="#8FB5DA" radius={[0, 4, 4, 0]} name="Reposiciones" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TAB 4 · Causas & especialidades
// ============================================================================
function TabCausas({ data }) {
  const { por_familia, por_especialidad, cruce_familia_especialidad } = data

  // Pivote para tabla cruzada: filas=familia, columnas=tipo
  const tipos = [...new Set(cruce_familia_especialidad.map((c) => c.type))].sort()
  const familias = [...new Set(cruce_familia_especialidad.map((c) => c.family))]
  const cruceMap = new Map(cruce_familia_especialidad.map((c) => [`${c.family}|${c.type}`, c.count]))

  const maxCruce = Math.max(1, ...cruce_familia_especialidad.map((c) => c.count))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <SectionHeader title="Por familia" subtitle="Distribución de causas raíz" />
          {por_familia.length === 0 ? (
            <EmptyState icon="🏷" title="Sin datos" description="Sin familias en el rango." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={por_familia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Ausencias">
                  {por_familia.map((f, i) => <Cell key={i} fill={FAMILIA_COLOR[f.family] ?? '#9ca3af'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <SectionHeader title="Por especialidad" subtitle="Ausencias por tipo de recurso" />
          {por_especialidad.length === 0 ? (
            <EmptyState icon="🩺" title="Sin datos" description="Sin datos en el rango." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={por_especialidad} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="tipo" tickFormatter={(t) => TIPO_LABEL[t] ?? t} tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v, n, p) => [v, TIPO_LABEL[p?.payload?.type] ?? p?.payload?.type]} />
                <Bar dataKey="count" fill="#1B2A6C" radius={[0, 4, 4, 0]} name="Ausencias" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <SectionHeader title="Cruce familia × especialidad" subtitle="Ausencias por combinación" />
        {familias.length === 0 || tipos.length === 0 ? (
          <EmptyState icon="🎯" title="Sin cruces" description="Sin datos en el rango." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left px-2 py-2">Familia \ Especialidad</th>
                  {tipos.map((t) => <th key={t} className="text-right px-2 py-2">{TIPO_LABEL[t] ?? t}</th>)}
                </tr>
              </thead>
              <tbody>
                {familias.map((f) => (
                  <tr key={f} className="border-b border-gray-50">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: FAMILIA_COLOR[f] ?? '#9ca3af' }} />
                        {FAMILIA_LABEL[f] ?? f}
                      </span>
                    </td>
                    {tipos.map((t) => {
                      const v = cruceMap.get(`${f}|${t}`) ?? 0
                      const intensity = v > 0 ? Math.max(0.08, v / maxCruce) : 0
                      return (
                        <td key={t} className="px-2 py-2 text-right" style={{ background: v > 0 ? `rgba(27, 42, 108, ${intensity * 0.35})` : undefined }}>
                          {v || '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Componentes auxiliares
// ============================================================================
function ChipToggle({ active, onClick, label, dotColor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition inline-flex items-center gap-1 ${
        active
          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {dotColor && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />}
      {label}
    </button>
  )
}

function MultiSelectField({ label, values, options, onChange, allLabel = 'Todas' }) {
  const [open, setOpen] = useState(false)
  const toggle = (v) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }
  const summary = values.length === 0
    ? allLabel
    : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? '1'
      : `${values.length} seleccionados`
  return (
    <div className="relative">
      <label className="label text-xs">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input text-xs text-left flex items-center justify-between"
      >
        <span className="truncate">{summary}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`w-full text-left text-xs px-3 py-1.5 ${values.length === 0 ? 'bg-brand-50 text-brand-800 font-medium' : 'hover:bg-gray-50'}`}
            >
              {allLabel}
            </button>
            <div className="border-t border-gray-100 my-0.5" />
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={values.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
