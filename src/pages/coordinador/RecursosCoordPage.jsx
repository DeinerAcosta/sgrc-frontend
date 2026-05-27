import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recursoService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, BarProgress, Spinner, EmptyState, SectionHeader, Avatar } from '@/components/ui'
import { TIPOS_RECURSO, formatHoras } from '@/utils/helpers'
import AsignarBackofficeModal from '@/pages/coordinador/AsignarBackofficeModal'

export default function RecursosCoordPage() {
  const { user } = useAuthStore()
  const sedeId = user?.sedes?.[0]
  const [filtroTipo, setFiltroTipo] = useState('')
  const [boAux, setBoAux] = useState(null)

  const { data: recursos = [], isLoading } = useQuery({
    queryKey: ['recursos-sede-full', sedeId, filtroTipo],
    queryFn: () => recursoService.list({ sede_id: sedeId, tipo: filtroTipo || undefined }),
  })

  const ociosos = recursos.filter((r) => ((r.horas_asignadas ?? 0) / (r.horas_max_semana ?? 42)) < 0.6).length
  const limite = recursos.filter((r) => ((r.horas_asignadas ?? 0) / (r.horas_max_semana ?? 42)) >= 0.9).length
  const liberadas = recursos.filter((r) => r.estado_badge === 'liberada').length
  const extras = recursos.filter((r) => r.es_horas_extras).length

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Recursos de mi sede</h1>
          <p className="text-xs text-gray-500">Carga horaria semanal · alertas de utilización</p>
        </div>
        <select className="input w-auto text-xs" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-amber-600">{ociosos}</div>
          <div className="text-xs text-gray-500">Por debajo del 60%</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-red-600">{limite}</div>
          <div className="text-xs text-gray-500">Cerca del 90% del tope</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-yellow-700">{liberadas}</div>
          <div className="text-xs text-gray-500">Liberadas por ausencia</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-red-700">{extras}</div>
          <div className="text-xs text-gray-500">Con horas extras</div>
        </div>
      </div>

      <div className="card">
        <SectionHeader title={`Recursos (${recursos.length})`} />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : recursos.length === 0 ? (
          <EmptyState icon="👥" title="Sin recursos" description="No hay recursos asignados a esta sede" />
        ) : (
          <div className="space-y-3">
            {recursos.map((r) => {
              const horas = r.horas_asignadas ?? 0
              const max = r.horas_max_semana ?? 42
              const pct = Math.min(100, Math.round((horas / max) * 100))
              const ociosa = pct < 60
              const cerca = pct >= 90 && !r.es_horas_extras
              const tipoInfo = TIPOS_RECURSO.find((t) => t.value === r.tipo)
              return (
                <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar nombre={r.nombre} size="sm" color={tipoInfo?.color ?? 'blue'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{r.nombre}</span>
                        <Badge variant={tipoInfo?.color ?? 'gray'}>{tipoInfo?.label ?? r.tipo}</Badge>
                        {r.especialidad && <span className="text-xs text-gray-500">· {r.especialidad}</span>}
                        {ociosa && <Badge variant="amber">ociosa</Badge>}
                        {cerca && <Badge variant="red">cerca del límite</Badge>}
                        {r.es_horas_extras && <Badge variant="red">horas extras</Badge>}
                        {r.estado_badge === 'liberada' && <Badge variant="yellow">liberada — disponible</Badge>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatHoras(horas)} / {formatHoras(max)} · {pct}%
                      </div>
                    </div>
                    {r.estado_badge === 'liberada' && (
                      <button
                        className="btn text-xs whitespace-nowrap"
                        onClick={() => setBoAux(r)}
                        title="Asignar a esta auxiliar liberada una tarea de backoffice"
                      >
                        🗂️ Asignar backoffice
                      </button>
                    )}
                  </div>
                  <BarProgress value={horas} max={max} color={r.es_horas_extras ? 'red' : ociosa ? 'amber' : 'green'} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {boAux && <AsignarBackofficeModal auxiliar={boAux} onClose={() => setBoAux(null)} />}
    </div>
  )
}
