import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { asignacionService, recursoService, semanaService } from '@/services/api'
import { Spinner } from '@/components/ui'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { calcularCapacidadPacientes, DIAS_FULL, DIAS, TIPOS_RECURSO } from '@/utils/helpers'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useAuthStore } from '@/store/authStore'

/**
 * Modal de asignación (crear o editar).
 *
 * Props:
 *  - data: { consultorioId, consultorio, dia, semanaId }   ← obligatorio
 *  - asignacion?: object  ← si viene, modo EDICIÓN (prefill + PUT)
 *  - sedeId, onClose, onSaved
 */
export default function AsignacionModal({ data, asignacion, sedeId, onClose, onSaved }) {
  const { roomId: consultorioId, room: consultorio, day: dia, weekId: semanaId, especialidadOverride } = data
  const editando = !!asignacion
  const { user } = useAuthStore()
  const esSupervisor = user?.role === 'supervisor' || user?.role === 'gerencia'

  // Cuando la SEDE del consultorio ya tiene cierre semanal, solo el supervisor/
  // gerencia puede editar y debe registrar un motivo (queda en auditoría).
  const { data: estadoSedes } = useQuery({
    queryKey: ['semana-estado-sedes', semanaId],
    queryFn: () => semanaService.estadoPorSede(semanaId),
    enabled: !!semanaId,
  })
  const sedeCerrada = (estadoSedes?.sites ?? []).some(
    (s) => s.site_id === consultorio?.site_id && s.cerrada,
  )
  const requiereMotivo = sedeCerrada && esSupervisor

  // El servicio activo puede ser el principal del consultorio o el alternativo
  // (cuando hay servicio alternativo y el coord lo escogió). En cualquier caso
  // se comporta como un consultorio normal de esa especialidad: el "recurso
  // principal" es el médico/profesional del tipo correspondiente y el auxiliar
  // se exige solo si esa especialidad lo requiere (oftalmología y anestesiología).
  const especialidadActiva = especialidadOverride ?? consultorio.specialty
  const esServicioAlternativo = !!especialidadOverride && especialidadOverride !== consultorio.specialty
  // Oftalmología y anestesiología EXIGEN al menos un recurso de apoyo (aux).
  // Diagnóstico PERMITE un segundo técnico de apoyo (opcional) — uno puede
  // salir antes que el otro para otro servicio.
  const ESPECIALIDADES_EXIGEN_APOYO = ['oftalmologia', 'anestesiologia']
  const ESPECIALIDADES_PERMITEN_APOYO = ['oftalmologia', 'anestesiologia', 'diagnostico']
  const _exigeApoyoPorEspecialidad = ESPECIALIDADES_EXIGEN_APOYO.includes(especialidadActiva)
  const permiteApoyoOpcional = ESPECIALIDADES_PERMITEN_APOYO.includes(especialidadActiva)
  // En diagnóstico el apoyo es OTRO TÉCNICO, no una auxiliar.
  const esDiagnostico = especialidadActiva === 'diagnostico'
  const tipoApoyo = esDiagnostico ? 'tecnico' : 'auxiliar'
  const labelApoyo = esDiagnostico ? 'Técnico de apoyo' : 'Auxiliar de enfermería'
  const labelApoyoBuscar = esDiagnostico ? '🔍 Buscar segundo técnico…' : '🔍 Buscar y seleccionar auxiliar…'
  const labelApoyo2 = esDiagnostico ? 'Técnico de apoyo #2' : 'Auxiliar de enfermería #2'

  const [form, setForm] = useState({
    resource_id:   asignacion?.resource_id   ?? asignacion?.resourceId   ?? '',
    assistant_id:  asignacion?.assistant_id  ?? asignacion?.assistantId  ?? '',
    assistant2_id: asignacion?.assistant2_id ?? asignacion?.assistant2Id ?? '',
    start_time:  asignacion?.start_time  ?? asignacion?.startTime  ?? '07:00',
    end_time:     asignacion?.end_time     ?? asignacion?.endTime     ?? '13:00',
    // Sub-horarios opcionales por auxiliar. Si "" → hereda del recurso principal.
    assistant_start_time:  asignacion?.assistant_start_time  ?? asignacion?.assistantStartTime  ?? '',
    assistant_end_time:     asignacion?.assistant_end_time     ?? asignacion?.assistantEndTime     ?? '',
    assistant2_start_time: asignacion?.assistant2_start_time ?? asignacion?.assistant2StartTime ?? '',
    assistant2_end_time:    asignacion?.assistant2_end_time    ?? asignacion?.assistant2EndTime    ?? '',
    // Override manual de pacientes programados. "" = usar el cálculo nominal.
    // Al editar, pre-llenamos con el valor guardado (pacientes_capacidad) para que
    // el coord vea el número actual y pueda editarlo si quiere; si lo borra → recalcula.
    expected_patients: asignacion?.patient_capacity ?? asignacion?.patientCapacity ?? '',
    // Motivo obligatorio cuando el supervisor edita una sede cerrada (queda en
    // auditoría). Se muestra el input solo si `requiereMotivo` es true.
    supervisor_reason: '',
  })
  // Toggle local "horario distinto al recurso principal" para cada auxiliar.
  const [auxHorarioDistinto,  setAuxHorarioDistinto]  = useState(!!(asignacion?.assistant_start_time  ?? asignacion?.assistantStartTime))
  const [aux2HorarioDistinto, setAux2HorarioDistinto] = useState(!!(asignacion?.assistant2_start_time ?? asignacion?.assistant2StartTime))
  // "Servicio sin auxiliar": algunos doctores realizan consultas/procedimientos
  // que NO requieren apoyo de aux. El coord lo marca conscientemente y el modal
  // deja de exigir aux como obligatoria. Pre-llenado true cuando editamos una
  // asignación que YA fue guardada sin aux en una especialidad que normalmente
  // la exige (lo más probable: el coord ya marcó este check en su momento).
  const _yaGuardadaSinAux = !!asignacion && !(asignacion?.assistant_id ?? asignacion?.assistantId)
  const [sinAuxiliar, setSinAuxiliar] = useState(_yaGuardadaSinAux && ESPECIALIDADES_EXIGEN_APOYO.includes(especialidadActiva))
  // Si el coord marca "sin auxiliar", la exigencia se cae. La sección de apoyo
  // sigue mostrándose como opcional (o ni siquiera, ver más abajo) por si
  // luego cambian de idea durante la edición.
  const requiereAuxAdicional = _exigeApoyoPorEspecialidad && !sinAuxiliar
  const [conflicto, setConflicto] = useState(null)
  const { tryClose } = useDirtyClose(form, onClose)

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setConflicto(null) }

  // Cargamos el "recurso principal" según la especialidad activa, no según
  // si es principal o alternativo. Si es oftalmología → oftalmólogos. Si es
  // diagnostico → técnicos. Etc.
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-disponibles', especialidadActiva],
    queryFn: () => recursoService.list({ especialidad_consultorio: especialidadActiva, active: true }),
  })

  // Pool de recursos de apoyo. En diagnóstico cargamos técnicos; en oftalmo/anest, auxiliares.
  // Filtramos al técnico principal del pool para que no se pueda elegir a sí mismo.
  const { data: poolApoyo = [] } = useQuery({
    queryKey: ['pool-apoyo', tipoApoyo],
    queryFn: () => recursoService.list({ type: tipoApoyo, active: true }),
    enabled: permiteApoyoOpcional,
  })
  const auxiliares = esDiagnostico
    ? poolApoyo.filter((r) => r.id !== form.resource_id)
    : poolApoyo

  const recursoSel = recursos.find((r) => r.id === form.resource_id)
  const capacidad = form.resource_id
    ? calcularCapacidadPacientes(
        form.start_time,
        form.end_time,
        recursoSel?.slot_minutes ?? 10,
        recursoSel?.type,
      )
    : 0

  const { mutate: doEliminar, isPending: eliminando } = useMutation({
    mutationFn: () => asignacionService.remove(asignacion.id),
    onSuccess: () => { toast.success('Asignación eliminada'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'No se pudo eliminar'),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        week_id:      semanaId,
        room_id: consultorioId,
        resource_id:     form.resource_id,
        assistant_id:    form.assistant_id || null,
        assistant2_id:   form.assistant2_id || null,
        weekday:     dia,
        start_time:    form.start_time,
        end_time:       form.end_time,
        // Sub-horarios: solo se envían si el toggle está activo. Si no, null = hereda.
        assistant_start_time:  auxHorarioDistinto  && form.assistant_id  ? form.assistant_start_time  : null,
        assistant_end_time:     auxHorarioDistinto  && form.assistant_id  ? form.assistant_end_time     : null,
        assistant2_start_time: aux2HorarioDistinto && form.assistant2_id ? form.assistant2_start_time : null,
        assistant2_end_time:    aux2HorarioDistinto && form.assistant2_id ? form.assistant2_end_time    : null,
        // Override manual: si el coord escribió un número, lo manda. Vacío = backend calcula.
        expected_patients: form.expected_patients === '' ? null : Number(form.expected_patients),
        // Motivo: solo se envía si la sede está cerrada y el supervisor llenó el campo.
        supervisor_reason: requiereMotivo ? form.supervisor_reason : undefined,
      }
      return editando
        ? asignacionService.update(asignacion.id, payload)
        : asignacionService.create(payload)
    },
    onSuccess: () => { toast.success(editando ? 'Asignación actualizada' : 'Asignación guardada'); onSaved() },
    onError: (err) => {
      if (err?.code === 'CONFLICTO_HORARIO') setConflicto(err.detalle)
      else toast.error(err?.message ?? 'Error al guardar la asignación')
    },
  })

  const confirm = useConfirm()
  const confirmarEliminar = async () => {
    const ok = await confirm({
      title: '¿Eliminar esta asignación?',
      message: 'Esta acción no se puede deshacer. El recurso ya no aparecerá en la grilla y se notificará al afectado.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (ok) doEliminar()
  }

  const diaLabel = DIAS_FULL[DIAS.indexOf(dia)] ?? dia
  const motivoOk = !requiereMotivo || (form.supervisor_reason && form.supervisor_reason.trim().length >= 5)
  const valid = form.resource_id && form.start_time && form.end_time && (!requiereAuxAdicional || form.assistant_id) && motivoOk

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {editando ? 'Editar asignación' : 'Nueva asignación'}
            </h2>
            <p className="text-xs text-gray-500">
              {consultorio.name} · {diaLabel}
              {esServicioAlternativo && (
                <span className="ml-2 inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium uppercase tracking-wide">
                  Servicio alterno
                </span>
              )}
            </p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Recurso principal — buscable */}
          <div>
            <label className="label">Recurso principal * <span className="text-gray-400 font-normal">({recursos.length} disponibles)</span></label>
            <SearchableSelect
              value={form.resource_id}
              onChange={(id) => set('resource_id', id)}
              placeholder="🔍 Buscar y seleccionar recurso…"
              options={recursos.map((r) => {
                const tipo = TIPOS_RECURSO.find((t) => t.value === r.type)
                const horas = r.current_week_hours ?? r.currentWeekHours ?? 0
                // null cuando el recurso NO tiene tope semanal (oftalmólogos por
                // paciente). En ese caso el ⚠️ nunca debe aparecer.
                const maxHoras = r.max_hours_per_week ?? r.maxHoursPerWeek ?? null
                const cerca = maxHoras != null && horas >= maxHoras * 0.9
                return {
                  id: r.id,
                  label: `${r.name}${cerca ? ' ⚠️' : ''}`,
                  sublabel: `${tipo?.label ?? r.type}${r.specialty ? ' · ' + r.specialty : ''}${r.slot_minutes ? ' · ' + r.slot_minutes + 'min/pac.' : ''}`,
                }
              })}
            />
          </div>

          {/* Franja horaria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Hora inicio *</label>
              <input className="input" type="time" min="07:00" max="19:00" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="label">Hora fin *</label>
              <input className="input" type="time" min="07:00" max="19:00" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
            </div>
          </div>

          {/* Capacidad calculada + override manual */}
          {form.resource_id && (
            <div className="space-y-2">
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
                📊 Capacidad calculada: <strong>{capacidad} pacientes</strong>
                {/* Regla v4 (jul-2026): turnos ≥ 6h descuentan almuerzo, EXCEPTO
                    técnicos con 07:00-13:00 o 13:00-19:00 exactos (corridos). */}
                {(() => {
                  const dur = parseInt(form.end_time) - parseInt(form.start_time)
                  if (dur < 6) return null
                  const esTecCorrido = recursoSel?.type === 'tecnico' &&
                    ((form.start_time === '07:00' && form.end_time === '13:00') ||
                     (form.start_time === '13:00' && form.end_time === '19:00'))
                  if (esTecCorrido) {
                    return <> · <span title="Técnico con turno partido de ayudas diagnósticas: trabaja corrido sin receso">sin descuento de almuerzo (técnico turno corrido)</span></>
                  }
                  const dur30 = ['oftalmologo','anestesiologo','optometra','fonoaudiologa','otorrino'].includes(recursoSel?.type)
                  return <> · descontando {dur30 ? '30 min' : '1 h'} de almuerzo</>
                })()}
              </div>
              <div>
                <label className="label">
                  Pacientes programados reales <span className="text-gray-400 font-normal">(opcional · si lo conoces de la agenda externa)</span>
                </label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="200"
                  placeholder={`Vacío = usar ${capacidad} (capacidad calculada)`}
                  value={form.expected_patients}
                  onChange={(e) => set('pacientes_esperados', e.target.value)}
                />
                {form.expected_patients !== '' && Number(form.expected_patients) !== capacidad && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    ⚠️ Sobrescribirá el cálculo: se guardarán <strong>{form.expected_patients} pacientes</strong> en lugar de {capacidad}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toggle "servicio sin auxiliar": solo aplica a especialidades que
              normalmente la EXIGEN (oftalmo/anestesio). El coord lo marca cuando
              el doctor realiza el servicio solo (consulta simple, control, etc.). */}
          {_exigeApoyoPorEspecialidad && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sinAuxiliar}
                  onChange={(e) => {
                    const v = e.target.checked
                    setSinAuxiliar(v)
                    if (v) {
                      // Al marcar "sin aux" limpiamos cualquier aux ya seleccionada
                      // para que no se persista una asignación inconsistente.
                      setForm((f) => ({
                        ...f,
                        assistant_id: '',
                        assistant2_id: '',
                        assistant_start_time: '',
                        assistant_end_time: '',
                        assistant2_start_time: '',
                        assistant2_end_time: '',
                      }))
                      setAuxHorarioDistinto(false)
                      setAux2HorarioDistinto(false)
                    }
                  }}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-medium text-amber-900">
                    Este servicio NO requiere auxiliar de enfermería
                  </div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Marca esta casilla si el doctor realiza este servicio solo (consulta simple, control, lectura, etc.). El sistema dejará de exigir auxiliar.
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Recurso de apoyo (si aplica) — buscable.
              En oftalmo/anestesio es OBLIGATORIO (asterisco).
              En diagnóstico es OPCIONAL (segundo técnico que puede salir antes).
              Se oculta cuando el coord marca "sin auxiliar". */}
          {permiteApoyoOpcional && !sinAuxiliar && (
            <>
              <div>
                <label className="label">
                  {labelApoyo} {requiereAuxAdicional ? '*' : <span className="text-gray-400 font-normal">(opcional)</span>}
                  <span className="text-gray-400 font-normal"> ({auxiliares.length} disponibles)</span>
                </label>
                <SearchableSelect
                  value={form.assistant_id}
                  onChange={(id) => set('assistant_id', id)}
                  placeholder={labelApoyoBuscar}
                  options={auxiliares
                    .filter((a) => a.id !== form.assistant2_id)  // no mostrar la que ya está en aux #2
                    .map((a) => {
                      const horas = a.current_week_hours ?? a.currentWeekHours ?? 0
                      const max = a.max_hours_per_week ?? a.maxHoursPerWeek ?? 42
                      const liberada = a.status_badge === 'liberada'
                      return {
                        id: a.id,
                        label: `${a.name}${liberada ? ' 🟡 liberada' : ''}`,
                        sublabel: `${horas}h / ${max}h`,
                      }
                    })}
                />
                {form.assistant_id && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-gray-600 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={auxHorarioDistinto}
                        onChange={(e) => {
                          setAuxHorarioDistinto(e.target.checked)
                          if (e.target.checked && !form.assistant_start_time) {
                            set('assistant_start_time', form.start_time)
                            set('assistant_end_time', form.end_time)
                          }
                        }}
                      />
                      Horario distinto al recurso principal {esDiagnostico ? '(este técnico se va antes para otro servicio)' : '(esta aux cubre solo parte del turno)'}
                    </label>
                    {auxHorarioDistinto && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[11px] text-gray-500">Aux hora inicio</label>
                          <input
                            className="input"
                            type="time"
                            min={form.start_time}
                            max={form.end_time}
                            value={form.assistant_start_time}
                            onChange={(e) => set('assistant_start_time', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">Aux hora fin</label>
                          <input
                            className="input"
                            type="time"
                            min={form.start_time}
                            max={form.end_time}
                            value={form.assistant_end_time}
                            onChange={(e) => set('assistant_end_time', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Recurso de apoyo #2 — opcional. Solo aparece si el #1 ya está seleccionado. */}
              {form.assistant_id && (
                <div>
                  <label className="label">
                    {labelApoyo2} <span className="text-gray-400 font-normal">(opcional{esDiagnostico ? '' : ' · doc complejos / cirugías'})</span>
                  </label>
                  <SearchableSelect
                    value={form.assistant2_id}
                    onChange={(id) => set('assistant2_id', id)}
                    placeholder={esDiagnostico ? '🔍 Buscar segundo técnico de apoyo…' : '🔍 Buscar segunda auxiliar (si aplica)…'}
                    options={auxiliares
                      .filter((a) => a.id !== form.assistant_id)  // no mostrar la que ya está en aux #1
                      .map((a) => {
                        const horas = a.current_week_hours ?? a.currentWeekHours ?? 0
                        const max = a.max_hours_per_week ?? a.maxHoursPerWeek ?? 42
                        const liberada = a.status_badge === 'liberada'
                        return {
                          id: a.id,
                          label: `${a.name}${liberada ? ' 🟡 liberada' : ''}`,
                          sublabel: `${horas}h / ${max}h`,
                        }
                      })}
                  />
                  {form.assistant2_id && (
                    <>
                      <label className="flex items-center gap-2 text-xs text-gray-600 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aux2HorarioDistinto}
                          onChange={(e) => {
                            setAux2HorarioDistinto(e.target.checked)
                            if (e.target.checked && !form.assistant2_start_time) {
                              set('assistant2_start_time', form.start_time)
                              set('assistant2_end_time', form.end_time)
                            }
                          }}
                        />
                        Horario distinto al recurso principal
                      </label>
                      {aux2HorarioDistinto && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="text-[11px] text-gray-500">Aux #2 hora inicio</label>
                            <input
                              className="input"
                              type="time"
                              min={form.start_time}
                              max={form.end_time}
                              value={form.assistant2_start_time}
                              onChange={(e) => set('assistant2_start_time', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500">Aux #2 hora fin</label>
                            <input
                              className="input"
                              type="time"
                              min={form.start_time}
                              max={form.end_time}
                              value={form.assistant2_end_time}
                              onChange={(e) => set('assistant2_end_time', e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-red-500 mt-1"
                        onClick={() => { set('assistant2_id', ''); setAux2HorarioDistinto(false) }}
                        title="Quitar"
                      >
                        × Quitar {esDiagnostico ? 'técnico de apoyo #2' : 'segunda auxiliar'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Motivo obligatorio cuando supervisor edita una sede cerrada (queda en auditoría) */}
          {requiereMotivo && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <label className="label text-red-900">
                Motivo de modificación de sede cerrada * <span className="text-red-700 font-normal">(mín 5 caracteres — queda en el log de auditoría)</span>
              </label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.supervisor_reason}
                onChange={(e) => set('motivo_supervisor', e.target.value)}
                placeholder="Ej: Corrección solicitada por gerencia tras revisión del cierre · ticket #..."
              />
              <div className="text-[11px] text-red-700 mt-1">
                ⚠️ Esta sede ya cerró su semana. Como supervisor/gerencia puedes editar, pero el cambio queda registrado en auditoría con tu identificación y el motivo.
              </div>
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

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          {editando && (
            <button
              className="btn-danger sm:mr-auto justify-center"
              onClick={confirmarEliminar}
              disabled={eliminando || isPending}
            >
              {eliminando ? <Spinner size="sm" /> : '🗑️ Eliminar'}
            </button>
          )}
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!valid || isPending || eliminando}
          >
            {isPending ? <Spinner size="sm" /> : (editando ? 'Guardar cambios' : 'Guardar asignación')}
          </button>
        </div>
      </div>
    </div>
  )
}
