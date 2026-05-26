import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import toast from 'react-hot-toast'
import { informeService, sedeService } from '@/services/api'
import { KpiCard, Spinner, Semaforo, Badge, EmptyState } from '@/components/ui'
import { formatCOP } from '@/utils/helpers'
import { useNavigate } from 'react-router-dom'

const INFORMES = [
  { to: '/app/informes/productividad',  icon: '📈', label: 'Productividad por recurso' },
  { to: '/app/informes/ausentismo',     icon: '🚨', label: 'Ausentismo y ranking' },
  { to: '/app/informes/subutilizacion', icon: '⏰', label: 'Tiempos ociosos' },
  { to: '/app/informes/ocupacion',      icon: '🏥', label: 'Ocupación consultorios' },
  { to: '/app/informes/impacto',        icon: '💰', label: 'Impacto económico' },
  { to: '/app/informes/comparativo',    icon: '↔️',  label: 'Comparativo semanal' },
]

export default function DashboardDirectivoPage() {
  const navigate = useNavigate()
  const [sedeFilter, setSedeFilter] = useState('')

  // KPIs + sedes_ocupacion + ausencias_activas — todo desde la BD
  const { data: dash, isLoading } = useQuery({
    queryKey: ['dashboard-directivo'],
    queryFn: () => informeService.dashboard(),
  })

  // Sedes reales para el filtro
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-dashboard'],
    queryFn: () => sedeService.list(),
  })

  const barColor = (pct) => pct >= 80 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444'

  const exportar = async (formato) => {
    try {
      const blob = await informeService.exportar('ocupacion', formato, {})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ocupacion_${new Date().toISOString().slice(0, 10)}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exportado en ${formato.toUpperCase()}`)
    } catch (err) {
      toast.error(err?.message ?? 'Error al exportar')
    }
  }

  if (isLoading || !dash) {
    return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
  }

  const sedesOcupacion = dash.sedes_ocupacion ?? []
  const ausenciasActivas = dash.ausencias_activas ?? []

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Dashboard ejecutivo</h1>
          <p className="text-xs text-gray-500">Todas las sedes · Semana actual</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto text-xs" value={sedeFilter} onChange={(e) => setSedeFilter(e.target.value)}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button className="btn" onClick={() => exportar('pdf')}>📥 PDF</button>
          <button className="btn" onClick={() => exportar('excel')}>📊 Excel</button>
        </div>
      </div>

      {/* KPIs — todos del backend */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Pacientes programados"
          value={dash.pacientes_programados?.toLocaleString('es-CO') ?? '0'}
          delta={dash.delta_pacientes ? `${dash.delta_pacientes > 0 ? '+' : ''}${dash.delta_pacientes}% vs semana anterior` : null}
          deltaUp={dash.delta_pacientes >= 0}
        />
        <KpiCard
          label="Impactados por ausencias"
          value={dash.impactados_ausencias ?? 0}
          color={dash.impactados_ausencias > 0 ? 'danger' : 'default'}
          delta={dash.delta_impactados ? `${dash.delta_impactados > 0 ? '↑' : '↓'}${Math.abs(dash.delta_impactados)} vs semana anterior` : null}
        />
        <KpiCard
          label="Recursos con tiempo ocioso"
          value={dash.recursos_ociosos ?? 0}
          color={dash.recursos_ociosos > 0 ? 'warning' : 'default'}
          delta={dash.recursos_ociosos > 0 ? 'Costo fijo subutilizado' : 'Sin alertas'}
        />
        <div className="kpi-card">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-2xl font-semibold text-gray-900">{dash.ocupacion_global ?? 0}%</span>
            <Semaforo pct={dash.ocupacion_global ?? 0} metaVerde={dash.meta_ocupacion ?? 80} />
          </div>
          <div className="text-xs text-gray-500">Ocupación global</div>
          <div className={`text-xs mt-1 ${(dash.ocupacion_global ?? 0) >= (dash.meta_ocupacion ?? 80) ? 'text-green-600' : 'text-amber-600'}`}>
            Meta: {dash.meta_ocupacion ?? 80}% {(dash.ocupacion_global ?? 0) >= (dash.meta_ocupacion ?? 80) ? '✓' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Gráfico por sede — del backend */}
        <div className="card">
          <div className="text-xs font-medium text-gray-700 mb-3">Ocupación por sede</div>
          {sedesOcupacion.length === 0 ? (
            <EmptyState icon="🏢" title="Sin datos de ocupación" description="Crea asignaciones para ver la ocupación." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, sedesOcupacion.length * 32)}>
                <BarChart
                  data={sedesOcupacion.map((s) => ({ nombre: s.nombre, ocupacion: s.pct }))}
                  layout="vertical"
                  margin={{ left: 80, right: 20, top: 0, bottom: 0 }}
                  onClick={(d) => d?.activePayload?.[0]?.payload?.nombre && setSedeFilter(
                    sedes.find((x) => x.nombre === d.activePayload[0].payload.nombre)?.id ?? ''
                  )}
                >
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="ocupacion" radius={[0, 4, 4, 0]} cursor="pointer">
                    {sedesOcupacion.map((s, i) => <Cell key={i} fill={barColor(s.pct)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {sedeFilter && (
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span className="text-gray-600">Filtrado por: <strong>{sedes.find((s) => s.id === sedeFilter)?.nombre}</strong></span>
                  <button className="text-brand-600 hover:underline" onClick={() => setSedeFilter('')}>Limpiar</button>
                  <button className="text-brand-600 hover:underline" onClick={() => navigate(`/app/informes/ocupacion`)}>Ver detalle →</button>
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2">💡 Haz clic en una barra para hacer drill-down</div>
            </>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />≥80%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />70–79%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />&lt;70%</span>
          </div>
        </div>

        {/* Ausencias activas — del backend */}
        <div className="card">
          <div className="text-xs font-medium text-gray-700 mb-3">Ausencias activas esta semana</div>
          {ausenciasActivas.length === 0 ? (
            <EmptyState icon="✅" title="Sin ausencias activas" description="Ningún recurso tiene ausencia confirmada." />
          ) : (
            <>
              <div className="space-y-2">
                {ausenciasActivas.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{a.nombre}</div>
                      <div className="text-xs text-gray-400">{a.sede} · {formatCOP(a.costo)}</div>
                    </div>
                    <Badge variant={a.pacientes > 30 ? 'red' : 'amber'}>{a.pacientes} pac.</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs">
                <span className="text-gray-500">Costo total estimado</span>
                <span className="font-semibold text-red-700">{formatCOP(dash.costo_total_ausentismo ?? 0)}</span>
              </div>
            </>
          )}
          <button className="btn w-full justify-center mt-2 text-xs" onClick={() => navigate('/app/informes/ausentismo')}>
            Ver informe completo →
          </button>
        </div>
      </div>

      {/* Accesos a informes */}
      <div className="card">
        <div className="text-xs font-medium text-gray-700 mb-3">Informes disponibles</div>
        <div className="grid grid-cols-3 gap-2">
          {INFORMES.map((inf) => (
            <button
              key={inf.to}
              className="btn justify-start gap-2 text-xs"
              onClick={() => navigate(inf.to)}
            >
              <span>{inf.icon}</span>
              <span>{inf.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
