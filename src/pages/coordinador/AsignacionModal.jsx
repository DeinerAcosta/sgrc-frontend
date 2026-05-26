import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { asignacionService, recursoService } from '@/services/api'
import { Spinner, Badge } from '@/components/ui'
import { calcularCapacidadPacientes, DIAS_FULL, DIAS } from '@/utils/helpers'

export default function AsignacionModal({ data, sedeId, onClose, onSaved }) {
  const { consultorioId, consultorio, dia, semanaId } = data
  const [form, setForm] = useState({ recurso_id: '', auxiliar_id: '', hora_inicio: '07:00', hora_fin: '13:00' })
  const [conflicto, setConflicto] = useState(null)

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setConflicto(null) }

  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-disponibles', sedeId, consultorio.especialidad],
    queryFn: () => recursoService.list({ sede_id: sedeId, especialidad_consultorio: consultorio.especialidad, activo: true }),
  })

  // Todas las auxiliares activas. El backend las enriquece con horas y marca con
  // estado_badge='liberada' a las que quedaron libres por ausencia de su médico
  // (RN-24). Los conflictos de horario se validan al guardar (RN-08), no aquí.
  const { data: auxiliares = [] } = useQuery({
    queryKey: ['auxiliares-activas'],
    queryFn: () => recursoService.list({ tipo: 'auxiliar', activo: true }),
    enabled: consultorio.requiere_auxiliar,
  })

  const capacidad = form.recurso_id
    ? calcularCapacidadPacientes(
        form.hora_inicio,
        form.hora_fin,
        recursos.find((r) => r.id === form.recurso_id)?.intervalo_minutos ?? 10
      )
    : 0

  const { mutate, isPending } = useMutation({
    mutationFn: () => asignacionService.create({
      semana_id:      semanaId,
      consultorio_id: consultorioId,
      recurso_id:     form.recurso_id,
      auxiliar_id:    form.auxiliar_id || null,
      dia_semana:     dia,
      hora_inicio:    form.hora_inicio,
      hora_fin:       form.hora_fin,
    }),
    onSuccess: () => { toast.success('Asignación guardada'); onSaved() },
    onError: (err) => {
      if (err?.code === 'CONFLICTO_HORARIO') setConflicto(err.detalle)
      else toast.error(err?.message ?? 'Error al guardar la asignación')
    },
  })

  const diaLabel = DIAS_FULL[DIAS.indexOf(dia)] ?? dia
  const valid = form.recurso_id && form.hora_inicio && form.hora_fin && (!consultorio.requiere_auxiliar || form.auxiliar_id)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Nueva asignación</h2>
            <p className="text-xs text-gray-500">{consultorio.nombre} · {diaLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Recurso principal */}
          <div>
            <label className="label">Recurso principal *</label>
            <select className="input" value={form.recurso_id} onChange={(e) => set('recurso_id', e.target.value)}>
              <option value="">Seleccionar recurso...</option>
              {recursos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} · {r.intervalo_minutos}min/pac. {r.horas_semana_actual >= r.horas_max_semana * 0.9 ? '⚠️' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Franja horaria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hora inicio *</label>
              <input className="input" type="time" min="07:00" max="19:00" value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} />
            </div>
            <div>
              <label className="label">Hora fin *</label>
              <input className="input" type="time" min="07:00" max="19:00" value={form.hora_fin} onChange={(e) => set('hora_fin', e.target.value)} />
            </div>
          </div>

          {/* Capacidad calculada */}
          {form.recurso_id && (
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
              📊 Capacidad calculada: <strong>{capacidad} pacientes</strong>
              {(parseInt(form.hora_fin) - parseInt(form.hora_inicio)) >= 6 && ' (incluye 1h almuerzo)'}
            </div>
          )}

          {/* Auxiliar (si aplica) */}
          {consultorio.requiere_auxiliar && (
            <div>
              <label className="label">Auxiliar de enfermería * <span className="text-gray-400 font-normal">(requerida para {consultorio.especialidad})</span></label>
              <select className="input" value={form.auxiliar_id} onChange={(e) => set('auxiliar_id', e.target.value)}>
                <option value="">Seleccionar auxiliar...</option>
                {auxiliares.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} · {a.horas_semana_actual}h / {a.horas_max_semana}h {a.estado_badge === 'liberada' ? '🟡 liberada' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error de conflicto */}
          {conflicto && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
              <div className="font-medium mb-0.5">⛔ Conflicto de horario</div>
              <div>{conflicto}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!valid || isPending}
          >
            {isPending ? <Spinner size="sm" /> : 'Guardar asignación'}
          </button>
        </div>
      </div>
    </div>
  )
}
