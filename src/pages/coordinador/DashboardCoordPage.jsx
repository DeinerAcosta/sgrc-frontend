import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { ausenciaService, recursoService } from '@/services/api'
import { AlertRow, BarProgress, KpiCard, Spinner, SectionHeader } from '@/components/ui'
import { Badge } from '@/components/ui'
import { formatHoras } from '@/utils/helpers'
import { useNavigate } from 'react-router-dom'

export default function DashboardCoordPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const sedeId = user?.sedes?.[0]

  const { data: ausencias = [], isLoading: loadAus } = useQuery({
    queryKey: ['ausencias-pendientes', sedeId],
    queryFn: () => ausenciaService.list({ sede_id: sedeId, estado: 'pendiente' }),
  })

  const { data: recursos = [], isLoading: loadRec } = useQuery({
    queryKey: ['recursos-sede', sedeId],
    queryFn: () => recursoService.list({ sede_id: sedeId, tipo: 'auxiliar' }),
  })

  const ociosas = recursos.filter((r) => (r.horas_asignadas ?? 0) < r.horas_max_semana * 0.6)
  const conExtras = recursos.filter((r) => r.es_horas_extras)
  const liberadas = recursos.filter((r) => r.estado_badge === 'liberada')

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Dashboard operativo</h1>
          <p className="text-xs text-gray-500">{user?.nombre} · {user?.sedes_nombres?.join(', ')}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/app/programador')}>
          📅 Ir al programador
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KpiCard label="Ausencias pendientes" value={ausencias.length} color={ausencias.length > 0 ? 'danger' : 'default'} />
        <KpiCard label="Auxiliares ociosas" value={ociosas.length} color={ociosas.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Con horas extras" value={conExtras.length} color={conExtras.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Auxiliares liberadas" value={liberadas.length} color={liberadas.length > 0 ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Alertas */}
        <div className="card">
          <SectionHeader title="Alertas activas" action={<span className="text-xs text-gray-400">{ausencias.length + ociosas.length} total</span>} />
          {loadAus ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <>
              {ausencias.map((a) => (
                <AlertRow
                  key={a.id}
                  tipo="rojo"
                  titulo={`Ausencia sin confirmar — ${a.recurso?.nombre}`}
                  subtitulo={`${a.pacientes_impactados ?? '?'} pac. · ${a.tipo}`}
                  actionLabel="Ver"
                  onAction={() => navigate('/app/ausencias-coord')}
                />
              ))}
              {ociosas.map((r) => (
                <AlertRow
                  key={r.id}
                  tipo="amarillo"
                  titulo={`${r.nombre} · ${formatHoras(r.horas_asignadas ?? 0)} / ${formatHoras(r.horas_max_semana)}`}
                  subtitulo="Costo fijo sin utilizar"
                  actionLabel="Asignar"
                  onAction={() => navigate('/app/programador')}
                />
              ))}
              {liberadas.map((r) => (
                <AlertRow
                  key={`lib-${r.id}`}
                  tipo="amarillo"
                  titulo={`${r.nombre} liberada por ausencia de médico`}
                  subtitulo="Disponible para reasignar o enviar a backoffice"
                  actionLabel="Reasignar"
                  onAction={() => navigate('/app/programador')}
                />
              ))}
              {ausencias.length === 0 && ociosas.length === 0 && liberadas.length === 0 && (
                <div className="py-4 text-center text-xs text-gray-400">Sin alertas activas ✓</div>
              )}
            </>
          )}
        </div>

        {/* Auxiliares */}
        <div className="card">
          <SectionHeader title="Auxiliares — horas semana" action={<button className="text-xs text-brand-600 hover:underline" onClick={() => navigate('/app/recursos-coord')}>Ver todas</button>} />
          {loadRec ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <div className="space-y-2.5">
              {recursos.slice(0, 8).map((r) => {
                const pct = Math.min(100, Math.round(((r.horas_asignadas ?? 0) / r.horas_max_semana) * 100))
                const isOciosa = pct < 60
                const isExtra = r.es_horas_extras
                const isLib = r.estado_badge === 'liberada'
                return (
                  <div key={r.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-700 flex-1 truncate">{r.nombre}</span>
                      {isLib && <Badge variant="yellow" className="text-xs py-0">backoffice</Badge>}
                      {isOciosa && <Badge variant="amber" className="text-xs py-0">ociosa</Badge>}
                      {isExtra && <Badge variant="red" className="text-xs py-0">extras</Badge>}
                      <span className={`text-xs ${isExtra ? 'text-red-600' : isOciosa ? 'text-amber-600' : 'text-green-700'}`}>
                        {formatHoras(r.horas_asignadas ?? 0)} / {formatHoras(r.horas_max_semana)}
                      </span>
                    </div>
                    <BarProgress value={r.horas_asignadas ?? 0} max={r.horas_max_semana} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/ausencias-coord')}>📋 Gestionar ausencias</button>
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/ejecucion')}>✅ Registrar ejecución</button>
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/informes/ocupacion')}>📊 Ver informe de ocupación</button>
      </div>
    </div>
  )
}
