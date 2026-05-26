import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addWeeks, subWeeks, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { recursoService, semanaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, KpiCard, Spinner, EmptyState } from '@/components/ui'
import { DIAS_FULL, semanaLabel } from '@/utils/helpers'
import AusenciaFormModal from '@/pages/recurso/AusenciaFormModal'

export default function HorarioPage() {
  const { user } = useAuthStore()
  const [semanaBase, setSemanaBase] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [showAusencia, setShowAusencia] = useState(false)

  const { data: semanas = [], isLoading: loadingSemanas } = useQuery({
    queryKey: ['semanas', user?.recurso_id],
    queryFn: () => semanaService.list({ recurso_id: user?.recurso_id }),
  })

  const semanaActual = semanas.find(
    (s) => new Date(s.fecha_inicio) <= semanaBase && new Date(s.fecha_fin) >= semanaBase
  )

  const { data: horario, isLoading } = useQuery({
    queryKey: ['horario', user?.recurso_id, semanaActual?.id],
    queryFn: () => recursoService.horario(user?.recurso_id, semanaActual?.id),
    enabled: !!semanaActual,
  })

  const horasProg   = horario?.reduce((acc, a) => acc + a.horas, 0) ?? 0
  const horasMax    = user?.horas_max_semana ?? 42
  const pacientesProg = horario?.reduce((acc, a) => acc + (a.pacientes_capacidad ?? 0), 0) ?? 0

  const asigPorDia = (dia) => horario?.filter((a) => a.dia_semana === dia) ?? []

  const colorDeTipo = {
    oftalmologo:   'slot-teal',
    anestesiologo: 'slot-blue',
    auxiliar:      'slot-teal',
    optometra:     'slot-purple',
    tecnico:       'slot-blue',
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Mi horario</h1>
          <p className="text-xs text-gray-500">{user?.nombre} · {user?.especialidad ?? user?.tipo}</p>
        </div>
        <button className="btn-danger" onClick={() => setShowAusencia(true)}>
          ⚠️ Reportar ausencia
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Horas programadas" value={`${horasProg}h`} />
        <KpiCard
          label="Disponibles sin asignar"
          value={`${Math.max(0, horasMax - horasProg)}h`}
          color={horasMax - horasProg > 4 ? 'warning' : 'default'}
        />
        <KpiCard label="Pacientes programados" value={pacientesProg} />
      </div>

      {/* Semana nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn" onClick={() => setSemanaBase((d) => subWeeks(d, 1))}>← Anterior</button>
        <div className="text-sm font-medium text-gray-700">
          {semanaLabel(semanaBase)}
          {semanaActual?.estado === 'cerrada' && <Badge variant="gray" className="ml-2">Cerrada</Badge>}
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
                {asigs.map((a) => (
                  <div
                    key={a.id}
                    className={`${colorDeTipo[a.recurso?.tipo] ?? 'slot-teal'} rounded-lg px-3 py-2 mb-1.5 last:mb-0`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-teal-900">
                          {a.consultorio?.nombre} · {a.consultorio?.especialidad}
                        </div>
                        {a.recurso_principal && (
                          <div className="text-xs text-teal-700">Dr/a. {a.recurso_principal?.nombre}</div>
                        )}
                        <div className="text-xs text-teal-600 mt-0.5">
                          {a.hora_inicio} – {a.hora_fin} · {a.pacientes_capacidad} pacientes
                        </div>
                        {a.auxiliar && (
                          <div className="text-xs text-teal-600">Aux: {a.auxiliar?.nombre}</div>
                        )}
                      </div>
                      {a.es_horas_extras && <Badge variant="amber">Extras</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {showAusencia && (
        <AusenciaFormModal
          recursoId={user?.recurso_id}
          esquemaPago={user?.esquema_pago}
          onClose={() => setShowAusencia(false)}
          horarioSemana={horario}
        />
      )}
    </div>
  )
}
