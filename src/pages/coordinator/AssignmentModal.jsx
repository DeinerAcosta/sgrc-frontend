import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { asignacionService, recursoService, semanaService, usuarioService, matrizService } from '@/services/api'
import { Spinner } from '@/components/ui'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { calcularCapacidadPacientes, DIAS_FULL, DIAS, TIPOS_RECURSO, ESPECIALIDADES_EXIGEN_APOYO, ESPECIALIDADES_PERMITEN_APOYO } from '@/utils/helpers'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useAuthStore } from '@/store/authStore'
import AssignmentWeekGrid from '@/pages/coordinator/AssignmentWeekGrid'
import { AuxiliarBar, AuxiliarTabla } from '@/pages/coordinator/AuxiliarGridSelect'
import { elegible, huecosSinCubrir, horaPorDefecto } from '@/utils/matriz'

/**
 * Modal de asignación (crear o editar).
 *
 * Props:
 *  - data: { consultorioId, consultorio, dia, semanaId }   ← obligatorio
 *  - asignacion?: object  ← si viene, modo EDICIÓN (prefill + PUT)
 *  - sedeId, onClose, onSaved
 */
/**
 * Nov-2026 · Las auxiliares del turno como lista (antes "auxiliar" y "auxiliar
 * #2" fijas). Cada una con su horario; `horaManual` = el coordinador la tocó y
 * ya no se recalcula; `auto` = la puso el sistema por la Matriz.
 */
function auxiliaresIniciales(a) {
  if (!a) return []
  const ini = a.start_time ?? a.startTime
  const fin = a.end_time ?? a.endTime
  const lista = a.assistants?.length
    ? a.assistants.map((x) => ({ id: x.resource_id ?? x.resourceId, ini: x.start_time ?? x.startTime, fin: x.end_time ?? x.endTime }))
    : [
        { id: a.assistant_id ?? a.assistantId, ini: a.assistant_start_time ?? a.assistantStartTime, fin: a.assistant_end_time ?? a.assistantEndTime },
        { id: a.assistant2_id ?? a.assistant2Id, ini: a.assistant2_start_time ?? a.assistant2StartTime, fin: a.assistant2_end_time ?? a.assistant2EndTime },
      ]
  return lista.filter((x) => x.id).map((x) => ({ id: x.id, ini: x.ini || ini, fin: x.fin || fin, auto: false, horaManual: true }))
}
const AUX_VACIA = { id: '', ini: '', fin: '', auto: false, horaManual: false }

export default function AsignacionModal({ data, asignacion, sedeId, grilla, onClose, onSaved }) {
  const {
    roomId: consultorioId, room: consultorio, day: dia, weekId: semanaId, especialidadOverride,
    // Oct-2026 · Cuando se llega desde "Mover la agenda", el modal sabe a quién
    // se está reubicando y a qué ausencia pertenece el movimiento.
    recursoPrecargado, recursoPrecargadoNombre, cubreAusenciaId, franjaCaida,
    // Oct-2026 · Cuántos pacientes faltan por reprogramar en ese caso. Hector:
    // "en pacientes reales no aceptar una cantidad mayor a la que debe ser
    // repro: si son 20, bloquear 21 en adelante".
    pacientesPorReprogramar,
  } = data
  const editando = !!asignacion
  const { user } = useAuthStore()
  // 3739 · En una casilla vacía también se puede crear el turno en contingencia.
  const [enContingencia, setEnContingencia] = useState(false)
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
  // se exige solo si esa especialidad lo requiere (ver ESPECIALIDADES_EXIGEN_APOYO).
  const especialidadActiva = especialidadOverride ?? consultorio.specialty
  const esServicioAlternativo = !!especialidadOverride && especialidadOverride !== consultorio.specialty
  // Oftalmología, anestesiología y otorrinolaringología EXIGEN al menos un
  // recurso de apoyo (aux). Diagnóstico PERMITE un segundo técnico de apoyo
  // (opcional) — uno puede salir antes que el otro para otro servicio.
  // Sep-2026: las dos listas estaban escritas a mano aquí dentro y se habían
  // quedado sin otorrino; ahora salen de helpers, espejo del backend.
  const _exigeApoyoPorEspecialidad = ESPECIALIDADES_EXIGEN_APOYO.includes(especialidadActiva)
  const permiteApoyoOpcional = ESPECIALIDADES_PERMITEN_APOYO.includes(especialidadActiva)
  // En diagnóstico el apoyo es OTRO TÉCNICO, no una auxiliar.
  const esDiagnostico = especialidadActiva === 'diagnostico'
  const tipoApoyo = esDiagnostico ? 'tecnico' : 'auxiliar'
  const labelApoyo = esDiagnostico ? 'Técnico de apoyo' : 'Auxiliar de enfermería'
  const labelApoyoBuscar = esDiagnostico ? 'Elegir técnico de apoyo' : 'Elegir auxiliar'

  const [form, setForm] = useState({
    resource_id:   asignacion?.resource_id   ?? asignacion?.resourceId   ?? recursoPrecargado ?? '',
    // Nov-2026 · Las auxiliares en lista; siempre al menos una fila para la barra.
    auxs: auxiliaresIniciales(asignacion).length ? auxiliaresIniciales(asignacion) : [{ ...AUX_VACIA }],
    // Oct-2026 · Viniendo de una reprogramacion, la franja nueva arranca con
    // el horario y los pacientes de la que se cayo: es lo que hay que reponer.
    // Se puede cambiar, pero el valor por defecto deja de ser una suposicion.
    start_time:  asignacion?.start_time  ?? asignacion?.startTime  ?? franjaCaida?.start_time ?? '07:00',
    end_time:     asignacion?.end_time     ?? asignacion?.endTime     ?? franjaCaida?.end_time ?? '13:00',
    // Override manual de pacientes programados. "" = usar el cálculo nominal.
    // Al editar, pre-llenamos con el valor guardado (pacientes_capacidad) para que
    // el coord vea el número actual y pueda editarlo si quiere; si lo borra → recalcula.
    expected_patients: asignacion?.patient_capacity ?? asignacion?.patientCapacity ?? franjaCaida?.patient_capacity ?? '',
    // Motivo obligatorio cuando el supervisor edita una sede cerrada (queda en
    // auditoría). Se muestra el input solo si `requiereMotivo` es true.
    supervisor_reason: '',
    // Oct-2026 · Se hace cargo aunque ya tenga turno en esa franja. Única
    // excepción a RN-08; por eso se marca a mano y nunca viene puesta.
    assume_overlap: false,
    // Sep-2026 · Ley 2101 · Autorización directivo para aux que trabajan
    // sáb+dom en la misma semana. Se llenan solo si el modal detecta el
    // escenario y el coord elige un directivo.
    authorized_by_id:    asignacion?.authorized_by_id    ?? asignacion?.authorizedById    ?? '',
    authorization_reason: asignacion?.authorization_reason ?? asignacion?.authorizationReason ?? '',
  })
  // "Servicio sin auxiliar": algunos doctores realizan consultas/procedimientos
  // que NO requieren apoyo de aux. El coord lo marca conscientemente y el modal
  // deja de exigir aux como obligatoria. Pre-llenado true cuando editamos una
  // asignación que YA fue guardada sin aux en una especialidad que normalmente
  // la exige (lo más probable: el coord ya marcó este check en su momento).
  const _yaGuardadaSinAux = !!asignacion && auxiliaresIniciales(asignacion).length === 0
  // Casilla "Este servicio NO requiere auxiliar". Solo existe donde la auxiliar
  // es obligatoria; en diagnóstico el técnico de apoyo es opcional y no aplica.
  const [sinAuxiliar, setSinAuxiliar] = useState(
    ESPECIALIDADES_EXIGEN_APOYO.includes(especialidadActiva) ? _yaGuardadaSinAux : false,
  )
  // Si el coord marca "sin auxiliar", la exigencia se cae. La sección de apoyo
  // sigue mostrándose como opcional (o ni siquiera, ver más abajo) por si
  // luego cambian de idea durante la edición.
  // En una reprogramación no se pide auxiliar: eso lo asigna el coordinador
  // de la sede, que es quien conoce a su equipo. Quien reubica la agenda
  // decide QUIÉN atiende, no CON QUIÉN.
  const esReprogramacion = !!cubreAusenciaId && !editando
  // Solo en una reprogramación hay tope: lo que falta por reprogramar del caso.
  const topePacientes = esReprogramacion && pacientesPorReprogramar > 0 ? pacientesPorReprogramar : null
  // Obligatoria donde la especialidad la exige, salvo que marque la casilla.
  const requiereAuxAdicional = _exigeApoyoPorEspecialidad && !sinAuxiliar && !esReprogramacion
  const [conflicto, setConflicto] = useState(null)
  // El resumen previo a guardar. null = cerrado. { conflicto } se llena solo
  // si el servidor rechazo por turno solapado, y entonces el mismo resumen
  // ofrece seguir asumiendo las dos agendas.
  const [resumen, setResumen] = useState(null)
  const { tryClose } = useDirtyClose(form, onClose)

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setConflicto(null) }

  // Cargamos el "recurso principal" según la especialidad activa, no según
  // si es principal o alternativo. Si es oftalmología → oftalmólogos. Si es
  // diagnostico → técnicos. Etc.
  // Nov-2026 · Con week_id las horas son las de la semana que se programa.
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-disponibles', especialidadActiva, semanaId],
    queryFn: () => recursoService.list({ especialidad_consultorio: especialidadActiva, active: true, week_id: semanaId }),
  })

  // Pool de recursos de apoyo. En diagnóstico cargamos técnicos; en oftalmo/anest, auxiliares.
  // Filtramos al técnico principal del pool para que no se pueda elegir a sí mismo.
  // Nov-2026 · Con week_id las horas de cada auxiliar son de la semana que se
  // programa (antes eran las de la semana de hoy).
  const { data: poolApoyo = [] } = useQuery({
    queryKey: ['pool-apoyo', tipoApoyo, semanaId],
    queryFn: () => recursoService.list({ type: tipoApoyo, active: true, week_id: semanaId }),
    enabled: permiteApoyoOpcional,
  })
  const auxiliares = esDiagnostico
    ? poolApoyo.filter((r) => r.id !== form.resource_id)
    : poolApoyo
  const auxsElegidas = form.auxs.filter((x) => x.id)

  // Sep-2026 · Ley 2101 · Autorización directivo para aux sáb+dom.
  const esFinde = dia === 'sabado' || dia === 'domingo'
  const otroDiaFinde = dia === 'sabado' ? 'domingo' : 'sabado'
  const auxsSeleccionados = auxsElegidas.map((x) => x.id)
  const auxsTipoAuxiliar = auxsSeleccionados
    .map((id) => auxiliares.find((a) => a.id === id))
    .filter((r) => r?.type === 'auxiliar')
  const necesitaChequearFinde = esFinde && auxsTipoAuxiliar.length > 0

  // Consultar si CUALQUIERA de los aux seleccionados ya tiene asignación
  // en el otro día del finde de esta misma semana. Query condicional.
  const { data: asigsAuxOtroDia = [] } = useQuery({
    queryKey: ['asignaciones', 'aux-finde', semanaId, otroDiaFinde, auxsTipoAuxiliar.map((a) => a.id).sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        auxsTipoAuxiliar.map((aux) =>
          asignacionService.list({ week_id: semanaId, resource_id: aux.id, day: otroDiaFinde }),
        ),
      )
      // Aplanar y devolver [{ auxId, auxNombre, asignaciones: [...] }]
      return auxsTipoAuxiliar.map((aux, i) => ({
        auxId: aux.id,
        auxNombre: aux.name,
        asignaciones: (results[i] ?? []).filter((a) => a.id !== asignacion?.id),
      })).filter((x) => x.asignaciones.length > 0)
    },
    enabled: necesitaChequearFinde,
  })
  const auxsQueRequierenAutorizacion = asigsAuxOtroDia
  const requiereAutorizacionFinde = auxsQueRequierenAutorizacion.length > 0

  // Lista de directivos activos — solo se carga si aplica el escenario.
  const { data: directivos = [] } = useQuery({
    queryKey: ['directivos'],
    queryFn: () => usuarioService.listDirectivos(),
    enabled: requiereAutorizacionFinde,
    staleTime: 5 * 60 * 1000,
  })

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
    // `extra` fuerza banderas en un reenvío puntual sin esperar a que el estado
    // se actualice: el aviso de "ya tiene turno a esa hora" reenvía en el mismo
    // tick en que la persona acepta, y ahí setForm todavía no se aplicó.
    mutationFn: (extra = {}) => {
      const payload = {
        week_id:      semanaId,
        room_id: consultorioId,
        resource_id:     form.resource_id,
        // Nov-2026 · Todas las auxiliares, cada una con su horario.
        assistants: verApoyo
          ? auxsElegidas.map((x) => ({ resource_id: x.id, start_time: x.ini || form.start_time, end_time: x.fin || form.end_time }))
          : [],
        weekday:     dia,
        start_time:    form.start_time,
        end_time:       form.end_time,
        // Override manual: si el coord escribió un número, lo manda. Vacío = backend calcula.
        expected_patients: form.expected_patients === '' ? null : Number(form.expected_patients),
        // Motivo: solo se envía si la sede está cerrada y el supervisor llenó el campo.
        supervisor_reason: requiereMotivo ? form.supervisor_reason : undefined,
        // Autorización fin de semana (Ley 2101 · aux con sáb+dom la misma semana).
        // Solo se envían si el escenario aplica; sino el backend guarda null.
        authorized_by_id:    requiereAutorizacionFinde ? (form.authorized_by_id || undefined) : undefined,
        authorization_reason: requiereAutorizacionFinde ? (form.authorization_reason || undefined) : undefined,
        // Oct-2026 · Viniendo de "Mover la agenda", el turno nuevo queda atado a
        // la ausencia que lo origina. Sirve igual si se reubica al MISMO médico
        // en otro día —que es el caso más común— o si se pone a otro: en los dos
        // el movimiento sale del mismo hecho y así se puede contar después.
        is_replacement:     cubreAusenciaId ? true : undefined,
        covered_absence_id: cubreAusenciaId || undefined,
        assume_overlap:     cubreAusenciaId && (form.assume_overlap || extra.assume_overlap) ? true : undefined,
        // 3739 · Crear el turno ya en contingencia (casilla vacía).
        contingency:        !editando && enContingencia ? true : undefined,
      }
      return editando
        ? asignacionService.update(asignacion.id, payload)
        : asignacionService.create(payload)
    },
    onSuccess: () => { toast.success(editando ? 'Asignación actualizada' : 'Asignación guardada'); onSaved() },
    onError: (err) => {
      // En una reprogramación, que el profesional ya tenga turno en esa franja
      // no es un error: es el caso de "se hace cargo también de esta agenda".
      // Se le explica y se le deja seguir, en vez de dejarlo contra la pared.
      if (esReprogramacion && /^Conflicto:/.test(err?.message ?? '')) {
        setResumen({ conflicto: err.message })
        return
      }
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

  // Bug real recurrente: coord escribe "01:00" pensando que es 1 PM (el sistema
  // usa formato 24h → "01:00" es 1 AM). Genera bloques enormes (p.ej. 01-16 =
  // 15h) y conflictos falsos con otras auxiliares. Pedimos confirmación explícita
  // cuando la hora inicio queda fuera del rango típico de operación (07-19).
  const handleGuardar = async () => {
    const horaInicioAtipica = form.start_time && form.start_time < '07:00'
    if (horaInicioAtipica) {
      const sugerida = (() => {
        const h = parseInt(form.start_time.slice(0, 2), 10)
        return h >= 1 && h <= 6 ? String(h + 12).padStart(2, '0') + form.start_time.slice(2) : null
      })()
      const ok = await confirm({
        title: '¿Hora de inicio antes de las 07:00?',
        message:
          `La hora de inicio "${form.start_time}" está antes del horario típico de operación.\n\n` +
          (sugerida
            ? `El sistema usa formato de 24 horas: "${form.start_time}" = ${parseInt(form.start_time.slice(0,2),10)} AM (madrugada).\n` +
              `Si quería registrar por la tarde, debería ser "${sugerida}".\n\n` +
              `¿Confirma que la asignación empieza a las ${form.start_time} de la madrugada?`
            : `¿Confirma que la asignación empieza a las ${form.start_time}?`),
        confirmLabel: 'Sí, es correcta',
        cancelLabel: 'Corregir',
        variant: 'warning',
      })
      if (!ok) return
    }
    // Antes guardaba directo. Ahora, al crear, pasa primero por el resumen: la
    // persona ve qué va a quedar registrado —quién, qué día, a qué hora, dónde
    // y a cuánta gente— antes de que exista. Al EDITAR no se interpone: ahí ya
    // se está mirando lo que hay y el resumen sería un clic de más.
    if (editando) { mutate(); return }
    setResumen({ conflicto: null })
  }

  const diaLabel = DIAS_FULL[DIAS.indexOf(dia)] ?? dia
  const motivoOk = !requiereMotivo || (form.supervisor_reason && form.supervisor_reason.trim().length >= 5)
  // Sep-2026 · Ley 2101 · Si el escenario aux+sáb+dom aplica, exigir directivo + motivo.
  const autorizacionOk =
    !requiereAutorizacionFinde ||
    (form.authorized_by_id && form.authorization_reason && form.authorization_reason.trim().length >= 5)
  // Nov-2026 · Hector: al elegir a alguien, el modal se parte en dos — el
  // formulario a un lado y su semana al otro (profesional y auxiliares).
  const verApoyo = permiteApoyoOpcional && !sinAuxiliar && !esReprogramacion

  // Nov-2026 · Hector: la auxiliar viene PRESELECCIONADA según la Matriz y se
  // elige en una cuadrícula con su estado en el día y la hora de este turno.
  // Cuelga de 'asignaciones' para que guardar/borrar en el Programador la
  // refresque.
  const horarioValido = !!form.start_time && !!form.end_time && form.end_time > form.start_time
  const { data: estadoTurno = [], isFetching: cargandoTurno } = useQuery({
    queryKey: ['asignaciones', 'aux-turno', semanaId, dia, form.start_time, form.end_time, form.resource_id, asignacion?.id ?? null, tipoApoyo],
    queryFn: () => matrizService.turno({
      week_id: semanaId,
      weekday: dia,
      start_time: form.start_time,
      end_time: form.end_time,
      professional_id: form.resource_id || undefined,
      exclude_assignment_id: asignacion?.id,
      type: tipoApoyo,
    }),
    enabled: verApoyo && !!semanaId && horarioValido,
    staleTime: 0,
    placeholderData: (prev) => prev,
  })
  const filasAux = (() => {
    const porId = new Map(estadoTurno.map((e) => [e.id, e]))
    return auxiliares.map((a) => {
      const e = porId.get(a.id)
      const horasSemana = a.current_week_hours ?? 0
      const tope = a.max_effective_hours ?? a.max_hours_per_week ?? null
      const capacidad = a.available_hours ?? tope
      return {
        id: a.id,
        name: a.name,
        estado: e?.estado ?? 'sin_asignar',
        motivoAusencia: e?.motivo_ausencia ?? null,
        recursosPar: e?.recursos_par ?? [],
        preseleccionada: !!e?.preseleccionada,
        horasDia: e?.horas_dia ?? 0,
        horasSemana,
        tope,
        disponibles: capacidad == null ? null : Math.max(0, Math.round((capacidad - horasSemana) * 10) / 10),
        horario: e?.horario ?? [],
        sedes: e?.sedes ?? [],
      }
    })
  })()

  // Nov-2026 · Hector: "en el 3 aux que vuelva y venga por defecto la de la
  // Matriz… hay que ir calculando que la hora siempre vaya viniendo por
  // defecto". Cada fila sin auxiliar (o puesta por el sistema) toma la
  // siguiente pareja de la Matriz que se pueda elegir, y la hora de cada una
  // es su franja de la Matriz recortada al turno o, si no tiene, el primer
  // tramo que falta cubrir. Se recalcula en orden, fila por fila, cuando cambian
  // el profesional, el horario del turno o los estados. Lo que el coordinador
  // eligió o escribió a mano no se pisa.
  const franjasMatriz = new Map(estadoTurno.map((e) => [e.id, e.franjas_matriz ?? []]))
  const candidatasMatriz = filasAux
    .filter((f) => f.preseleccionada && elegible(f.estado))
    .sort((a, b) => (b.disponibles ?? 0) - (a.disponibles ?? 0))
  const recalcularAuxs = (filas) => {
    const salida = []
    for (const fila of filas) {
      let x = { ...fila }
      if (!x.id || x.auto) {
        const usadas = new Set([...salida.map((y) => y.id), ...filas.filter((y) => y !== fila && !y.auto).map((y) => y.id)])
        const c = candidatasMatriz.find((f) => !usadas.has(f.id))
        if (c) x = { ...x, id: c.id, auto: true, horaManual: false }
        else if (x.auto) x = { ...AUX_VACIA }
      }
      if (x.id && !x.horaManual && horarioValido) {
        const huecos = huecosSinCubrir(form.start_time, form.end_time, salida.filter((y) => y.id))
        x = { ...x, ...horaPorDefecto({ franjasMatriz: franjasMatriz.get(x.id), ini: form.start_time, fin: form.end_time, huecos }) }
      }
      salida.push(x)
    }
    return salida
  }
  useEffect(() => {
    if (!verApoyo || cargandoTurno) return
    setForm((f) => {
      const nuevas = recalcularAuxs(f.auxs)
      return JSON.stringify(nuevas) === JSON.stringify(f.auxs) ? f : { ...f, auxs: nuevas }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoTurno, cargandoTurno, verApoyo, form.start_time, form.end_time])

  // Qué fila se está eligiendo en la cuadrícula (índice o null).
  const [eligiendoAux, setEligiendoAux] = useState(null)
  useEffect(() => { if (!verApoyo) setEligiendoAux(null) }, [verApoyo])

  const setAux = (i, cambios) => {
    setConflicto(null)
    setForm((f) => ({ ...f, auxs: recalcularAuxs(f.auxs.map((x, j) => (j === i ? { ...x, ...cambios } : x))) }))
  }
  const quitarAux = (i) => {
    setEligiendoAux(null)
    setForm((f) => {
      const resto = f.auxs.filter((_, j) => j !== i)
      return { ...f, auxs: resto.length ? recalcularAuxs(resto) : [{ ...AUX_VACIA }] }
    })
  }
  const agregarAux = () => {
    setForm((f) => ({ ...f, auxs: recalcularAuxs([...f.auxs, { ...AUX_VACIA }]) }))
  }
  // "Hasta que se acabe el horario del médico": se agregan mientras quede algo sin cubrir.
  const huecosTurno = huecosSinCubrir(form.start_time, form.end_time, auxsElegidas)
  const puedeAgregarAux = verApoyo && horarioValido && huecosTurno.length > 0 && form.auxs.every((x) => x.id)
  // Nov-2026 · Hector: "mitad asignar y mitad grilla". La grilla del
  // Programador va siempre a la derecha; solo se aparta mientras se elige una
  // auxiliar, porque esa cuadrícula necesita el ancho de la pantalla.
  const conPanel = eligiendoAux == null
  // Cada auxiliar con un horario válido dentro del turno.
  const horasAuxOk = auxsElegidas.every((x) => x.ini && x.fin && x.ini < x.fin && x.ini >= form.start_time && x.fin <= form.end_time)
  const valid = form.resource_id && form.start_time && form.end_time && (!requiereAuxAdicional || auxsElegidas.length > 0) && (!verApoyo || horasAuxOk) && motivoOk && autorizacionOk

  // Nov-2026 · Hector: asignar ya no es un modal sino una pantalla completa.
  // Encima del Programador (no es una ruta aparte) para no perder la semana,
  // la sede ni el caso que se está reprogramando al volver.
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      <div className="shrink-0 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4 px-4 sm:px-6 py-3">
          <button onClick={tryClose} className="btn whitespace-nowrap">← Volver al programador</button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {editando ? 'Editar asignación' : 'Nueva asignación'}
              </h2>
              {/* 3739 · Hector: "Crear contingencia", arriba al lado del título. */}
              {!editando && ['coordinador', 'supervisor', 'gerencia'].includes(user?.role) && (
                <button
                  type="button"
                  className={`text-[11px] px-2 py-0.5 rounded-md border ${enContingencia ? 'border-orange-500 bg-orange-100 text-orange-900 font-semibold' : 'border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100'}`}
                  onClick={() => setEnContingencia((v) => !v)}
                >
                  {enContingencia ? '🟧 Crear contingencia ✓' : '🟧 Crear contingencia'}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {consultorio.name} · {diaLabel}
              {esServicioAlternativo && (
                <span className="ml-2 inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium uppercase tracking-wide">
                  Servicio alterno
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:flex lg:overflow-hidden">
        {/* Mitad formulario, mitad grilla (en pantallas angostas, una debajo de la otra). */}
        <div className={`bg-white ${conPanel ? 'lg:w-1/2 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-gray-200' : 'w-full lg:overflow-y-auto'}`}>
        <div className={`px-4 sm:px-6 py-5 space-y-4 ${conPanel ? 'max-w-2xl mx-auto' : 'max-w-2xl mx-auto lg:max-w-[560px]'}`}>
          {/* Oct-2026 · Viniendo de "Mover la agenda". Sin este aviso, el medico
              aparece puesto sin explicacion y el turno queda atado a una ausencia
              sin que nadie lo haya dicho en voz alta. */}
          {cubreAusenciaId && !editando && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-900">
              🔀 Se reprograma la agenda {recursoPrecargadoNombre
                ? <>de <strong>{recursoPrecargadoNombre}</strong></>
                : 'del profesional ausente'}
            </div>
          )}
          {/* Recurso principal — buscable */}
          <div>
            <label className="label">Recurso principal <span className="text-red-600">*</span> <span className="text-gray-400 font-normal">({recursos.length} disponibles)</span></label>
            <SearchableSelect
              value={form.resource_id}
              onChange={(id) => set('resource_id', id)}
              placeholder="🔍 Buscar y seleccionar recurso…"
              visibles={3}
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

          {/* Nov-2026 · Hector: debajo del profesional, la casilla de siempre
              ("como antes, un check para ir cortando espacios"). Solo donde la
              auxiliar es obligatoria (oftalmo, anestesio, otorrino); en
              diagnóstico el técnico de apoyo es opcional y no hace falta. */}
          {_exigeApoyoPorEspecialidad && !esReprogramacion && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sinAuxiliar}
                onChange={(e) => {
                  setSinAuxiliar(e.target.checked)
                  // Al marcarla se limpia lo que hubiera elegido, para no
                  // guardar una auxiliar en un turno que dice no llevarla.
                  if (e.target.checked) setForm((f) => ({ ...f, auxs: [{ ...AUX_VACIA }] }))
                }}
              />
              <span className="text-xs font-medium text-gray-700">Este servicio NO requiere auxiliar de enfermería</span>
            </label>
          )}

          {/* Nov-2026 · Hector: orden recurso → ¿requiere auxiliar? → horario →
              auxiliares. Hora inicio, hora fin y pacientes en la misma fila.
              Los pacientes no aplican a asesores (PROYECTOS-3255 #2.1). */}
          {(() => {
            const conPacientes = recursoSel?.type !== 'asesor_servicios'
            return (
              <div className={`grid grid-cols-1 gap-3 items-end ${conPacientes ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <div>
                  <label className="label">Hora inicio <span className="text-red-600">*</span></label>
                  <input className="input" type="time" min="07:00" max="19:00" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
                </div>
                <div>
                  <label className="label">Hora fin <span className="text-red-600">*</span></label>
                  <input className="input" type="time" min="07:00" max="19:00" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
                </div>
                {conPacientes && (
                  <div>
                    <label className="label whitespace-nowrap" title="Pacientes programados reales">
                      Pacientes reales
                      {topePacientes != null && <span className="text-gray-400 font-normal"> (máx. {topePacientes})</span>}
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={topePacientes ?? 200}
                      disabled={!form.resource_id}
                      placeholder={form.resource_id ? `Vacío = ${topePacientes != null ? Math.min(capacidad, topePacientes) : capacidad}` : ''}
                      value={form.expected_patients}
                      onChange={(e) => {
                        // En una reprogramación no se aceptan más pacientes de los que
                        // faltan por reprogramar: si son 20, el 21 no entra.
                        const v = e.target.value
                        if (topePacientes != null && v !== '' && Number(v) > topePacientes) return
                        set('expected_patients', v)
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })()}

          {/* Recurso de apoyo (si aplica) — buscable.
              En oftalmo/anestesio es OBLIGATORIO (asterisco).
              En diagnóstico es OPCIONAL (segundo técnico que puede salir antes).
              Se oculta cuando el coord marca "sin auxiliar". */}
          {/* En reprogramación este bloque entero no sale: el auxiliar lo pone
              después el coordinador de la sede. */}
          {esReprogramacion && _exigeApoyoPorEspecialidad && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              El auxiliar de enfermería lo asigna el coordinador de la sede, no desde aquí.
            </div>
          )}

          {/* Nov-2026 · Hector: las auxiliares en lista, "hasta que se acabe el
              horario del médico". Cada una con su barra; al pulsarla, la
              cuadrícula se abre DEBAJO (con líneas) y se cierra al elegir. La
              hora llega sola (Matriz o lo que falta cubrir) y se puede cambiar. */}
          {verApoyo && (
            <div className="space-y-3">
              {form.auxs.map((x, i) => {
                const fila = filasAux.find((f) => f.id === x.id)
                const abierta = eligiendoAux === i
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between">
                      <label className="label">
                        {labelApoyo} {i + 1}
                        {i === 0 && (requiereAuxAdicional
                          ? <span className="text-red-600"> *</span>
                          : <span className="text-gray-400 font-normal"> (opcional)</span>)}
                        {i === 0 && <span className="text-gray-400 font-normal"> ({auxiliares.length} en total)</span>}
                      </label>
                      {(i > 0 || x.id) && (
                        <button type="button" className="text-xs text-gray-400 hover:text-red-600 mb-1" onClick={() => quitarAux(i)}>
                          Quitar
                        </button>
                      )}
                    </div>
                    <AuxiliarBar
                      fila={fila}
                      abierto={abierta}
                      onClick={() => setEligiendoAux(abierta ? null : i)}
                      cargando={cargandoTurno && !estadoTurno.length}
                      placeholder={labelApoyoBuscar}
                    />
                    {abierta && (
                      // Mientras se elige, el formulario va centrado y la cuadrícula se
                      // abre centrada bajo él, con el ancho que haya (hasta 1240px).
                      // Hector: "que esté centrado… y quede mejor espacio".
                      <div className="lg:relative lg:left-1/2 lg:-translate-x-1/2 lg:w-[min(1240px,calc(100vw-48px))]">
                        <AuxiliarTabla
                          value={x.id}
                          excluir={form.auxs.filter((_, j) => j !== i).map((y) => y.id).filter(Boolean)}
                          filas={filasAux}
                          onChange={(id) => { setAux(i, { id, auto: false, horaManual: false }); setEligiendoAux(null) }}
                          onClose={() => setEligiendoAux(null)}
                        />
                      </div>
                    )}
                    {x.id && !abierta && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">Desde</label>
                          <input
                            className="input"
                            type="time"
                            min={form.start_time}
                            max={form.end_time}
                            value={x.ini}
                            onChange={(e) => setAux(i, { ini: e.target.value, horaManual: true })}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">Hasta</label>
                          <input
                            className="input"
                            type="time"
                            min={form.start_time}
                            max={form.end_time}
                            value={x.fin}
                            onChange={(e) => setAux(i, { fin: e.target.value, horaManual: true })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {huecosTurno.length > 0 && auxsElegidas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-amber-700">
                    Sin cubrir: {huecosTurno.map((h) => `${h.ini}–${h.fin}`).join(', ')}
                  </span>
                  {puedeAgregarAux && (
                    <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={agregarAux}>
                      + Agregar {esDiagnostico ? 'técnico de apoyo' : 'auxiliar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sep-2026 · Ley 2101 · Autorizacion directivo para aux con sáb+dom */}
          {requiereAutorizacionFinde && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
              <div className="text-xs text-amber-900">
                <div className="font-semibold mb-1">⚠️ Autorización de directivo requerida (Ley 2101)</div>
                <div>
                  {auxsQueRequierenAutorizacion.map((x) => x.auxNombre).join(', ')}{' '}
                  {auxsQueRequierenAutorizacion.length === 1 ? 'ya tiene' : 'ya tienen'} asignación el <b>{otroDiaFinde}</b> de esta semana.
                  Asignar {auxsQueRequierenAutorizacion.length === 1 ? 'esta persona' : 'estas personas'} también el <b>{dia}</b> hace que trabaje el fin de semana completo — requiere autorización explícita de un directivo.
                </div>
              </div>
              <div>
                <label className="label text-amber-900">Directivo que autoriza <span className="text-red-600">*</span></label>
                <select
                  className="input"
                  value={form.authorized_by_id}
                  onChange={(e) => set('authorized_by_id', e.target.value)}
                >
                  <option value="">— Seleccione un directivo —</option>
                  {directivos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.role === 'gerencia' ? 'Gerencia' : 'Directivo'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-amber-900">
                  Motivo de la autorización <span className="text-red-600">*</span> <span className="text-amber-700 font-normal">(mín 5 caracteres · queda en auditoría)</span>
                </label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.authorization_reason}
                  onChange={(e) => set('authorization_reason', e.target.value)}
                  placeholder="Ej: Cobertura de cirugía programada · autorización verbal del Dr. Pérez confirmada por email"
                />
              </div>
            </div>
          )}

          {/* Motivo obligatorio cuando supervisor edita una sede cerrada (queda en auditoría) */}
          {requiereMotivo && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <label className="label text-red-900">
                Motivo de modificación de sede cerrada <span className="text-red-600">*</span> <span className="text-red-700 font-normal">(mín 5 caracteres — queda en el log de auditoría)</span>
              </label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.supervisor_reason}
                onChange={(e) => set('supervisor_reason', e.target.value)}
                placeholder="Ej: Corrección solicitada por gerencia tras revisión del cierre · ticket #..."
              />
              <div className="text-[11px] text-red-700 mt-1">
                ⚠️ Esta sede ya cerró su semana. Como supervisor/gerencia puede editar, pero el cambio queda registrado en auditoría con su identificación y el motivo.
              </div>
            </div>
          )}

          {/* UN SOLO POPUP, AL FINAL, CON TODO EL DETALLE.
              Antes había uno titulado "Ya tiene un turno a esa hora" que salía
              a mitad de camino, cuando el servidor rechazaba. Hector lo pidió
              fuera: el aviso va al final, al ir a guardar, diciendo QUÉ se está
              asignando — quién, qué día, a qué hora, dónde y a cuánta gente.
              Si además resulta que esa persona ya tenía turno, eso es un
              párrafo más de ESTE mismo resumen, no una segunda ventana. */}
          {resumen && (
            <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setResumen(null)}>
              <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {cubreAusenciaId ? 'Confirme la reprogramación' : 'Confirme la asignación'}
                  </h3>
                </div>

                <div className="px-5 py-4 space-y-3 text-xs text-gray-700">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                    <div className="text-sm font-semibold text-gray-900">
                      {recursos.find((r) => r.id === form.resource_id)?.name ?? '—'}
                    </div>
                    <div><span className="text-gray-400">Día:</span> <strong className="capitalize">{diaLabel}</strong></div>
                    <div><span className="text-gray-400">Hora:</span> <strong>{form.start_time} – {form.end_time}</strong></div>
                    <div><span className="text-gray-400">Dónde:</span> <strong>{consultorio?.site?.name ?? consultorio?.site_name ?? ''} {consultorio?.name}</strong></div>
                    <div>
                      <span className="text-gray-400">Pacientes:</span>{' '}
                      <strong>{form.expected_patients === '' ? capacidad : form.expected_patients}</strong>
                    </div>
                    {verApoyo && auxsElegidas.map((x, i) => (
                      <div key={x.id}>
                        <span className="text-gray-400">{labelApoyo} {i + 1}:</span>{' '}
                        <strong>{auxiliares.find((a) => a.id === x.id)?.name ?? '—'}</strong>
                        <span className="text-gray-500"> · {x.ini}–{x.fin}</span>
                      </div>
                    ))}
                  </div>

                  {cubreAusenciaId && (
                    <p className="text-blue-800">
                      Queda registrado como la reprogramación de la ausencia
                      {recursoPrecargadoNombre ? <> de <strong>{recursoPrecargadoNombre}</strong></> : null}.
                    </p>
                  )}

                  {/* El caso del turno solapado: ya no es una ventana aparte. */}
                  {resumen.conflicto && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2 text-amber-900">
                      <div className="font-medium">Esta persona ya tiene un turno a esa hora</div>
                      <div className="text-[11px]">{resumen.conflicto}</div>
                      <div className="text-[11px]">
                        Si continúas <strong>se hace cargo de las dos agendas dentro de su turno</strong>:
                        el suyo se queda igual y se le suma este. Le llega aviso y queda en auditoría.
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                  <button className="btn flex-1 justify-center" onClick={() => setResumen(null)}>
                    {resumen.conflicto ? 'Elegir a otro' : 'Volver'}
                  </button>
                  <button
                    className="btn-primary flex-1 justify-center"
                    disabled={isPending}
                    onClick={() => mutate(resumen.conflicto ? { assume_overlap: true } : {})}
                  >
                    {isPending
                      ? <Spinner size="sm" />
                      : resumen.conflicto ? 'Sí, se hace cargo' : 'Confirmar'}
                  </button>
                </div>
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

        {editando && <Contingencia asignacion={asignacion} onSaved={onSaved} />}
        </div>

        {conPanel && (
          <div className="lg:w-1/2 lg:min-w-0 h-[70vh] lg:h-auto border-t lg:border-t-0 border-gray-100 bg-gray-50 p-4">
            <AssignmentWeekGrid
              consultorios={grilla?.consultorios ?? []}
              asignaciones={grilla?.asignaciones ?? []}
              diasFecha={grilla?.diasFecha ?? []}
              roomId={consultorioId}
              dia={dia}
              asignacionId={asignacion?.id}
              turno={{
                profesional: recursoSel?.name,
                ini: form.start_time,
                fin: form.end_time,
                auxiliares: verApoyo ? auxsElegidas.map((x) => auxiliares.find((a) => a.id === x.id)?.name).filter(Boolean) : [],
              }}
            />
          </div>
        )}
        </div>

        <div className="shrink-0 bg-white px-4 sm:px-6 py-3 border-t border-gray-200 flex flex-col-reverse sm:flex-row gap-2">
          {editando && (
            <button
              className="btn-danger sm:mr-auto justify-center"
              onClick={confirmarEliminar}
              disabled={eliminando || isPending}
            >
              {eliminando ? <Spinner size="sm" /> : '🗑️ Eliminar'}
            </button>
          )}
          <button className="btn justify-center sm:ml-auto sm:w-40" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-primary justify-center sm:w-56"
            onClick={handleGuardar}
            disabled={!valid || isPending || eliminando}
          >
            {isPending ? <Spinner size="sm" /> : (editando ? 'Guardar cambios' : 'Guardar asignación')}
          </button>
        </div>
    </div>
  )
}

/**
 * 3739 punto 4 · TURNO EN CONTINGENCIA (agenda colchón). Hector, 21-oct.
 * El coordinador lo marca: sale naranja en el Programador y los pacientes
 * quedan vacíos. La líder de reprogramación (o gerencia) pone los pacientes y
 * lo aprueba: vuelve a su color normal.
 */
function Contingencia({ asignacion, onSaved }) {
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const [pacientes, setPacientes] = useState('')
  const puedeMarcar = ['coordinador', 'supervisor', 'gerencia'].includes(user?.role)
  const puedeAprobar = ['supervisor', 'gerencia'].includes(user?.role)
  const { mutate: marcar, isPending: marcando } = useMutation({
    mutationFn: () => asignacionService.marcarContingencia(asignacion.id),
    onSuccess: () => { toast.success('Turno en contingencia.'); onSaved() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo marcar'),
  })
  const { mutate: aprobar, isPending: aprobando } = useMutation({
    mutationFn: () => asignacionService.aprobarContingencia(asignacion.id, Number(pacientes)),
    onSuccess: () => { toast.success('Contingencia aprobada.'); onSaved() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo aprobar'),
  })
  const n = Number(pacientes)
  const valido = pacientes !== '' && Number.isInteger(n) && n >= 0

  if (!asignacion.contingency) {
    if (!puedeMarcar) return null
    return (
      <div className="px-5 pb-3">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
          disabled={marcando}
          onClick={async () => {
            const si = await confirm({
              title: 'Marcar en contingencia',
              message: 'El turno queda en naranja y sus pacientes vacíos hasta que la líder los ponga y lo apruebe.',
              confirmLabel: 'Sí, marcar',
              cancelLabel: 'Cancelar',
            })
            if (si) marcar()
          }}
        >
          {marcando ? <Spinner size="sm" /> : '🟧 Marcar en contingencia'}
        </button>
      </div>
    )
  }
  return (
    <div className="mx-5 mb-3 bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-xs text-orange-900 space-y-2">
      <div className="font-semibold">🟧 En contingencia · pacientes sin poner</div>
      {puedeAprobar && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-700">
            <span className="block mb-1 font-semibold text-gray-700">Pacientes</span>
            <input
              type="number" min="0" inputMode="numeric"
              className="input w-24 py-1 text-xs tabular-nums"
              value={pacientes}
              onChange={(e) => setPacientes(e.target.value)}
            />
          </label>
          <button type="button" className="btn-primary text-xs" disabled={!valido || aprobando} onClick={() => aprobar()}>
            {aprobando ? <Spinner size="sm" /> : 'Aprobar'}
          </button>
        </div>
      )}
    </div>
  )
}
