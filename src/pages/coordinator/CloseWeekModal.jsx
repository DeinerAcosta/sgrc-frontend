import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { semanaService } from '@/services/api'
import { Spinner, Semaforo } from '@/components/ui'
import { useSedeActiva } from '@/hooks/useActiveSite'

/**
 * HU-C-09 + RN-02: confirmar cierre de semana MOSTRANDO RESUMEN previo.
 * Cierra solo la SEDE activa del coord, no la semana global. Otros coords
 * pueden seguir trabajando hasta que cierren la suya.
 */
export default function CerrarSemanaModal({ semana, resumen, onClose, onIrAConsultorio, onAsignarRecurso }) {
  const qc = useQueryClient()
  const { siteId: sedeId, sedeNombre } = useSedeActiva()

  const { mutate, isPending } = useMutation({
    mutationFn: () => semanaService.cerrar(semana.id, sedeId),
    onSuccess: (res) => {
      const msg = res?.consolidated
        ? `Cerraste ${sedeNombre}. Era la última sede pendiente — semana consolidada.`
        : `Cerraste ${sedeNombre}. Otras sedes pueden seguir trabajando hasta que cierren la suya.`
      toast.success(msg, { duration: 6000 })
      qc.invalidateQueries({ queryKey: ['semanas'] })
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al cerrar'),
  })

  const bajoMeta = resumen.ocupacion_proyectada < 80

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Cerrar mi sede</h2>
            <div className="text-xs text-gray-500">{sedeNombre ?? 'Sede activa'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-xs text-gray-400">Período</div>
            <div className="text-sm font-medium text-gray-800">{resumen.label_semana}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="kpi-card">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{resumen.ocupacion_proyectada}%</span>
                <Semaforo pct={resumen.ocupacion_proyectada} metaVerde={80} />
              </div>
              <div className="text-xs text-gray-500">Ocupación proyectada</div>
              <div className="text-xs text-gray-400 mt-1">Meta: 80%</div>
            </div>
            <div className="kpi-card">
              <div className="text-2xl font-semibold">{resumen.consultorios_asignados}/{resumen.consultorios_totales}</div>
              <div className="text-xs text-gray-500">Consultorios con asignación</div>
            </div>
            <div className="kpi-card">
              <div className="text-2xl font-semibold">{resumen.asignaciones_total}</div>
              <div className="text-xs text-gray-500">Asignaciones</div>
            </div>
            <div className="kpi-card">
              <div className="text-2xl font-semibold">{resumen.pacientes_programados}</div>
              <div className="text-xs text-gray-500">Pacientes programados</div>
            </div>
          </div>

          {resumen.consultorios_sin_asignar.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <div className="font-medium text-amber-800 mb-1">
                ⚠️ {resumen.consultorios_sin_asignar.length} consultorios activos sin asignación:
              </div>
              <ul className="space-y-0.5">
                {resumen.consultorios_sin_asignar.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button
                      className="text-left text-amber-800 hover:text-amber-900 hover:underline"
                      onClick={() => onIrAConsultorio?.(c.id)}
                      title="Ir al consultorio en la grilla"
                    >
                      → {c.name}{c.specialty ? ` · ${c.specialty}` : ''}
                    </button>
                  </li>
                ))}
                {resumen.consultorios_sin_asignar.length > 6 && (
                  <li className="text-amber-600">...y {resumen.consultorios_sin_asignar.length - 6} más</li>
                )}
              </ul>
            </div>
          )}

          {resumen.recursos_ociosos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <div className="font-medium text-amber-800 mb-1">
                ⚠️ {resumen.recursos_ociosos.length} recursos con horas sin asignar:
              </div>
              <ul className="space-y-0.5">
                {resumen.recursos_ociosos.slice(0, 6).map((r) => {
                  const esAuxiliar = r.type === 'auxiliar' || r.type === 'auxiliar_admin'
                  return (
                    <li key={r.id}>
                      <button
                        className="text-left text-amber-800 hover:text-amber-900 hover:underline"
                        onClick={() => onAsignarRecurso?.(r)}
                        title={esAuxiliar ? 'Asignar a una tarea de backoffice' : 'Ir a su especialidad en la grilla'}
                      >
                        → {r.name} <span className="text-amber-600">({esAuxiliar ? 'asignar backoffice' : `buscar en ${r.type}`})</span>
                      </button>
                    </li>
                  )
                })}
                {resumen.recursos_ociosos.length > 6 && (
                  <li className="text-amber-600">...y {resumen.recursos_ociosos.length - 6} más</li>
                )}
              </ul>
            </div>
          )}

          {bajoMeta && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
              <strong>La ocupación proyectada ({resumen.ocupacion_proyectada}%) está por debajo de la meta del 80%.</strong>
              {' '}Puedes cerrar igualmente, pero recomendamos revisar primero.
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
            ℹ️ Solo cierras <strong>{sedeNombre ?? 'tu sede'}</strong>. Otras sedes seguirán abiertas hasta que sus coordinadores cierren la suya. Una vez cerrada, solo el supervisor podrá modificar tus asignaciones.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Revisar primero</button>
          <button
            className={bajoMeta ? 'btn-warning flex-1 justify-center' : 'btn-primary flex-1 justify-center'}
            onClick={() => mutate()}
            disabled={isPending}
          >
            {isPending ? <Spinner size="sm" /> : (bajoMeta ? '⚠️ Cerrar mi sede de todos modos' : '🔒 Cerrar mi sede')}
          </button>
        </div>
      </div>
    </div>
  )
}
