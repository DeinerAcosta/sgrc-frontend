import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { backofficeService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'

export default function BackofficeRecursoPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: asignaciones = [], isLoading } = useQuery({
    queryKey: ['backoffice-recurso', user?.resource_id],
    queryFn: () => backofficeService.pendientesAuxiliar(user?.resource_id),
  })

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Mi turno de backoffice</h1>
        <p className="text-xs text-gray-500">
          Tareas administrativas asignadas cuando tu médico tiene ausencia
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : asignaciones.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Sin turno de backoffice hoy"
          description="Cuando un médico al que apoyas tenga una ausencia confirmada, el coordinador podrá asignarte a tareas administrativas. Aquí verás las tareas pendientes de registrar al final del turno."
        />
      ) : (
        asignaciones.map((a) => (
          <AsignacionCard key={a.id} asignacion={a} onSaved={() => qc.invalidateQueries({ queryKey: ['backoffice-recurso'] })} />
        ))
      )}
    </div>
  )
}

function AsignacionCard({ assignment: asignacion, onSaved }) {
  const [unidades, setUnidades] = useState('')
  const [tiempoReal, setTiempoReal] = useState('')
  const [obs, setObs] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.registrar({
      backoffice_assignment_id: asignacion.id,
      task_id: asignacion.backoffice_task_id,
      units_completed: parseInt(unidades),
      actual_minutes: parseInt(tiempoReal),
      notes: obs,
    }),
    onSuccess: () => {
      toast.success('Tarea registrada')
      setUnidades(''); setTiempoReal(''); setObs('')
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al registrar'),
  })

  const yaRegistrada = asignacion.executions && asignacion.executions.length > 0
  const tiempoEstim = asignacion.task?.estimated_minutes

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-gray-900">{asignacion.task?.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {asignacion.site?.name} · {format(parseISO(asignacion.day), "EEEE d 'de' MMMM", { locale: es })}
          </div>
          <div className="text-xs text-gray-500">
            Horario: {asignacion.start_time} – {asignacion.end_time}
          </div>
        </div>
        <Badge variant={yaRegistrada ? 'green' : 'amber'}>
          {yaRegistrada ? 'Registrada' : 'Pendiente'}
        </Badge>
      </div>

      {asignacion.task?.description && (
        <div className="text-xs text-gray-600 mb-3 italic">"{asignacion.task.description}"</div>
      )}

      {yaRegistrada ? (
        <div className="space-y-2 text-xs bg-green-50 border border-green-100 rounded-lg p-3">
          {asignacion.executions.map((e) => (
            <div key={e.id}>
              <div className="flex justify-between">
                <span className="text-gray-600">Unidades:</span>
                <span className="font-medium">{e.units_completed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tiempo real:</span>
                <span className="font-medium">{e.actual_minutes} min</span>
              </div>
              {e.notes && (
                <div className="mt-2 text-gray-600 italic">"{e.notes}"</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <SectionHeader title="Registrar al final del turno" subtitle={tiempoEstim ? `Tiempo estimado por unidad: ${tiempoEstim} min` : null} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Unidades completadas *</label>
              <input className="input" type="number" min="0" value={unidades} onChange={(e) => setUnidades(e.target.value)} />
            </div>
            <div>
              <label className="label">Tiempo real (min) *</label>
              <input className="input" type="number" min="0" value={tiempoReal} onChange={(e) => setTiempoReal(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Observaciones (opcional)</label>
            <textarea className="input resize-none" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={() => mutate()}
              disabled={!unidades || !tiempoReal || isPending}
            >
              {isPending ? <Spinner size="sm" /> : '✓ Guardar registro'}
            </button>
          </div>

          <div className="text-xs text-gray-400">
            Una vez guardado, el registro se bloquea para edición a las 24h.
          </div>
        </div>
      )}
    </div>
  )
}
