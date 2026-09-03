import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { ejecucionService, semanaService, asignacionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { useSedeActiva } from '@/hooks/useActiveSite'
import { compareNatural, parseFechaLocal } from '@/utils/helpers'

const DIAS_ES = {
  Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes',
  Wednesday: 'miercoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sabado'
}

// Áreas/especialidades — mismo set que en ProgramadorPage para consistencia visual
const AREAS = [
  { value: 'oftalmologia',         label: '🩺 Oftalmología',        dot: 'bg-teal-400' },
  { value: 'optometria',           label: '👓 Optometría',          dot: 'bg-purple-400' },
  { value: 'anestesiologia',       label: '💉 Anestesiología',      dot: 'bg-blue-400' },
  { value: 'diagnostico',          label: '🔬 Diagnóstico',         dot: 'bg-amber-400' },
  { value: 'asesoria',             label: '👥 Asesoría',            dot: 'bg-pink-400' },
  { value: 'fonoaudiologia',       label: '🗣️ Fonoaudiología',     dot: 'bg-rose-400' },
  { value: 'otorrinolaringologia', label: '👂 Otorrinolaringología', dot: 'bg-orange-400' },
]

// Tipo del profesional programado → área que realmente atiende.
// El filtro NO puede mirar solo la especialidad del consultorio: un oftalmólogo
// puede estar programado en un consultorio cuya especialidad principal es otra
// (Cons. 5 Quirúrgica con principal=anestesio + alternativa, cobertura puntual, etc.).
// Lo que define el servicio prestado es el TIPO del recurso programado.
const TIPO_RECURSO_A_AREA = {
  oftalmologo:      'oftalmologia',
  optometra:        'optometria',
  anestesiologo:    'anestesiologia',
  tecnico:          'diagnostico',
  asesor_servicios: 'asesoria',
  fonoaudiologa:    'fonoaudiologia',
  otorrino:         'otorrinolaringologia',
}

export default function EjecucionPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const { siteId: sedeId, Selector } = useSedeActiva()
  const [fecha, setFecha] = useState(new Date())
  const [registros, setRegistros] = useState({})
  // Filtro multi-select por área/especialidad (mismo patrón que ProgramadorPage).
  const [especialidadFilter, setEspecialidadFilter] = useState([])
  const [showFilter, setShowFilter] = useState(false)

  const diaIngles = format(fecha, 'EEEE', { locale: undefined })
  // Nota: date-fns con locale español devuelve "lunes" — pero internamente comparamos en español
  const diaKey = format(fecha, 'EEEE').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const diaMap = { sunday: 'domingo', monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves', friday: 'viernes', saturday: 'sabado' }
  const dia = diaMap[diaKey] ?? diaKey

  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas-ejec', sedeId],
    queryFn: () => semanaService.list({ site_id: sedeId }),
  })

  const semanaActual = semanas.find((s) => {
    // parseFechaLocal: interpreta YYYY-MM-DD como fecha-calendario LOCAL (sin
    // shift de TZ). Si usáramos parseISO en zona Colombia (UTC-5), la fecha
    // "2026-06-21" se interpretaría como "20 jun 19:00 COL" y la comparación
    // contra `fecha` (Date local) podría meter al coord en la semana incorrecta
    // cuando navega justo entre sábado y domingo.
    //
    // FIX SÁBADO (jul-2026): `parseFechaLocal(s.end_date)` da SÁBADO 00:00
    // local, pero `fecha = new Date()` es sábado en la hora del día (ej. 14:00).
    // La comparación `sábado 14:00 <= sábado 00:00` es FALSE → el coord no ve
    // la semana ni su programación de ese día. Normalizamos `fecha` al 00:00
    // local del mismo día calendario para que la comparación funcione en TODO
    // el rango [domingo 00:00 – sábado 00:00] inclusive.
    const hoyLocal = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    const ini = parseFechaLocal(s.start_date)
    const fin = parseFechaLocal(s.end_date)
    return hoyLocal >= ini && hoyLocal <= fin
  })

  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ['ejec-pendientes', semanaActual?.id, dia, sedeId],
    queryFn: () => ejecucionService.pendientesDelDia({ week_id: semanaActual?.id, day: dia, site_id: sedeId }),
    enabled: !!semanaActual && !!sedeId,
  })

  // Inicializar registros con la capacidad programada (RN — pre-fill).
  // FIX (jun-2026): la dependencia ANTES era [pendientes.length], pero si dos
  // días distintos devuelven la MISMA cantidad de asignaciones, el efecto NO
  // se re-disparaba y `registros` quedaba con asignacion_id del día anterior.
  // Al guardar, el coord actualizaba ejecuciones del día EQUIVOCADO. Ahora la
  // dependencia es una clave estable basada en los IDs ordenados — solo
  // se re-rinde cuando el conjunto de asignaciones cambia.
  const pendientesKey = useMemo(
    () => pendientes.map((p) => p.id).sort().join('|'),
    [pendientes],
  )
  useEffect(() => {
    const r = {}
    pendientes.forEach((p) => {
      r[p.id] = {
        assignment_id: p.id,
        patients_seen: p.execution?.patients_seen ?? p.patient_capacity ?? 0,
        notes: p.execution?.notes ?? '',
        shift_status: p.execution?.shift_status ?? 'completa',
      }
    })
    setRegistros(r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientesKey])

  const { mutate: guardarTodo, isPending } = useMutation({
    mutationFn: () => {
      // FIX (jun-2026): antes se enviaba Object.values(registros) sin filtrar
      // ausencias. Las filas con estado='sin_cobertura' tenían el pre-fill
      // de pacientes_atendidos=pacientes_capacidad y terminaban registradas
      // como si el recurso hubiera atendido pacientes — inflando métricas.
      // Ahora filtramos las ausencias antes de enviar (el coord no debe
      // registrar ejecución para asignaciones que no se ejecutaron).
      const pendientesPorId = Object.fromEntries(pendientes.map((p) => [p.id, p]))
      const aGuardar = Object.values(registros).filter((reg) => {
        const asig = pendientesPorId[reg.assignment_id]
        if (!asig) return false
        if (asig.status === 'sin_cobertura') return false
        return true
      })
      if (aGuardar.length === 0) {
        return Promise.resolve({ count: 0, skipped: Object.keys(registros).length })
      }
      return ejecucionService.saveDay(aGuardar)
    },
    onSuccess: (res) => {
      const data = res?.data ?? res
      const count = data?.count ?? 0
      if (count === 0) {
        toast('No había ejecuciones que registrar (todas son ausencias o ya estaban registradas)', { icon: 'ℹ️', duration: 5000 })
      } else {
        toast.success(`${count} ${count === 1 ? 'ejecución guardada' : 'ejecuciones guardadas'}`)
      }
      qc.invalidateQueries({ queryKey: ['ejec-pendientes'] })
    },
    onError: (err) => toast.error(err?.message ?? 'Error al guardar'),
  })

  // Quick-edit del campo "Programados" — el coord ajusta el valor real
  // (de la agenda externa) sin abrir el modal del programador.
  const { mutate: actualizarProgramados } = useMutation({
    mutationFn: ({ id, value: valor }) => asignacionService.updatePacientesCapacidad(id, valor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ejec-pendientes'] })
      toast.success('Programados actualizados')
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo actualizar'),
  })

  const updateReg = (asigId, campo, valor) => {
    setRegistros((prev) => ({ ...prev, [asigId]: { ...prev[asigId], [campo]: valor } }))
  }

  // FIX (jun-2026): parseInt('abc') = NaN, parseInt('') = NaN. Antes esto
  // dejaba NaN en estado y el backend recibía null/NaN. Helper seguro.
  const parseSafeInt = (v) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const esHoy = format(fecha, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  // Filtrar pendientes por área seleccionada — vacío = todas.
  // Coincide si CUALQUIERA de los dos criterios entra en el filtro:
  //   1. La especialidad del consultorio (estilo Programador).
  //   2. El área que mapea desde el tipo del recurso PROGRAMADO. Esto cubre el
  //      caso de un oftalmólogo asignado en un consultorio cuya especialidad
  //      principal no es oftalmología (cobertura puntual, servicio alternativo).
  const pendientesFiltrados = especialidadFilter.length === 0
    ? pendientes
    : pendientes.filter((p) => {
        const areaConsultorio = p.room?.specialty
        const areaRecurso = TIPO_RECURSO_A_AREA[p.resource?.type]
        return especialidadFilter.includes(areaConsultorio) || especialidadFilter.includes(areaRecurso)
      })

  // Ordenamos las asignaciones por consultorio y dentro de cada consultorio
  // por hora de inicio (para que sub-horarios queden en orden cronológico:
  // 07:00–13:00 antes que 13:00–19:00). El nombre del consultorio se muestra
  // SOLO en la primera fila de cada grupo (las siguientes lo dejan vacío)
  // para que visualmente parezca una sola cabecera con sub-filas por recurso —
  // pero cada recurso conserva su PROPIO programado/atendido (la productividad
  // individual se mide por recurso, no por consultorio).
  //
  // Orden de los consultorios (mismo criterio que el resto del sistema):
  //   1. Área de asesores primero (asesoría es un módulo lógico, no físico).
  //   2. Resto en orden numérico natural por nombre
  //      ("CONSULTORIO 1" < "CONSULTORIO 2" < ... < "CONSULTORIO 10" < "18B").
  const filasOrdenadas = useMemo(() => {
    const arr = [...pendientesFiltrados]
    arr.sort((x, y) => {
      const esAsesoriaX = x.room?.specialty === 'asesoria' ? 0 : 1
      const esAsesoriaY = y.room?.specialty === 'asesoria' ? 0 : 1
      if (esAsesoriaX !== esAsesoriaY) return esAsesoriaX - esAsesoriaY
      const cmp = compareNatural(x.room?.name, y.room?.name)
      if (cmp !== 0) return cmp
      // Mismo consultorio → orden por hora de inicio
      return (x.start_time ?? '').localeCompare(y.start_time ?? '')
    })
    // Marcar cuál es el "primer recurso" de cada consultorio para mostrar el
    // nombre del consultorio una sola vez en la cabecera del grupo.
    return arr.map((a, i) => ({
      assignment: a,
      esCabeceraConsultorio: i === 0 || arr[i - 1].room?.id !== a.room?.id,
    }))
  }, [pendientesFiltrados])

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Registro de ejecución</h1>
          <p className="text-xs text-gray-500">
            Pacientes atendidos por consultorio · {format(fecha, "EEEE d 'de' MMMM yyyy", { locale: es })}
            {esHoy && <Badge variant="blue" className="ml-2">Hoy</Badge>}
          </p>
          <Selector className="mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <button className="btn" onClick={() => setFecha((d) => subDays(d, 1))}>← Día anterior</button>
          <button className="btn" onClick={() => setFecha(new Date())} disabled={esHoy}>Hoy</button>
          <button className="btn" onClick={() => setFecha((d) => addDays(d, 1))}>Día siguiente →</button>

          {/* Filtro multi-select por área/especialidad (mismo UI que el Programador) */}
          <div className="relative">
            <button
              className={`btn ${especialidadFilter.length > 0 ? 'border-brand-400 text-brand-700 bg-blue-50' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              title="Filtrar por área"
            >
              🔍 {especialidadFilter.length === 0 ? 'Filtrar área' : `${especialidadFilter.length} ${especialidadFilter.length === 1 ? 'área' : 'áreas'}`}
            </button>
            {showFilter && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilter(false)} />
                <div className="absolute top-full right-0 mt-1 w-60 bg-white rounded-lg border border-gray-200 shadow-lg z-40 p-2">
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
      </div>

      <div className="card">
        <SectionHeader
          title="Pacientes atendidos por consultorio"
          action={<span className="text-xs text-gray-400">El campo viene pre-llenado con la capacidad programada — solo ajusta si fue diferente</span>}
        />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !semanaActual ? (
          <EmptyState icon="📅" title="No hay semana abierta para esta fecha" />
        ) : pendientes.length === 0 ? (
          <EmptyState icon="✅" title="Sin asignaciones programadas para este día" />
        ) : pendientesFiltrados.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Sin asignaciones en las áreas filtradas"
            description={`Hay ${pendientes.length} asignación${pendientes.length === 1 ? '' : 'es'} para este día, pero ninguna en las áreas seleccionadas. Ajusta o limpia el filtro.`}
          />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 text-left">Consultorio</th>
                    <th className="px-3 py-2 text-left">Recurso</th>
                    <th className="px-3 py-2 text-center">Programados</th>
                    <th className="px-3 py-2 text-center">Atendidos</th>
                    <th className="px-3 py-2 text-left">Observación</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map(({ assignment: a, esCabeceraConsultorio }) => {
                    const reg = registros[a.id] ?? {}
                    const tieneAusencia = a.status === 'sin_cobertura'
                    const yaRegistrado = !!a.execution
                    const dif = (reg.patients_seen ?? 0) - (a.patient_capacity ?? 0)
                    // El nombre del consultorio se muestra solo en la primera
                    // fila de cada grupo; las demás dejan la celda vacía con
                    // una indentación visual sutil.
                    const horarioRecurso = a.start_time && a.end_time
                      ? `${a.start_time}–${a.end_time}`
                      : ''
                    return (
                      <tr
                        key={a.id}
                        className={`align-top ${esCabeceraConsultorio ? 'border-t-2 border-t-gray-200' : 'border-t border-t-gray-50'}`}
                      >
                        <td className="px-3 py-2">
                          {esCabeceraConsultorio ? (
                            <>
                              <div className="text-xs font-medium text-gray-800">{a.room?.name}</div>
                              <div className="text-xs text-gray-400 capitalize">{a.room?.specialty}</div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-300 pl-2">↳</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          <div>{a.resource?.name ?? '—'}</div>
                          {horarioRecurso && (
                            <div className="text-[11px] text-gray-400 mt-0.5">{horarioRecurso}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {tieneAusencia ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max="500"
                              className="input w-20 text-center text-xs py-1"
                              defaultValue={a.patient_capacity ?? ''}
                              key={`prog-${a.id}-${a.patient_capacity}`}
                              disabled={yaRegistrado && a.execution?.locked}
                              onBlur={(e) => {
                                const v = parseSafeInt(e.target.value)
                                if (v !== (a.patient_capacity ?? 0)) {
                                  actualizarProgramados({ id: a.id, value: v })
                                }
                              }}
                              title="Edita los pacientes realmente programados (de la agenda externa)"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {tieneAusencia ? (
                            <Badge variant="red">ausencia</Badge>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              className="input w-20 text-center text-xs py-1"
                              value={reg.patients_seen ?? ''}
                              onChange={(e) => updateReg(a.id, 'pacientes_atendidos', parseSafeInt(e.target.value))}
                              disabled={yaRegistrado && a.execution?.locked}
                              title="Pacientes que este recurso realmente atendió"
                            />
                          )}
                          {dif !== 0 && !tieneAusencia && (
                            <div className={`text-xs mt-1 ${dif > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {dif > 0 ? '+' : ''}{dif} vs prog.
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!tieneAusencia && (
                            <input
                              type="text"
                              className="input text-xs py-1"
                              placeholder="Ej: salió 30min antes"
                              value={reg.notes ?? ''}
                              onChange={(e) => updateReg(a.id, 'observaciones', e.target.value)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {tieneAusencia ? (
                            <Badge variant="red">no ejecutado</Badge>
                          ) : yaRegistrado ? (
                            <Badge variant="green">registrado</Badge>
                          ) : (
                            <Badge variant="amber">pendiente</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-400">
                Los registros se bloquean para edición 48 horas después de su creación.
              </div>
              <button className="btn-primary" onClick={() => guardarTodo()} disabled={isPending}>
                {isPending ? <Spinner size="sm" /> : '✓ Guardar registro del día'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
