import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { recursoService, asignacionService } from '@/services/api'
import { Avatar, Spinner, EmptyState } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'

/**
 * HU-C-12 + RN-38: Cuando hay una ausencia sin cubrir, sugiere recursos disponibles
 * de la sede propia primero, luego de otras sedes de la misma ciudad.
 */
export default function SugeridorReemplazosModal({ asignacionVacia, absence: ausencia, city: ciudad, onClose }) {
  const qc = useQueryClient()

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ['sugerir-reemplazo', asignacionVacia?.id],
    queryFn: () => recursoService.sugerirReemplazos({
      type: asignacionVacia?.resource?.type,
      day: asignacionVacia?.weekday,
      start_time: asignacionVacia?.start_time,
      end_time: asignacionVacia?.end_time,
      city: ciudad,
      week_id: asignacionVacia?.week_id,
      // El backend deduce de aquí la sede del hueco para separar los candidatos
      // de la misma sede de los que requieren desplazamiento. Sin este dato
      // todos salían como "misma sede".
      room_id: asignacionVacia?.room_id,
    }),
    enabled: !!asignacionVacia,
  })

  const { mutate: asignar, isPending } = useMutation({
    mutationFn: (recursoId) => asignacionService.create({
      week_id: asignacionVacia.week_id,
      room_id: asignacionVacia.room_id,
      resource_id: recursoId,
      assistant_id: asignacionVacia.assistant_id,
      weekday: asignacionVacia.weekday,
      start_time: asignacionVacia.start_time,
      end_time: asignacionVacia.end_time,
      is_replacement: true,
      covered_absence_id: ausencia?.id,
    }, 'coordinador'),
    onSuccess: () => {
      toast.success('Reemplazo asignado. La alerta de ausencia sin cubrir se resolvió.')
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo asignar el reemplazo'),
  })

  const mismaSede = candidatos.filter((c) => c.misma_sede)
  const otrasSedes = candidatos.filter((c) => !c.misma_sede)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Buscar reemplazo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {asignacionVacia?.resource?.type} · {asignacionVacia?.weekday} {asignacionVacia?.start_time}–{asignacionVacia?.end_time}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : candidatos.length === 0 ? (
            <EmptyState icon="🤷" title="Sin candidatos disponibles" description="No hay recursos del mismo tipo disponibles en esa franja en la ciudad" />
          ) : (
            <>
              {mismaSede.length > 0 && (
                <>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Misma sede ({mismaSede.length})
                  </div>
                  <div className="space-y-2 mb-4">
                    {mismaSede.map((r) => <CandidatoCard key={r.id} r={r} onAsignar={() => asignar(r.id)} disabled={isPending} />)}
                  </div>
                </>
              )}

              {otrasSedes.length > 0 && (
                <>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Otras sedes de {ciudad} ({otrasSedes.length}) · requiere desplazamiento
                  </div>
                  <div className="space-y-2">
                    {otrasSedes.map((r) => <CandidatoCard key={r.id} r={r} onAsignar={() => asignar(r.id)} disabled={isPending} alerta />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function CandidatoCard({ r, onAsignar, disabled, alerta }) {
  const tipo = TIPOS_RECURSO.find((t) => t.value === r.type)
  const horas = r.assigned_hours ?? 0
  const max = r.max_hours_per_week ?? 42
  const pct = Math.round((horas / max) * 100)
  return (
    <div className="border border-gray-100 rounded-lg p-3 flex items-center gap-3">
      <Avatar nombre={r.name} size="sm" color={tipo?.color ?? 'blue'} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
        <div className="text-xs text-gray-500">
          {tipo?.label} {r.specialty ? `· ${r.specialty}` : ''} · {pct}% utilización
        </div>
        {alerta && (
          <div className="text-xs text-amber-700 mt-1">⚠ El recurso deberá desplazarse a la sede</div>
        )}
      </div>
      <button className="btn-primary text-xs" onClick={onAsignar} disabled={disabled}>
        Asignar
      </button>
    </div>
  )
}
