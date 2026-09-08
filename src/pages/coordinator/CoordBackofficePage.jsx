import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { backofficeService, recursoService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader, Avatar } from '@/components/ui'
import AsignarBackofficeModal from '@/pages/coordinator/AssignBackofficeModal'
import SolicitarTareaBackofficeModal from '@/pages/coordinator/RequestBackofficeTaskModal'
import { useSedeActiva } from '@/hooks/useActiveSite'

/**
 * Módulo de Backoffice del coordinador (HU-C-17, RN-36/37).
 * El coordinador asigna a las auxiliares liberadas por una ausencia confirmada a
 * tareas administrativas y hace seguimiento de lo asignado/ejecutado en su sede.
 */
export default function BackofficeCoordPage() {
  const { user } = useAuthStore()
  const { siteId: sedeId, Selector } = useSedeActiva()
  const [boAux, setBoAux] = useState(null)
  const [showSolicitar, setShowSolicitar] = useState(false)

  // Auxiliares liberadas por ausencia → candidatas a backoffice.
  // El coord-líder ve TODAS las de su equipo (en cualquier sede), no solo la sede activa.
  const esCoordBo = user?.role === 'coordinador'
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-coord-bo', esCoordBo ? user?.id : sedeId],
    queryFn: () => recursoService.list(
      esCoordBo
        ? { lead_coordinator_id: user?.id, type: 'auxiliar', active: true }
        : { site_id: sedeId, type: 'auxiliar', active: true }
    ),
    enabled: esCoordBo ? !!user?.id : !!sedeId,
  })
  const liberadas = recursos.filter((r) => r.status_badge === 'liberada')

  // Asignaciones de backoffice de la sede
  const { data: asignaciones = [], isLoading } = useQuery({
    queryKey: ['backoffice-coord', sedeId],
    queryFn: () => backofficeService.asignacionesList({ site_id: sedeId }),
    enabled: !!sedeId,
  })

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const esRegistrada = (a) => Array.isArray(a.executions) && a.executions.length > 0
  const pendientesHoy = asignaciones.filter((a) => a.day?.slice(0, 10) === hoy && !esRegistrada(a)).length
  const registradas = asignaciones.filter(esRegistrada).length

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Backoffice</h1>
          <p className="text-xs text-gray-500">
            Tareas administrativas asignadas a auxiliares liberadas por ausencia · seguimiento de tu sede
          </p>
          <Selector className="mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn whitespace-nowrap"
            onClick={() => setShowSolicitar(true)}
            title="Pedir al supervisor que cree una tarea de backoffice que no está en el catálogo"
          >
            ＋ Solicitar nueva tarea
          </button>
        </div>
      </div>

      {/* Auxiliares liberadas disponibles para asignar */}
      {liberadas.length > 0 && (
        <div className="card mb-4 border-yellow-200 bg-yellow-50/50">
          <SectionHeader title={`Auxiliares liberadas — disponibles (${liberadas.length})`} />
          <div className="space-y-2 mt-1">
            {liberadas.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar nombre={r.name} size="sm" color="amber" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
                  <div className="text-xs text-gray-500">{r.specialty || 'Auxiliar'} · liberada por ausencia</div>
                </div>
                <button
                  className="btn text-xs whitespace-nowrap"
                  onClick={() => setBoAux(r)}
                  title="Asignar a esta auxiliar una tarea de backoffice"
                >
                  🗂️ Asignar backoffice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-gray-900">{asignaciones.length}</div>
          <div className="text-xs text-gray-500">Asignaciones totales</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-amber-600">{pendientesHoy}</div>
          <div className="text-xs text-gray-500">Pendientes de hoy</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-green-600">{registradas}</div>
          <div className="text-xs text-gray-500">Registradas</div>
        </div>
      </div>

      {/* Lista de asignaciones */}
      <div className="card">
        <SectionHeader title={`Asignaciones de backoffice (${asignaciones.length})`} />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : asignaciones.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title="Sin asignaciones de backoffice"
            description="Cuando un médico tenga una ausencia confirmada, sus auxiliares quedan liberadas y podrás asignarlas a tareas administrativas desde aquí."
          />
        ) : (
          <div className="space-y-2">
            {asignaciones.map((a) => {
              const registrada = esRegistrada(a)
              return (
                <div key={a.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Avatar nombre={a.assistant?.name} size="sm" color="blue" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{a.assistant?.name}</span>
                        <Badge variant={registrada ? 'green' : 'amber'}>{registrada ? 'Registrada' : 'Pendiente'}</Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {a.task?.name}{a.site?.name ? ` · ${a.site.name}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {a.day ? format(parseISO(a.day), "EEEE d 'de' MMMM", { locale: es }) : ''} · {a.start_time}–{a.end_time}
                      </div>
                    </div>
                  </div>

                  {registrada && (
                    <div className="mt-2 ml-11 text-xs text-gray-600 bg-green-50 border border-green-100 rounded-lg p-2 space-y-1">
                      {a.executions.map((e) => (
                        <div key={e.id} className="flex flex-wrap gap-x-3">
                          <span>✓ {e.units_completed} unidades</span>
                          <span>· {e.actual_minutes} min</span>
                          {e.notes && <span className="italic text-gray-500">"{e.notes}"</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {boAux && <AsignarBackofficeModal auxiliar={boAux} onClose={() => setBoAux(null)} />}
      {showSolicitar && <SolicitarTareaBackofficeModal onClose={() => setShowSolicitar(false)} />}
    </div>
  )
}
