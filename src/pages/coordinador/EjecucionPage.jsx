import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { ejecucionService, semanaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'

const DIAS_ES = {
  Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes',
  Wednesday: 'miercoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sabado'
}

export default function EjecucionPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const sedeId = user?.sedes?.[0]
  const [fecha, setFecha] = useState(new Date())
  const [registros, setRegistros] = useState({})

  const diaIngles = format(fecha, 'EEEE', { locale: undefined })
  // Nota: date-fns con locale español devuelve "lunes" — pero internamente comparamos en español
  const diaKey = format(fecha, 'EEEE').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const diaMap = { sunday: 'domingo', monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves', friday: 'viernes', saturday: 'sabado' }
  const dia = diaMap[diaKey] ?? diaKey

  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas-ejec', sedeId],
    queryFn: () => semanaService.list({ sede_id: sedeId }),
  })

  const semanaActual = semanas.find((s) => {
    const ini = parseISO(s.fecha_inicio)
    const fin = parseISO(s.fecha_fin)
    return fecha >= ini && fecha <= fin
  })

  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ['ejec-pendientes', semanaActual?.id, dia],
    queryFn: () => ejecucionService.pendientesDelDia({ semana_id: semanaActual?.id, dia }),
    enabled: !!semanaActual,
  })

  // Inicializar registros con la capacidad programada (RN — pre-fill)
  useEffect(() => {
    const r = {}
    pendientes.forEach((p) => {
      r[p.id] = {
        asignacion_id: p.id,
        pacientes_atendidos: p.ejecucion?.pacientes_atendidos ?? p.pacientes_capacidad ?? 0,
        observaciones: p.ejecucion?.observaciones ?? '',
        estado_jornada: p.ejecucion?.estado_jornada ?? 'completa',
      }
    })
    setRegistros(r)
  }, [pendientes.length])

  const { mutate: guardarTodo, isPending } = useMutation({
    mutationFn: () => ejecucionService.saveDay(Object.values(registros)),
    onSuccess: () => {
      toast.success('Ejecución del día registrada')
      qc.invalidateQueries(['ejec-pendientes'])
    },
    onError: (err) => toast.error(err?.message ?? 'Error al guardar'),
  })

  const updateReg = (asigId, campo, valor) => {
    setRegistros((prev) => ({ ...prev, [asigId]: { ...prev[asigId], [campo]: valor } }))
  }

  const esHoy = format(fecha, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Registro de ejecución</h1>
          <p className="text-xs text-gray-500">
            Pacientes atendidos por consultorio · {format(fecha, "EEEE d 'de' MMMM yyyy", { locale: es })}
            {esHoy && <Badge variant="blue" className="ml-2">Hoy</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setFecha((d) => subDays(d, 1))}>← Día anterior</button>
          <button className="btn" onClick={() => setFecha(new Date())} disabled={esHoy}>Hoy</button>
          <button className="btn" onClick={() => setFecha((d) => addDays(d, 1))}>Día siguiente →</button>
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
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                  {pendientes.map((a) => {
                    const reg = registros[a.id] ?? {}
                    const tieneAusencia = a.estado === 'sin_cobertura'
                    const yaRegistrado = !!a.ejecucion
                    const dif = (reg.pacientes_atendidos ?? 0) - (a.pacientes_capacidad ?? 0)
                    return (
                      <tr key={a.id} className="border-b border-gray-50 align-top">
                        <td className="px-3 py-2">
                          <div className="text-xs font-medium text-gray-800">{a.consultorio?.nombre}</div>
                          <div className="text-xs text-gray-400 capitalize">{a.consultorio?.especialidad}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{a.recurso?.nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-xs">{a.pacientes_capacidad ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {tieneAusencia ? (
                            <Badge variant="red">ausencia</Badge>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              className="input w-20 text-center text-xs py-1"
                              value={reg.pacientes_atendidos ?? ''}
                              onChange={(e) => updateReg(a.id, 'pacientes_atendidos', parseInt(e.target.value || 0))}
                              disabled={yaRegistrado && a.ejecucion?.bloqueado}
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
                              value={reg.observaciones ?? ''}
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
