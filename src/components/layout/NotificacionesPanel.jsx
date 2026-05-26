import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificacionService } from '@/services/api'
import { Spinner } from '@/components/ui'

const ICONOS = {
  ausencia_reportada: '🚨',
  conflicto: '⛔',
  horas_limite: '⏰',
  asignacion_cambiada: '📅',
  recurso_ocioso: '⚠️',
  ausencia_sin_cubrir: '🔴',
  default: '🔔',
}

export default function NotificacionesPanel({ onClose }) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: notificacionService.list,
  })
  const { mutate: leer } = useMutation({
    mutationFn: notificacionService.leer,
    onSuccess: () => qc.invalidateQueries(['notificaciones']),
  })
  const { mutate: leerTodas } = useMutation({
    mutationFn: notificacionService.leerTodas,
    onSuccess: () => qc.invalidateQueries(['notificaciones']),
  })

  const noLeidas = data.filter((n) => !n.leida).length

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-8 z-40 w-80 bg-white border border-gray-100 rounded-xl overflow-hidden">
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
            data.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.leida && leer(n.id)}
                className={`flex gap-3 px-4 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${!n.leida ? 'bg-blue-50/40' : ''}`}
              >
                <span className="text-lg flex-shrink-0">{ICONOS[n.tipo] ?? ICONOS.default}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 leading-snug">{n.titulo}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{n.mensaje}</div>
                  <div className="text-xs text-gray-300 mt-1">
                    {new Date(n.creada_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                {!n.leida && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
