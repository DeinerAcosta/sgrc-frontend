import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addWeeks, subWeeks, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { recursoService, semanaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, KpiCard, Spinner, EmptyState } from '@/components/ui'
import { DIAS_FULL, semanaLabel } from '@/utils/helpers'
import AusenciaFormModal from '@/pages/resource/AbsenceFormModal'

export default function HorarioPage() {
  const { user } = useAuthStore()
  const [semanaBase, setSemanaBase] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [showAusencia, setShowAusencia] = useState(false)

  const { data: semanas = [], isLoading: loadingSemanas } = useQuery({
    queryKey: ['semanas', user?.resource_id],
    queryFn: () => semanaService.list({ resource_id: user?.resource_id }),
  })

  const semanaActual = semanas.find(
    (s) => new Date(s.start_date) <= semanaBase && new Date(s.end_date) >= semanaBase
  )

  const { data: horario, isLoading } = useQuery({
    queryKey: ['horario', user?.resource_id, semanaActual?.id],
    queryFn: () => recursoService.horario(user?.resource_id, semanaActual?.id),
    enabled: !!semanaActual,
  })

  // Cálculo de horas en frontend desde hora_inicio/hora_fin — no dependemos
  // del backend mande un campo `horas` que antes daba NaN.
  const horasDeFranja = (ini, fin) => {
    if (!ini || !fin) return 0
    const [h1, m1] = ini.split(':').map(Number)
    const [h2, m2] = fin.split(':').map(Number)
    const min = (h2 * 60 + m2) - (h1 * 60 + m1)
    return Number.isFinite(min) && min > 0 ? min / 60 : 0
  }
  const fmtHoras = (h) => `${(Math.round(h * 10) / 10).toString().replace(/\.0$/, '')}h`

  const horasProg     = horario?.reduce((acc, a) => acc + horasDeFranja(a.start_time, a.end_time), 0) ?? 0
  const horasMax      = user?.max_hours_per_week ?? 42
  const horasDisponibles = Math.max(0, horasMax - horasProg)
  const pacientesProg = horario?.reduce((acc, a) => acc + (a.patient_capacity ?? 0), 0) ?? 0

  const asigPorDia = (dia) => horario?.filter((a) => a.weekday === dia) ?? []

  const colorDeTipo = {
    oftalmologo:   'slot-teal',
    anestesiologo: 'slot-blue',
    assistant:      'slot-teal',
    optometra:     'slot-purple',
    tecnico:       'slot-blue',
  }

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Mi horario</h1>
          <p className="text-xs text-gray-500">{user?.name} · {user?.specialty ?? user?.type}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-danger" onClick={() => setShowAusencia(true)}>
            ⚠️ Reportar ausencia
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="Horas programadas" value={fmtHoras(horasProg)} />
        <KpiCard
          label="Disponibles sin asignar"
          value={fmtHoras(horasDisponibles)}
          color={horasDisponibles > 4 ? 'warning' : 'default'}
        />
        <KpiCard label="Pacientes programados" value={pacientesProg} />
      </div>

      {/* Semana nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn" onClick={() => setSemanaBase((d) => subWeeks(d, 1))}>← Anterior</button>
        <div className="text-sm font-medium text-gray-700">
          {semanaLabel(semanaBase)}
          {semanaActual?.status === 'cerrada' && <Badge variant="gray" className="ml-2">Cerrada</Badge>}
        </div>
        <button className="btn" onClick={() => setSemanaBase((d) => addWeeks(d, 1))}>Siguiente →</button>
      </div>

      {/* Horario por día */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !horario || horario.length === 0 ? (
        <EmptyState icon="📅" title="Sin programación para esta semana" description="El coordinador aún no ha publicado tu horario para esta semana." />
      ) : (
        <div className="space-y-2">
          {DIAS_FULL.map((diaLabel, i) => {
            const diaKey = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'][i]
            const asigs = asigPorDia(diaKey)
            const esHoy = format(new Date(), 'EEEE', { locale: es }).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === diaKey

            return (
              <div key={diaKey} className={`card ${esHoy ? 'ring-1 ring-brand-400' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">{diaLabel}</span>
                  {esHoy && <Badge variant="blue">Hoy</Badge>}
                  {asigs.length === 0 && <span className="text-xs text-gray-300">Sin asignación</span>}
                </div>
                {asigs.map((a) => {
                  // Determina si el usuario logueado es el TITULAR o el AUXILIAR de este turno.
                  const soyTitular = a.resource?.id === user?.resource_id
                  const sede = a.room?.site
                  const coord = a.resource?.lead_coordinator
                  const horasTurno = horasDeFranja(a.start_time, a.end_time)
                  return (
                    <div
                      key={a.id}
                      className={`${colorDeTipo[a.resource?.type] ?? 'slot-teal'} rounded-lg px-3 py-2 mb-1.5 last:mb-0`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {/* Línea 1: Sede + ciudad — lo primero que necesita ver el recurso */}
                          {sede && (
                            <div className="text-xs font-semibold text-teal-900 mb-0.5">
                              🏥 {sede.name}{sede.city ? ` · ${sede.city}` : ''}
                            </div>
                          )}
                          {/* Línea 2: Consultorio + especialidad */}
                          <div className="text-xs font-medium text-teal-900">
                            {a.room?.name} · {a.room?.specialty}
                          </div>
                          {/* Línea 3: Horario + pacientes + horas */}
                          <div className="text-xs text-teal-700 mt-0.5">
                            🕒 {a.start_time} – {a.end_time} · {fmtHoras(horasTurno)} · {a.patient_capacity} pac.
                          </div>
                          {/* Línea 4: Mi rol — titular o auxiliar de quién */}
                          {!soyTitular && a.resource && (
                            <div className="text-xs text-teal-700 mt-1">
                              Soy aux. de <strong>{a.resource?.name}</strong>
                            </div>
                          )}
                          {soyTitular && a.assistant && (
                            <div className="text-xs text-teal-700 mt-1">
                              Mi auxiliar: <strong>{a.assistant?.name}</strong>
                            </div>
                          )}
                          {soyTitular && a.assistant2 && (
                            <div className="text-xs text-teal-700">
                              Auxiliar 2: <strong>{a.assistant2?.name}</strong>
                            </div>
                          )}
                          {/* Línea 5: Coordinador responsable. Si no hay (recurso sin
                              líder asignado), mostramos el aviso para que el recurso
                              sepa que es un dato faltante, no un bug del sistema. */}
                          <div className="text-xs text-teal-600 mt-1 pt-1 border-t border-teal-200/40">
                            👤 Coord: {coord?.name ?? <span className="italic text-amber-700">Sin coordinador asignado</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {a.is_overtime && <Badge variant="amber">Extras</Badge>}
                          {a.is_replacement && <Badge variant="blue">Reemplazo</Badge>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {showAusencia && (
        <AusenciaFormModal
          recursoId={user?.resource_id}
          esquemaPago={user?.pay_scheme}
          onClose={() => setShowAusencia(false)}
          horarioSemana={horario}
        />
      )}
    </div>
  )
}
