import { useQuery } from '@tanstack/react-query'
import { semanaService } from '@/services/api'
import { Spinner, EmptyState } from '@/components/ui'

/**
 * VISTA RÁPIDA DE CAMBIOS DE LA SEMANA (PROYECTOS-3583 §3)
 * Qué cambió en la programación, quién lo cambió y cuándo, lo más reciente
 * arriba. Sale de la auditoría que ya deja cada alta, edición y borrado.
 */
export default function CambiosSemanaModal({ semanaId, sedeId, onClose }) {
  const { data: cambios = [], isLoading } = useQuery({
    queryKey: ['cambios-semana', semanaId, sedeId],
    queryFn: () => semanaService.cambios(semanaId, sedeId),
    enabled: !!semanaId,
  })
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl my-4 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Cambios de la semana</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
        </div>
        <div className="p-5">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Spinner /></div>
          ) : cambios.length === 0 ? (
            <EmptyState icon="🕘" title="Sin cambios" description="Nadie ha tocado la programación de esta semana." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {cambios.map((c) => (
                <li key={c.id} className="py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-gray-900"><strong>{c.quien}</strong> · {c.accion}</span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {new Date(c.cuando).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}
                    </span>
                  </div>
                  {c.detalle && <div className="text-gray-600">{c.detalle}</div>}
                  {c.antes && <div className="text-gray-400">Antes: {c.antes}</div>}
                  {c.motivo && <div className="text-gray-500 italic">"{c.motivo}"</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
