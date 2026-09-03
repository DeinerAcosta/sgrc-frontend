import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ejecucionService, semanaService, asignacionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { parseFechaLocal } from '@/utils/helpers'

/**
 * Vista del AUXILIAR (rol recurso): registra pacientes atendidos SOLO del día
 * de hoy y SOLO de las asignaciones donde él es el auxiliar (aux1 o aux2).
 *
 * A diferencia de la vista del coord:
 *   - No hay selector de sede (la sede la deriva el backend por la asignación).
 *   - No hay filtro por área (el aux ve sus propias filas, tan pocas que no
 *     amerita filtro).
 *   - No hay agrupación por consultorio (tabla plana ordenada por hora).
 *   - No hay navegación de día — solo HOY (decisión operativa 2026-08).
 *
 * El backend valida server-side:
 *   - GET /ejecucion/mis-pendientes filtra por auxiliarId = recursoId del usuario.
 *   - POST /ejecucion/batch rechaza el batch entero si alguna asignación no
 *     corresponde al aux logueado (mismo patrón que sede).
 *   - PATCH /asignaciones/:id/pacientes-capacidad valida ownership por aux.
 */
export default function MiEjecucionPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  // Fecha fija: HOY. El aux carga la ejecución del día en curso, no de días pasados.
  const fecha = new Date()
  const [registros, setRegistros] = useState({})

  // Día de la semana en español (formato del backend: lunes|martes|...)
  const diaKey = format(fecha, 'EEEE').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const diaMap = { sunday: 'domingo', monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves', friday: 'viernes', saturday: 'sabado' }
  const dia = diaMap[diaKey] ?? diaKey

  // Semanas del recurso (no del sistema entero — semanaService.list acepta recurso_id)
  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas-mi-ejec', user?.resource_id],
    queryFn: () => semanaService.list({ resource_id: user?.resource_id }),
  })

  // Localizar la semana que contiene HOY. Ver EjecucionPage para el fix TZ
  // Colombia (jul-2026): normalizamos fecha a 00:00 local antes de comparar.
  const semanaActual = semanas.find((s) => {
    const hoyLocal = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    const ini = parseFechaLocal(s.start_date)
    const fin = parseFechaLocal(s.end_date)
    return hoyLocal >= ini && hoyLocal <= fin
  })

  const { data: pendientes = [], isLoading, error } = useQuery({
    queryKey: ['mis-ejec-pendientes', semanaActual?.id, dia],
    queryFn: () => ejecucionService.misPendientesDelDia({ week_id: semanaActual?.id, day: dia }),
    enabled: !!semanaActual,
    retry: false, // Si el backend responde 403 (usuario sin recursoId vinculado), no reintentar
  })

  // Pre-fill: reusa la misma clave estable de EjecucionPage (fix jun-2026).
  // Si dos días distintos tuvieran la misma cantidad de asignaciones, un
  // dependencia por .length no re-inicializaría el estado y el aux terminaría
  // guardando en el día equivocado. Los IDs ordenados garantizan la re-init.
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
      // No enviar filas de ausencias — el aux no debe registrar ejecución de
      // asignaciones que no ocurrieron (mismo criterio que el coord).
      const pendientesPorId = Object.fromEntries(pendientes.map((p) => [p.id, p]))
      const aGuardar = Object.values(registros).filter((reg) => {
        const asig = pendientesPorId[reg.assignment_id]
        if (!asig) return false
        if (asig.status === 'sin_cobertura') return false
        return true
      })
      if (aGuardar.length === 0) {
        return Promise.resolve({ count: 0 })
      }
      return ejecucionService.saveDay(aGuardar)
    },
    onSuccess: (res) => {
      const data = res?.data ?? res
      const count = data?.count ?? 0
      if (count === 0) {
        toast('Nada para registrar', { icon: 'ℹ️', duration: 4000 })
      } else {
        toast.success(`${count} ${count === 1 ? 'registro guardado' : 'registros guardados'}`)
      }
      qc.invalidateQueries({ queryKey: ['mis-ejec-pendientes'] })
    },
    onError: (err) => toast.error(err?.message ?? 'Error al guardar'),
  })

  // Quick-edit del campo Programados — mismo comportamiento que el coord.
  const { mutate: actualizarProgramados } = useMutation({
    mutationFn: ({ id, value: valor }) => asignacionService.updatePacientesCapacidad(id, valor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-ejec-pendientes'] })
      toast.success('Programados actualizados')
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo actualizar'),
  })

  const updateReg = (asigId, campo, valor) => {
    setRegistros((prev) => ({ ...prev, [asigId]: { ...prev[asigId], [campo]: valor } }))
  }

  const parseSafeInt = (v) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  // Detectar error del backend por usuario sin recursoId vinculado
  const errorMensaje = error?.message ?? error?.response?.data?.error ?? ''
  const sinRecursoVinculado = errorMensaje.includes('no está vinculado a un recurso')

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Ejecución del día</h1>
          <p className="text-xs text-gray-500">
            Pacientes atendidos hoy · {format(fecha, "EEEE d 'de' MMMM yyyy", { locale: es })}
            <Badge variant="blue" className="ml-2">Hoy</Badge>
          </p>
        </div>
      </div>

      <div className="card">
        <SectionHeader
          title="Mis asignaciones de hoy"
          action={<span className="text-xs text-gray-400">Registra los pacientes que realmente atendiste. El coordinador puede verificar y ajustar después.</span>}
        />

        {sinRecursoVinculado ? (
          <EmptyState
            icon="⚠️"
            title="Tu usuario no está vinculado a un recurso"
            description="Contacta al supervisor para que vincule tu usuario al recurso correspondiente."
          />
        ) : isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !semanaActual ? (
          <EmptyState icon="📅" title="No hay semana abierta para hoy" description="Cuando el coordinador publique la semana, aquí verás tus asignaciones del día." />
        ) : pendientes.length === 0 ? (
          <EmptyState icon="✅" title="Sin asignaciones para hoy" description="Hoy no tienes asignaciones como auxiliar. Si crees que es un error, contacta a tu coordinador." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 text-left">Consultorio</th>
                    <th className="px-3 py-2 text-left">Médico / Horario</th>
                    <th className="px-3 py-2 text-center">Programados</th>
                    <th className="px-3 py-2 text-center">Atendidos</th>
                    <th className="px-3 py-2 text-left">Observación</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((a) => {
                    const reg = registros[a.id] ?? {}
                    const tieneAusencia = a.status === 'sin_cobertura'
                    const yaRegistrado = !!a.execution
                    const dif = (reg.patients_seen ?? 0) - (a.patient_capacity ?? 0)
                    const horarioMedico = a.start_time && a.end_time ? `${a.start_time}–${a.end_time}` : ''
                    // Aviso si el registro existente lo hizo OTRO usuario (probablemente el coord)
                    const registradoPorOtro = yaRegistrado && a.execution?.recorded_by && a.execution.recorded_by !== user?.id
                    return (
                      <tr key={a.id} className="align-top border-t border-t-gray-100">
                        <td className="px-3 py-2">
                          <div className="text-xs font-medium text-gray-800">{a.room?.name}</div>
                          <div className="text-xs text-gray-400 capitalize">{a.room?.specialty}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          <div>{a.resource?.name ?? '—'}</div>
                          {horarioMedico && (
                            <div className="text-[11px] text-gray-400 mt-0.5">{horarioMedico}</div>
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
                              title="Ajusta si los pacientes realmente programados fueron distintos"
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
                              title="Pacientes que realmente atendieron en esta franja"
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
                            <>
                              <Badge variant={a.execution?.locked ? 'blue' : 'green'}>
                                {a.execution?.locked ? 'bloqueado' : 'registrado'}
                              </Badge>
                              {registradoPorOtro && (
                                <div className="text-[10px] text-amber-600 mt-1" title="Otro usuario editó este registro (probablemente el coordinador). Confirma antes de sobrescribir.">
                                  ⚠️ editado por otro
                                </div>
                              )}
                            </>
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

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 gap-3">
              <div className="text-xs text-gray-400">
                Guarda al terminar tu jornada. El coordinador puede verificar y ajustar si es necesario.
              </div>
              <button className="btn-primary" onClick={() => guardarTodo()} disabled={isPending}>
                {isPending ? <Spinner size="sm" /> : '✓ Guardar registros'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
