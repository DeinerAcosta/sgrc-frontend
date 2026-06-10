import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { addWeeks, subWeeks, startOfWeek, format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { asignacionService, semanaService, sedeService, festivoService, recursoService, consultorioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { DIAS_LABEL, DIAS, semanaLabel, diasDeSemana, calcularCapacidadPacientes } from '@/utils/helpers'
import AsignacionModal from '@/pages/coordinador/AsignacionModal'
import CerrarSemanaModal from '@/pages/coordinador/CerrarSemanaModal'
import AsignarBackofficeModal from '@/pages/coordinador/AsignarBackofficeModal'

const SLOT_COLOR = {
  oftalmologo:   'slot-teal',
  anestesiologo: 'slot-blue',
  optometra:     'slot-purple',
  auxiliar:      'slot-teal',
  tecnico:       'slot-blue',
}

// Áreas/especialidades disponibles para filtrar consultorios en la grilla
// Devuelve "Primer Nombre + Primer Apellido" para mostrar en celdas estrechas.
// Para nombres muy largos, prioriza primer nombre + primer apellido detectable.
function nombreCorto(nombre) {
  if (!nombre) return ''
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return nombre
  // Asumir [PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido]
  // o [PrimerNombre, PrimerApellido, SegundoApellido]
  return `${partes[0]} ${partes[partes.length === 4 ? 2 : 1]}`
}

const AREAS = [
  { value: 'oftalmologia',   label: '🩺 Oftalmología',    dot: 'bg-teal-400' },
  { value: 'optometria',     label: '👓 Optometría',      dot: 'bg-purple-400' },
  { value: 'anestesiologia', label: '💉 Anestesiología',  dot: 'bg-blue-400' },
  { value: 'diagnostico',    label: '🔬 Diagnóstico',     dot: 'bg-amber-400' },
  { value: 'asesoria',       label: '👥 Asesoría',        dot: 'bg-pink-400' },
]

export default function ProgramadorPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  // sedePropia solo si tiene EXACTAMENTE 1 sede (caso típico coordinador 1 sede).
  // Si tiene 2+ sedes (coordinador multi-sede como Wadys que tiene 5),
  // mostramos el selector para que elija cuál programar.
  const sedePropia = user?.sedes?.length === 1 ? user.sedes[0] : null
  const tieneVariasSedes = (user?.sedes?.length ?? 0) > 1
  const primeraSede = user?.sedes?.[0]

  const [sedeManual, setSedeManual] = useState('')

  // Sincronizar sedeManual cuando user.sedes cambia (por el refresh automático
  // del AppLayout que trae sedes nuevas tras un login con JWT viejo).
  useEffect(() => {
    if (tieneVariasSedes && (!sedeManual || !user.sedes.includes(sedeManual))) {
      setSedeManual(user.sedes[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneVariasSedes, primeraSede, user?.sedes?.length])
  // Filtro multi-select por especialidad — array vacío = todas
  const [especialidadFilter, setEspecialidadFilter] = useState([])
  const [showFilter, setShowFilter] = useState(false)
  // Inicializa en la primera semana cuyo lunes está >= 3 días de hoy (RN-01).
  // Si no, el coordinador entra y el botón "Crear semana" aparece deshabilitado
  // sobre la semana actual sin razón aparente.
  const [semanaBase, setSemanaBase] = useState(() => {
    let candidate = startOfWeek(new Date(), { weekStartsOn: 1 })
    while (differenceInDays(candidate, new Date()) < 3) {
      candidate = addWeeks(candidate, 1)
    }
    return candidate
  })
  const [modalData, setModalData]   = useState(null)
  const [copiarDia, setCopiarDia]   = useState(null)  // { diaOrigen, etiqueta }
  const [showCierre, setShowCierre] = useState(false)
  const [highlightCons, setHighlightCons] = useState(null)
  const [boRecursoOcioso, setBoRecursoOcioso] = useState(null)
  const rowRefs = useRef({})

  // Llevar al usuario a la fila de un consultorio en la grilla y resaltarla
  // unos segundos. Se usa desde el modal de cierre cuando hace click en un aviso.
  const irAConsultorio = (consId) => {
    setShowCierre(false)
    setTimeout(() => {
      const row = rowRefs.current[consId]
      if (!row) return
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightCons(consId)
      setTimeout(() => setHighlightCons(null), 3500)
    }, 250)
  }

  // Acción contextual para un recurso ocioso: si es auxiliar abrimos el modal
  // de backoffice (HU-C-17); si es médico/optómetra/etc. lo llevamos al primer
  // consultorio de su especialidad para que el coordinador asigne ahí.
  const asignarRecursoOcioso = (recurso) => {
    setShowCierre(false)
    setTimeout(() => {
      if (recurso.tipo === 'auxiliar' || recurso.tipo === 'auxiliar_admin') {
        setBoRecursoOcioso(recurso)
        return
      }
      const cons = consultorios.find((c) => c.activo && c.especialidad === recurso.tipo)
      if (cons) {
        const row = rowRefs.current[cons.id]
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightCons(cons.id)
        setTimeout(() => setHighlightCons(null), 3500)
        toast(`${recurso.nombre} tiene horas disponibles — asígnalo en ${cons.nombre}`, { icon: '👉' })
      } else {
        toast(`No hay consultorios activos de ${recurso.tipo} en esta sede`, { icon: 'ℹ️' })
      }
    }, 250)
  }

  // El coordinador trabaja sobre su sede; el supervisor (sin sede propia) la elige.
  const sedeId = sedePropia || sedeManual

  // Sedes para el selector:
  //   - Supervisor/gerencia (sin sedes propias): TODAS las sedes
  //   - Coordinador multi-sede: SOLO sus sedes
  //   - Coordinador con 1 sede: no se muestra selector
  const { data: todasSedes = [] } = useQuery({
    queryKey: ['sedes-programador'],
    queryFn: () => sedeService.list(),
    enabled: !sedePropia,
  })
  const sedesDisponibles = tieneVariasSedes
    ? todasSedes.filter((s) => user.sedes.includes(s.id))
    : todasSedes

  const diasFecha = diasDeSemana(semanaBase)
  const fechasISO = diasFecha.map((d) => format(d, 'yyyy-MM-dd'))

  // Festivos del rango (RN-06)
  const { data: festivos = [] } = useQuery({
    queryKey: ['festivos-semana', fechasISO[0], fechasISO[6]],
    queryFn: () => festivoService.list({ desde: fechasISO[0], hasta: fechasISO[6] }),
  })
  // f.fecha viene como "2026-06-08T00:00:00.000Z" del backend (Prisma serializa
  // DATE como ISO con Z UTC). fechasISO[i] es "2026-06-08". Tomamos solo YYYY-MM-DD
  // para que coincidan y no haya desfase por timezone.
  const festivosSet = new Set(festivos.map((f) => String(f.fecha).slice(0, 10)))

  // Recursos para cálculo de ocupación + ociosos al cerrar
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-sede-programador', sedeId],
    queryFn: () => recursoService.list({ sede_id: sedeId }),
  })

  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas', sedeId],
    queryFn: () => semanaService.list({ sede_id: sedeId }),
  })
  const semanaActual = semanas.find((s) => {
    const ini = new Date(s.fecha_inicio)
    const fin = new Date(s.fecha_fin)
    return semanaBase >= ini && semanaBase <= fin
  })

  const { data: consultorios = [], isLoading: loadCons } = useQuery({
    queryKey: ['consultorios', sedeId],
    queryFn: () => sedeService.consultorios(sedeId),
    enabled: !!sedeId,
  })

  const { data: asignaciones = [], isLoading: loadAsig } = useQuery({
    queryKey: ['asignaciones', semanaActual?.id, sedeId],
    queryFn: () => asignacionService.list({ semana_id: semanaActual?.id, sede_id: sedeId }),
    enabled: !!semanaActual,
  })

  const { mutate: crearSemana } = useMutation({
    mutationFn: () => semanaService.create({ fecha_inicio: format(semanaBase, 'yyyy-MM-dd'), sede_id: sedeId }),
    onSuccess: () => { qc.invalidateQueries(['semanas']); toast.success('Semana creada') },
    onError: (err) => toast.error(err?.message ?? 'No se puede crear — verifica la anticipación mínima de 3 días'),
  })

  const { mutate: copiarSemana } = useMutation({
    mutationFn: () => {
      const anterior = semanas.find((s) => parseISO(s.fecha_fin) < semanaBase)
      if (!anterior) throw new Error('No hay semana anterior para copiar')
      return semanaService.copiar(anterior.id, format(semanaBase, 'yyyy-MM-dd'))
    },
    onSuccess: () => { qc.invalidateQueries(['semanas']); qc.invalidateQueries(['asignaciones']); toast.success('Semana copiada — revisa recursos no disponibles') },
    onError: (err) => toast.error(err?.message ?? 'Error al copiar'),
  })

  const { mutate: eliminarAsig } = useMutation({
    mutationFn: (id) => asignacionService.remove(id),
    onSuccess: () => { qc.invalidateQueries(['asignaciones']); toast.success('Asignación eliminada') },
  })

  // HU-C-15: toggle activar/desactivar consultorio
  const { mutate: toggleConsultorio } = useMutation({
    mutationFn: ({ id, activo }) => consultorioService.update(id, { activo }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['consultorios'])
      toast.success(vars.activo ? 'Consultorio activado' : 'Consultorio desactivado')
    },
  })

  const asigDeConsultorioDia = (consultorioId, dia) =>
    asignaciones.filter((a) => a.consultorio_id === consultorioId && a.dia_semana === dia)

  const isCerrada = semanaActual?.estado === 'cerrada'
  const isSupervisor = user?.rol === 'supervisor' || user?.rol === 'gerencia'
  const canEdit = !isCerrada || isSupervisor

  // RN-01: no se puede crear/copiar una semana con menos de 3 días de anticipación.
  // Si la vista actual no cumple ese criterio, deshabilitamos los botones y
  // ofrecemos un mensaje claro en lugar de dejar que el backend rebote.
  const diasAlInicio = differenceInDays(semanaBase, new Date())
  const cumpleAnticipacion = diasAlInicio >= 3

  // Ocupación proyectada de la semana (en horas, no en asignaciones).
  // - horas_disponibles = consultorios_activos × 6 días × 11h (operación 7am–7pm con almuerzo cubierto)
  // - horas_asignadas   = suma de (hora_fin − hora_inicio) sobre todas las asignaciones
  // El dashboard del directivo y los informes ya usan esta misma base; con esto
  // el coordinador ve el mismo número que la dirección, sin sobreestimar slots cortos.
  const HORAS_DIA_CONSULTORIO = 11
  const consultoriosActivos = consultorios.filter((c) => c.activo).length
  const horasAsignadas = asignaciones.reduce((acc, a) => {
    if (!a.recurso_id || !a.hora_inicio || !a.hora_fin) return acc
    const [hi_h, hi_m] = a.hora_inicio.split(':').map(Number)
    const [hf_h, hf_m] = a.hora_fin.split(':').map(Number)
    return acc + Math.max(0, ((hf_h * 60 + hf_m) - (hi_h * 60 + hi_m)) / 60)
  }, 0)
  const horasDisponibles = consultoriosActivos * 6 * HORAS_DIA_CONSULTORIO
  const ocupacion = horasDisponibles > 0
    ? Math.round((horasAsignadas / horasDisponibles) * 100)
    : 0

  return (
    <div className="p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Programador semanal</h1>
          <p className="text-xs text-gray-500">
            {semanaLabel(semanaBase)} · Ocupación: <strong className={
              ocupacion >= 80 ? 'text-green-700' : ocupacion >= 60 ? 'text-amber-700' : 'text-red-600'
            }>{ocupacion}%</strong>
            {consultoriosActivos > 0 && (
              <span className="text-gray-400">
                {' '}({Math.round(horasAsignadas * 10) / 10}h / {horasDisponibles}h · {consultoriosActivos} consultorio{consultoriosActivos === 1 ? '' : 's'})
              </span>
            )}
          </p>
          {!sedePropia && (
            <div className="mt-2">
              {tieneVariasSedes && (
                <label className="text-xs text-gray-500 block mb-1">
                  📍 Sede a programar ({sedesDisponibles.length} disponibles):
                </label>
              )}
              <select
                className="input w-full sm:max-w-[320px]"
                value={sedeManual}
                onChange={(e) => setSedeManual(e.target.value)}
              >
                {!tieneVariasSedes && <option value="">Selecciona una sede…</option>}
                {sedesDisponibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!semanaActual && (
            <button
              className="btn-primary"
              onClick={() => crearSemana()}
              disabled={!cumpleAnticipacion}
              title={!cumpleAnticipacion ? 'RN-01: la semana destino debe estar al menos a 3 días de hoy' : ''}
            >
              + Crear semana
            </button>
          )}
          {semanaActual && !isCerrada && (
            <button
              className="btn"
              onClick={() => copiarSemana()}
              disabled={!cumpleAnticipacion}
              title={!cumpleAnticipacion ? 'Solo puedes copiar a una semana al menos 3 días en el futuro — usa "Siguiente →"' : 'Copia las asignaciones de la semana anterior a la que estás viendo'}
            >
              📋 Copiar semana anterior
            </button>
          )}
          {semanaActual && !isCerrada && (
            <button className="btn" style={{ borderColor: '#d1fae5', color: '#065f46' }} onClick={() => setShowCierre(true)}>
              🔒 Cerrar semana
            </button>
          )}
          {isCerrada && <Badge variant="gray">Semana cerrada{isSupervisor ? ' — puedes editar' : ''}</Badge>}
        </div>
      </div>

      {/* Aviso si la semana visible no cumple anticipación (RN-01) y no hay semana
          ya creada. Se ofrece un atajo para saltar a la próxima semana válida. */}
      {!semanaActual && !cumpleAnticipacion && sedeId && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="flex-1">
            ⚠️ No puedes crear esta semana — debe estar al menos a 3 días de hoy (RN-01).
          </span>
          <button
            className="btn btn-warning sm:ml-auto"
            onClick={() => {
              let c = semanaBase
              while (differenceInDays(c, new Date()) < 3) c = addWeeks(c, 1)
              setSemanaBase(c)
            }}
          >
            Ir a la próxima semana válida →
          </button>
        </div>
      )}

      {/* Week nav */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setSemanaBase((d) => subWeeks(d, 1))}>← Anterior</button>
          {/* Filtro multi-select por área/especialidad */}
          <div className="relative">
            <button
              className={`btn ${especialidadFilter.length > 0 ? 'border-brand-400 text-brand-700 bg-blue-50' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              title="Filtrar consultorios por área"
            >
              🔍 {especialidadFilter.length === 0 ? 'Filtrar área' : `${especialidadFilter.length} ${especialidadFilter.length === 1 ? 'área' : 'áreas'}`}
            </button>
            {showFilter && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilter(false)} />
                <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-lg border border-gray-200 shadow-lg z-40 p-2">
                  <div className="text-xs text-gray-500 px-2 pt-1 pb-2 flex items-center justify-between">
                    <span>Filtrar por área</span>
                    {especialidadFilter.length > 0 && (
                      <button
                        className="text-brand-600 hover:underline text-xs"
                        onClick={() => setEspecialidadFilter([])}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  {AREAS.map((a) => {
                    const selected = especialidadFilter.includes(a.value)
                    return (
                      <label
                        key={a.value}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded text-brand-600 focus:ring-brand-400"
                          checked={selected}
                          onChange={() => {
                            setEspecialidadFilter((prev) =>
                              prev.includes(a.value)
                                ? prev.filter((v) => v !== a.value)
                                : [...prev, a.value]
                            )
                          }}
                        />
                        <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                        <span className="flex-1 text-gray-700">{a.label}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="hidden sm:flex gap-1">
          {diasFecha.map((d, i) => (
            <div key={i} className="text-center">
              <div className="text-xs text-gray-400">{DIAS_LABEL[i]}</div>
              <div className={`text-xs font-medium ${format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-brand-600' : 'text-gray-600'}`}>
                {format(d, 'd')}
              </div>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setSemanaBase((d) => addWeeks(d, 1))}>Siguiente →</button>
      </div>

      {/* Grid */}
      {!sedeId ? (
        <EmptyState icon="🏢" title="Selecciona una sede" description="Elige una sede arriba para ver y programar sus consultorios." />
      ) : loadCons || loadAsig ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !semanaActual ? (
        <EmptyState icon="📅" title="No hay semana creada para este período" description="Crea la semana para comenzar a programar recursos." />
      ) : (
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full min-w-[800px] border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              {DIAS.map((_, i) => <col key={i} style={{ width: `${(100 - 14) / 7}%` }} />)}
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left text-xs font-medium text-gray-500 border-b border-gray-100">Consultorio</th>
                {DIAS_LABEL.map((d, i) => {
                  const esHoy = format(diasFecha[i], 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  const esFestivo = festivosSet.has(fechasISO[i])
                  const diaKey = DIAS[i]
                  // Solo muestra el botón "Copiar día" si ese día tiene asignaciones
                  const tieneAsigs = asignaciones.some((a) => a.dia_semana === diaKey)
                  return (
                    <th key={i} className={`p-2 text-center text-xs font-medium border-b border-gray-100 ${esHoy ? 'text-brand-600' : esFestivo ? 'text-amber-700 bg-amber-50/50' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{d} {format(diasFecha[i], 'd')}</span>
                        {tieneAsigs && !isCerrada && (
                          <button
                            className="text-gray-400 hover:text-brand-600 text-xs"
                            onClick={() => setCopiarDia({ tipo: 'dia', diaOrigen: diaKey, etiqueta: `${d} ${format(diasFecha[i], 'd')}` })}
                            title="Copiar este día a otro(s) día(s)"
                          >📋</button>
                        )}
                      </div>
                      {esFestivo && <div className="text-xs text-amber-600 font-normal mt-0.5">festivo</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {consultorios
                .filter((c) => c.activo)
                .filter((c) => especialidadFilter.length === 0 || especialidadFilter.includes(c.especialidad))
                .slice()
                .sort((a, b) => {
                  // ÁREA ASESORES primero, luego orden natural numérico (2 < 19A < 20 < 20A).
                  const ae = a.especialidad === 'asesoria' ? 0 : 1
                  const be = b.especialidad === 'asesoria' ? 0 : 1
                  if (ae !== be) return ae - be
                  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' })
                })
                .map((cons) => (
                <tr
                  key={cons.id}
                  ref={(el) => { if (el) rowRefs.current[cons.id] = el; else delete rowRefs.current[cons.id] }}
                  className={`border-b border-gray-50 transition-colors ${highlightCons === cons.id ? 'bg-amber-100/70 ring-2 ring-amber-300' : ''}`}
                >
                  <td className="p-2 bg-gray-50 border-r border-gray-100 align-top">
                    <div className="flex items-center justify-between gap-1">
                      <div>
                        <div className="font-medium text-gray-700 text-xs">{cons.nombre}</div>
                        <div className="text-gray-400 text-xs capitalize">{cons.especialidad}</div>
                      </div>
                      {canEdit && (
                        <button
                          className="text-xs text-gray-300 hover:text-red-500"
                          onClick={() => toggleConsultorio({ id: cons.id, activo: false })}
                          title="Desactivar consultorio temporalmente"
                        >×</button>
                      )}
                    </div>
                  </td>
                  {DIAS.map((dia) => {
                    const asigs = asigDeConsultorioDia(cons.id, dia)
                    return (
                      <td key={dia} className="p-1 align-top border-r border-gray-50 min-h-12">
                        {asigs.map((a) => (
                          <div
                            key={a.id}
                            className={`${SLOT_COLOR[a.recurso?.tipo] ?? 'slot-teal'} group relative ${canEdit ? '' : 'cursor-default'}`}
                            title={[
                              `${a.recurso?.nombre} · ${a.hora_inicio}–${a.hora_fin}`,
                              a.auxiliar ? `Aux 1: ${a.auxiliar.nombre}` : null,
                              a.auxiliar2 ? `Aux 2: ${a.auxiliar2.nombre}` : null,
                              `Capacidad: ${a.pacientes_capacidad} pacientes`,
                              canEdit ? '👆 Click para editar' : null,
                            ].filter(Boolean).join('\n')}
                            onClick={() => canEdit && setModalData({
                              consultorioId: cons.id,
                              consultorio: cons,
                              dia,
                              semanaId: semanaActual.id,
                              asignacion: a,
                            })}
                          >
                            <div className="font-medium text-teal-900 text-xs leading-tight truncate" title={a.recurso?.nombre}>{nombreCorto(a.recurso?.nombre)}</div>
                            <div className="text-teal-700 text-xs">{a.hora_inicio}–{a.hora_fin}</div>
                            {a.auxiliar && (
                              <div className="text-teal-600 text-xs truncate" title={`Aux 1: ${a.auxiliar?.nombre}`}>
                                Aux: {nombreCorto(a.auxiliar?.nombre)}
                              </div>
                            )}
                            {a.auxiliar2 && (
                              <div className="text-teal-600 text-xs truncate" title={`Aux 2: ${a.auxiliar2?.nombre}`}>
                                Aux2: {nombreCorto(a.auxiliar2?.nombre)}
                              </div>
                            )}
                            <div className="text-teal-600 text-xs">{a.pacientes_capacidad} pac.</div>
                            {a.es_horas_extras && <span className="text-amber-700 text-xs">⚠ extras</span>}
                            {canEdit && (
                              <>
                                <button
                                  className="absolute top-0.5 right-4 hidden group-hover:block text-gray-400 hover:text-brand-600 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCopiarDia({
                                      tipo: 'asignacion',
                                      asignacionId: a.id,
                                      diaOrigen: dia,
                                      etiqueta: `${a.recurso?.nombre?.split(' ')[0]} ${a.hora_inicio}–${a.hora_fin}`,
                                    })
                                  }}
                                  title="Copiar este turno a otro día"
                                >📋</button>
                                <button
                                  className="absolute top-0.5 right-0.5 hidden group-hover:block text-gray-400 hover:text-red-500 text-xs"
                                  onClick={(e) => { e.stopPropagation(); eliminarAsig(a.id) }}
                                  title="Eliminar asignación"
                                >×</button>
                              </>
                            )}
                          </div>
                        ))}
                        {/* Botón "Copiar este consultorio+día" cuando hay 2+ asignaciones
                            (útil para área asesores con varios al tiempo) */}
                        {canEdit && asigs.length >= 2 && (
                          <button
                            className="text-xs text-gray-400 hover:text-brand-600 italic py-0.5 px-1"
                            onClick={() => setCopiarDia({
                              tipo: 'consultorio',
                              consultorioId: cons.id,
                              consultorioNombre: cons.nombre,
                              diaOrigen: dia,
                              etiqueta: DIAS_LABEL[DIAS.indexOf(dia)] ?? dia,
                            })}
                            title={`Copiar las ${asigs.length} asignaciones de ${cons.nombre} a otro(s) día(s)`}
                          >
                            📋 copiar todas
                          </button>
                        )}
                        {/* En consultorios médicos: máx 3 turnos por día (mañana/tarde/extra).
                            En ÁREA ASESORES: sin límite — varios asesores trabajan en paralelo. */}
                        {(cons.especialidad === 'asesoria' || asigs.length < 3) && canEdit && (
                          <div
                            className="slot-empty text-xs py-1"
                            onClick={() => setModalData({ consultorioId: cons.id, consultorio: cons, dia, semanaId: semanaActual.id })}
                          >
                            <span className="text-gray-300">+ asignar</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {[
          { cls: 'slot-teal',   label: 'Oftalmología / técnico' },
          { cls: 'slot-blue',   label: 'Anestesiología' },
          { cls: 'slot-purple', label: 'Optometría' },
          { cls: 'slot-amber',  label: 'Alerta / sin cubrir' },
        ].map((l) => (
          <div key={l.cls} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${l.cls.replace('slot-', 'bg-').replace('teal','teal-100').replace('blue','blue-100').replace('purple','purple-100').replace('amber','amber-100')} border`} />
            <span className="text-xs text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>

      {modalData && (
        <AsignacionModal
          data={modalData}
          asignacion={modalData.asignacion}
          sedeId={sedeId}
          onClose={() => setModalData(null)}
          onSaved={() => { qc.invalidateQueries(['asignaciones']); setModalData(null) }}
        />
      )}

      {copiarDia && (
        <CopiarDiaModal
          info={copiarDia}
          semanaId={semanaActual?.id}
          sedeId={sedeId}
          onClose={() => setCopiarDia(null)}
          onSaved={() => { qc.invalidateQueries(['asignaciones']); setCopiarDia(null) }}
        />
      )}

      {showCierre && semanaActual && (() => {
        // Calcular resumen para el modal
        const consActivos = consultorios.filter((c) => c.activo)
        const consConAsig = new Set(asignaciones.map((a) => a.consultorio_id))
        const consSinAsig = consActivos.filter((c) => !consConAsig.has(c.id))
        const pacientesProg = asignaciones.reduce((acc, a) => acc + (a.pacientes_capacidad ?? 0), 0)
        const ociososList = recursos.filter((r) => ((r.horas_asignadas ?? 0) / (r.horas_max_semana ?? 42)) < 0.6)
        const resumen = {
          label_semana: semanaLabel(semanaBase),
          ocupacion_proyectada: ocupacion,
          consultorios_asignados: consActivos.length - consSinAsig.length,
          consultorios_totales: consActivos.length,
          asignaciones_total: asignaciones.length,
          pacientes_programados: pacientesProg,
          consultorios_sin_asignar: consSinAsig,
          recursos_ociosos: ociososList,
        }
        return (
          <CerrarSemanaModal
            semana={semanaActual}
            resumen={resumen}
            onClose={() => setShowCierre(false)}
            onIrAConsultorio={irAConsultorio}
            onAsignarRecurso={asignarRecursoOcioso}
          />
        )
      })()}

      {boRecursoOcioso && (
        <AsignarBackofficeModal
          auxiliar={boRecursoOcioso}
          onClose={() => setBoRecursoOcioso(null)}
        />
      )}
    </div>
  )
}

const DIAS_TODOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_TODOS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function CopiarDiaModal({ info, semanaId, sedeId, onClose, onSaved }) {
  const [destinos, setDestinos] = useState([])
  const toggle = (d) => setDestinos((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])

  // info.tipo determina qué endpoint usar:
  //   'dia'          → copiar TODAS las asignaciones del día
  //   'consultorio'  → copiar todas las del consultorio+día
  //   'asignacion'   → copiar UNA asignación específica
  const tipo = info.tipo ?? 'dia'

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (tipo === 'asignacion') {
        return asignacionService.copiarAsignacion(info.asignacionId, destinos)
      }
      if (tipo === 'consultorio') {
        return asignacionService.copiarConsultorio({
          semanaId,
          consultorioId: info.consultorioId,
          diaOrigen: info.diaOrigen,
          diasDestino: destinos,
        })
      }
      return asignacionService.copiarDia({
        semanaId,
        sedeId,
        diaOrigen: info.diaOrigen,
        diasDestino: destinos,
      })
    },
    onSuccess: (res) => {
      const msg = res?.omitidas > 0
        ? `${res.copiadas} copiadas, ${res.omitidas} omitidas (conflictos)`
        : `${res?.copiadas ?? 0} asignaciones copiadas`
      toast.success(msg)
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al copiar'),
  })

  const otrosDias = DIAS_TODOS.filter((d) => d !== info.diaOrigen)
  const titulo = tipo === 'asignacion'
    ? '📋 Copiar turno'
    : tipo === 'consultorio'
    ? `📋 Copiar ${info.consultorioNombre}`
    : '📋 Copiar día completo'
  const descripcion = tipo === 'asignacion'
    ? <>Vas a copiar el turno de <strong>{info.etiqueta}</strong> a los días seleccionados.</>
    : tipo === 'consultorio'
    ? <>Vas a copiar todas las asignaciones de <strong>{info.consultorioNombre}</strong> del <strong>{info.etiqueta}</strong> a los días seleccionados.</>
    : <>Vas a copiar <strong>todas las asignaciones</strong> de <strong>{info.etiqueta}</strong> a los días seleccionados.</>

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-gray-600">
            {descripcion}
          </div>
          <div>
            <label className="label">¿A qué día(s)?</label>
            <div className="border border-gray-200 rounded-lg p-2 space-y-1">
              {otrosDias.map((d) => {
                const label = DIAS_TODOS_LABEL[DIAS_TODOS.indexOf(d)]
                return (
                  <label key={d} className="flex items-center gap-2 text-sm hover:bg-gray-50 px-1 py-1 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={destinos.includes(d)}
                      onChange={() => toggle(d)}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
            💡 Si en algún día destino hay conflicto (mismo recurso ya asignado a otra hora), se omite y se reporta. Las demás sí se copian.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={destinos.length === 0 || isPending}
          >
            {isPending ? <Spinner size="sm" /> : `Copiar a ${destinos.length} día(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
