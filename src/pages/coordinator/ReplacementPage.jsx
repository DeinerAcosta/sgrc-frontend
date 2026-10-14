import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ausenciaService, recursoService, asignacionService } from '@/services/api'
import { Avatar, Spinner, EmptyState, Badge } from '@/components/ui'
import { TIPOS_RECURSO, parseFechaLocal } from '@/utils/helpers'

/**
 * PANTALLA DE REEMPLAZO (oct-2026)
 * ================================
 *
 * Hector: "debe ser una pantalla completa para el remplazo que debe mostrar el
 * dia la hora, las sedes los coordinadores y todo eso para que pueda ser
 * directo al programador".
 *
 * Reemplaza al modal "Buscar reemplazo", que solo sabía de UNA franja: había
 * que abrirlo una vez por cada hueco y nunca se veía el panorama. Una ausencia
 * de martes a jueves de alguien que rota por tres sedes son nueve huecos, y
 * decidir hueco por hueco es cómo se pierden agendas.
 *
 * Aquí se ven todas las franjas caídas a la vez, cada una con su sede,
 * consultorio, horario, pacientes y coordinador. Importa el conjunto: si el
 * mismo día hay alguien libre en otra sede, se cubre sin mover un solo
 * paciente — que es el caso que Hector quiere poder resolver primero.
 *
 * Al asignar, la asignación nace con `covered_absence_id`, así que aparece en
 * el Programador en índigo, apilada bajo la casilla roja del ausente. No hay
 * un paso extra: esta pantalla ESCRIBE en la programación.
 */
export default function ReemplazoPage() {
  const { ausenciaId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['contexto-reemplazo', ausenciaId],
    queryFn: () => ausenciaService.contextoReemplazo(ausenciaId),
    enabled: !!ausenciaId,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  if (error || !data?.ausencia) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la ausencia"
          description={error?.message ?? 'La ausencia no existe o no tienes acceso a ella.'}
        />
      </div>
    )
  }

  const { ausencia, semana, franjas } = data
  const resueltas = franjas.filter((f) => f.reemplazo).length
  const pacientesEnJuego = franjas.reduce((n, f) => n + (f.patient_capacity ?? 0), 0)

  return (
    <div className="p-3 sm:p-4 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-xs text-gray-500 hover:text-brand-600 mb-3"
      >
        ← Volver
      </button>

      <CabeceraAusencia ausencia={ausencia} semana={semana} />

      {franjas.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="📭"
            title="No hay nada que reemplazar"
            description={
              semana
                ? 'Este profesional no tenía ninguna franja programada los días de la ausencia, así que no se cayó ninguna agenda.'
                : 'Las fechas de la ausencia no caen en ninguna semana programada.'
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Franjas que se cayeron ({franjas.length})
            </h2>
            <div className="text-xs text-gray-500">
              {resueltas} de {franjas.length} con reemplazo
              {pacientesEnJuego > 0 && <> · <strong className="text-red-700">{pacientesEnJuego} pacientes en juego</strong></>}
            </div>
          </div>

          <div className="space-y-3">
            {franjas.map((f) => (
              <TarjetaFranja key={f.assignment_id} franja={f} ausencia={ausencia} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** El encabezado: de quién es la ausencia, por qué y qué tan grande es. */
function CabeceraAusencia({ ausencia, semana }) {
  const tipo = TIPOS_RECURSO.find((t) => t.value === ausencia.resource?.type)
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <Avatar nombre={ausencia.resource?.name} size="lg" color={tipo?.color ?? 'red'} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">{ausencia.resource?.name}</h1>
            <Badge variant={ausencia.status === 'pendiente' ? 'amber' : 'red'}>
              {ausencia.status === 'pendiente' ? 'Sin confirmar' : 'Ausencia confirmada'}
            </Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {tipo?.label ?? ausencia.resource?.type}
            {ausencia.resource?.specialty ? ` · ${ausencia.resource.specialty}` : ''}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
            <Dato label="Fechas" valor={rangoFechas(ausencia)} />
            <Dato label="Días que cubre" valor={(ausencia.dias ?? []).join(', ') || '—'} />
            <Dato label="Motivo" valor={ausencia.motivo_catalogo ?? ausencia.type ?? '—'} />
            <Dato
              label="Pacientes impactados"
              valor={ausencia.patients_affected ?? '—'}
              destacado={!!ausencia.patients_affected}
            />
          </div>

          {ausencia.motivo_texto && (
            <div className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2">
              {ausencia.motivo_texto}
            </div>
          )}

          {semana && (
            <div className="mt-3 text-[11px] text-gray-400">
              Semana {format(parseFechaLocal(semana.desde), 'd MMM', { locale: es })} –{' '}
              {format(parseFechaLocal(semana.hasta), 'd MMM yyyy', { locale: es })}
              {semana.estado === 'cerrada' && ' · cerrada'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Dato({ label, valor, destacado }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className={destacado ? 'text-red-700 font-semibold' : 'text-gray-800 font-medium'}>{valor}</div>
    </div>
  )
}

function rangoFechas(a) {
  const d = (x) => format(parseFechaLocal(x), "d 'de' MMM", { locale: es })
  if (!a.end_date || a.start_date === a.end_date) return d(a.start_date)
  return `${d(a.start_date)} → ${d(a.end_date)}`
}

/**
 * Una franja caída: el hueco concreto a cubrir, con todo lo que hace falta
 * para decidir sin salir de la pantalla. Los candidatos solo se piden cuando
 * se abre — una ausencia de tres días en tres sedes son nueve consultas, y la
 * mayoría de las franjas se resuelven mirando dos.
 */
function TarjetaFranja({ franja, ausencia }) {
  const [abierta, setAbierta] = useState(false)
  const yaResuelta = !!franja.reemplazo

  return (
    <div className={`card ${yaResuelta ? 'border-indigo-200 bg-indigo-50/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 capitalize">{franja.weekday}</span>
            <span className="text-sm text-gray-700">{franja.start_time}–{franja.end_time}</span>
            {franja.patient_capacity > 0 && (
              <Badge variant="red">{franja.patient_capacity} pac.</Badge>
            )}
          </div>

          <div className="text-xs text-gray-600 mt-1">
            📍 <strong>{franja.site?.name ?? '—'}</strong>
            {franja.site?.city ? ` (${franja.site.city})` : ''} · {franja.room?.name ?? '—'}
          </div>

          <div className="text-xs text-gray-500 mt-1">
            Coordina:{' '}
            {franja.coordinadores?.length
              ? franja.coordinadores.map((c) => c.name).join(', ')
              : <span className="text-gray-300">sin coordinador asignado a la sede</span>}
          </div>

          {franja.assistant && (
            <div className="text-xs text-gray-500 mt-0.5">Auxiliar: {franja.assistant.name}</div>
          )}
        </div>

        <div className="flex-shrink-0">
          {yaResuelta ? (
            <div className="text-right">
              <div className="text-[11px] text-indigo-500 uppercase tracking-wide font-semibold">🔄 Cubierta</div>
              <div className="text-sm font-medium text-indigo-900">{franja.reemplazo.resource?.name}</div>
            </div>
          ) : (
            <button className="btn-primary text-xs" onClick={() => setAbierta((v) => !v)}>
              {abierta ? 'Ocultar candidatos' : '🔍 Buscar quién la cubre'}
            </button>
          )}
        </div>
      </div>

      {abierta && !yaResuelta && <Candidatos franja={franja} ausencia={ausencia} onListo={() => setAbierta(false)} />}
    </div>
  )
}

/** Los candidatos de esa franja, separados por si tienen que desplazarse. */
function Candidatos({ franja, ausencia, onListo }) {
  const qc = useQueryClient()

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ['sugerir-reemplazo', franja.assignment_id],
    queryFn: () => recursoService.sugerirReemplazos({
      type: ausencia.resource?.type,
      day: franja.weekday,
      start_time: franja.start_time,
      end_time: franja.end_time,
      city: franja.site?.city,
      week_id: franja.week_id,
      room_id: franja.room_id,
    }),
  })

  const { mutate: asignar, isPending } = useMutation({
    mutationFn: (recursoId) => asignacionService.create({
      week_id: franja.week_id,
      room_id: franja.room_id,
      resource_id: recursoId,
      assistant_id: franja.assistant_id,
      weekday: franja.weekday,
      start_time: franja.start_time,
      end_time: franja.end_time,
      is_replacement: true,
      covered_absence_id: ausencia.id,
    }, 'coordinador'),
    onSuccess: () => {
      toast.success('Reemplazo asignado. Ya aparece en el Programador.')
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['ausencias-de-la-semana'] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      onListo()
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo asignar el reemplazo'),
  })

  const mismaSede = candidatos.filter((c) => c.misma_sede)
  const otrasSedes = candidatos.filter((c) => !c.misma_sede)

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : candidatos.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded p-3">
          No hay nadie del mismo tipo libre en esa franja en {franja.site?.city ?? 'la ciudad'}.
          Toca reprogramar a los pacientes a otro día.
        </div>
      ) : (
        <>
          {mismaSede.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wider mb-2">
                Misma sede ({mismaSede.length}) · no hay que mover a nadie
              </div>
              <div className="space-y-2 mb-4">
                {mismaSede.map((r) => (
                  <Candidato key={r.id} r={r} onAsignar={() => asignar(r.id)} disabled={isPending} />
                ))}
              </div>
            </>
          )}

          {otrasSedes.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2">
                Otras sedes de {franja.site?.city} ({otrasSedes.length}) · requiere desplazamiento
              </div>
              <div className="space-y-2">
                {otrasSedes.map((r) => (
                  <Candidato key={r.id} r={r} onAsignar={() => asignar(r.id)} disabled={isPending} alerta />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Candidato({ r, onAsignar, disabled, alerta }) {
  const tipo = TIPOS_RECURSO.find((t) => t.value === r.type)
  const horas = r.assigned_hours ?? 0
  const max = r.max_hours_per_week ?? 42
  const pct = max ? Math.round((horas / max) * 100) : 0
  return (
    <div className="border border-gray-100 rounded-lg p-3 flex items-center gap-3 bg-white">
      <Avatar nombre={r.name} size="sm" color={tipo?.color ?? 'blue'} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
        <div className="text-xs text-gray-500">
          {tipo?.label}{r.specialty ? ` · ${r.specialty}` : ''} · {horas}h de {max}h ({pct}%)
        </div>
        {alerta && <div className="text-xs text-amber-700 mt-1">⚠ Tiene que desplazarse a esta sede</div>}
      </div>
      <button className="btn-primary text-xs flex-shrink-0" onClick={onAsignar} disabled={disabled}>
        Asignar
      </button>
    </div>
  )
}
