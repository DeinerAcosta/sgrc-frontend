import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificacionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui'

const ICONOS = {
  ausencia_reportada: '🚨',
  ausencia_confirmada: '✅',
  ausencia_sin_cubrir: '🔴',
  conflicto: '⛔',
  horas_limite: '⏰',
  asignacion_cambiada: '📅',
  recurso_ocioso: '⚠️',
  solicitud_tarea_backoffice: '🗂️',
  solicitud_registro: '📨',
  solicitud_aprobada: '✅',
  solicitud_rechazada: '❌',
  resumen_diario: '📋',
  default: '🔔',
}

/**
 * Devuelve la ruta de la app a la que debe llevar una notificación según su
 * tipo y el rol del usuario. Devuelve null si no aplica navegación (en ese
 * caso el click solo marca como leída).
 *
 * Se usa también `referencia_id` para enfocar (selected=…) la entidad
 * relevante en la página destino.
 */
function rutaDeNotificacion(n, rol) {
  const ref = n.reference_id
  const qref = ref ? `?selected=${ref}` : ''
  // Gerencia es super-usuario: tiene acceso a todos los módulos de coordinador y supervisor
  const esCoord = rol === 'coordinador' || rol === 'supervisor' || rol === 'gerencia'
  const esSupervisor = rol === 'supervisor' || rol === 'gerencia'
  const esDirectivo = rol === 'directivo' || rol === 'gerencia'
  switch (n.type) {
    case 'ausencia_reportada':
    case 'ausencia_sin_cubrir':
      if (esCoord) return `/app/ausencias-coord${qref}`
      if (rol === 'recurso') return `/app/ausencias${qref}`
      if (esDirectivo) return '/app/informes/ausentismo-impacto'
      return null
    case 'ausencia_confirmada':
      if (rol === 'recurso') return `/app/ausencias${qref}`
      if (esCoord) return `/app/ausencias-coord${qref}`
      return null
    case 'conflicto':
    case 'asignacion_cambiada':
      if (esCoord) return '/app/programador'
      if (rol === 'recurso') return '/app/horario'
      return null
    case 'horas_limite':
    case 'recurso_ocioso':
      if (esCoord) return '/app/recursos-coord'
      return null
    case 'solicitud_tarea_backoffice':
      if (esSupervisor) return '/app/admin/tareas-backoffice'
      return null
    case 'solicitud_registro':
      if (esSupervisor) return '/app/admin/solicitudes'
      return null
    case 'solicitud_aprobada':
    case 'solicitud_rechazada':
      // Le llega al coordinador que solicitó — lo llevamos a Backoffice
      // donde está la tarea aprobada (o la solicitud rechazada en el historial).
      if (rol === 'coordinador') return '/app/backoffice-coord'
      return null
    case 'resumen_diario':
      if (esCoord) return '/app/horario-diario'
      return null
    default:
      return null
  }
}

export default function NotificacionesPanel({ onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data = [], isLoading } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: notificacionService.list,
  })
  const { mutate: leer } = useMutation({
    mutationFn: notificacionService.leer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
  const { mutate: leerTodas } = useMutation({
    mutationFn: notificacionService.leerTodas,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })

  const noLeidas = data.filter((n) => !n.read).length

  // Click: marcar como leída (si no lo está) y navegar al módulo relevante.
  // Si la notificación no tiene destino definido para el rol, solo marca leída.
  const handleClick = (n) => {
    if (!n.read) leer(n.id)
    const ruta = rutaDeNotificacion(n, user?.role)
    if (ruta) {
      onClose?.()
      navigate(ruta)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-8 z-40 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-medium text-gray-800">
            Notificaciones
            {noLeidas > 0 && (
              <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{noLeidas}</span>
            )}
          </div>
          {noLeidas > 0 && (
            <button onClick={() => leerTodas()} className="text-xs text-brand-600 hover:underline">
              Marcar todas como leídas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : data.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">Sin notificaciones</div>
          ) : (
            data.map((n) => {
              const tieneDestino = !!rutaDeNotificacion(n, user?.role)
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex gap-3 px-4 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
                  title={tieneDestino ? 'Ir al módulo relacionado' : 'Marcar como leída'}
                >
                  <span className="text-lg flex-shrink-0">{ICONOS[n.type] ?? ICONOS.default}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 leading-snug flex items-center gap-1">
                      <span className="truncate">{n.title}</span>
                      {tieneDestino && <span className="text-gray-300 flex-shrink-0">→</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</div>
                    <div className="text-xs text-gray-300 mt-1">
                      {new Date(n.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
