import { useQuery } from '@tanstack/react-query'
import { asignacionService } from '@/services/api'
import { DIAS, DIAS_LABEL, debeDescontarAlmuerzo, clsx } from '@/utils/helpers'

const aMin = (hhmm) => {
  const [h, m] = (hhmm ?? '00:00').split(':').map(Number)
  return h * 60 + m
}

/** Horario de la persona dentro del turno: el suyo si es auxiliar con sub-horario. */
function horarioEnTurno(a, personaId) {
  if (a.assistant_id === personaId) return [a.assistant_start_time || a.start_time, a.assistant_end_time || a.end_time]
  if (a.assistant2_id === personaId) return [a.assistant2_start_time || a.start_time, a.assistant2_end_time || a.end_time]
  return [a.start_time, a.end_time]
}

/** Horas efectivas de un día: unión de franjas menos el almuerzo (misma regla que el backend). */
function horasDelDia(franjas, tipo) {
  const ivs = franjas.map((f) => [aMin(f.ini), aMin(f.fin)]).filter(([i, f]) => f > i).sort((x, y) => x[0] - y[0])
  if (!ivs.length) return 0
  let total = 0
  let [ci, cf] = ivs[0]
  for (const [i, f] of ivs.slice(1)) {
    if (i <= cf) cf = Math.max(cf, f)
    else { total += cf - ci; ci = i; cf = f }
  }
  total += cf - ci
  const ini = ivs[0][0]
  const fin = Math.max(...ivs.map(([, f]) => f))
  return (total - (debeDescontarAlmuerzo(total, ini, fin, tipo) ? 60 : 0)) / 60
}

const redondear = (h) => Math.round(h * 10) / 10

/**
 * Nov-2026 · Hector: al elegir la auxiliar, ver en qué está programada esa
 * semana y cuántas horas le quedan, contando ya el turno que se está armando.
 *
 * Props: persona (recurso del pool de apoyo), semanaId, dia, ini/fin (su horario
 * en este turno), asignacionId (al editar, para no contar el turno dos veces).
 */
export default function AssistantWeekLoad({ persona, semanaId, dia, ini, fin, asignacionId }) {
  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['asigs-persona-semana', semanaId, persona.id],
    queryFn: () => asignacionService.list({ week_id: semanaId, resource_id: persona.id }),
    enabled: !!semanaId,
  })

  const franjas = turnos
    .filter((a) => a.id !== asignacionId)
    .map((a) => {
      const [i, f] = horarioEnTurno(a, persona.id)
      return { id: a.id, dia: a.weekday, ini: i, fin: f, consultorio: a.room?.name ?? '—', sede: a.room?.site?.name ?? '' }
    })
  const nueva = ini && fin && aMin(fin) > aMin(ini) ? { id: 'nueva', dia, ini, fin, nueva: true } : null
  const todas = nueva ? [...franjas, nueva] : franjas
  const choca = (f) => !f.nueva && nueva && f.dia === dia && aMin(f.ini) < aMin(nueva.fin) && aMin(nueva.ini) < aMin(f.fin)

  // Domingo solo si tiene algo: casi nunca se programa.
  const dias = DIAS.filter((d) => d !== 'domingo' || todas.some((f) => f.dia === 'domingo'))
  const horasPorDia = Object.fromEntries(dias.map((d) => [d, horasDelDia(todas.filter((f) => f.dia === d), persona.type)]))
  const total = redondear(Object.values(horasPorDia).reduce((a, b) => a + b, 0))
  const tope = persona.max_effective_hours ?? persona.max_hours_per_week ?? 42
  const quedan = redondear(tope - total)
  const pct = Math.min(100, tope > 0 ? (total / tope) * 100 : 0)

  if (isLoading) return <div className="text-xs text-gray-400 mt-2">Cargando su semana…</div>

  return (
    <div className="mt-2 rounded-lg border border-gray-200 p-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
        {dias.map((d) => (
          <div key={d} className="min-w-0">
            <div className={clsx('text-[11px] font-semibold text-center', d === dia ? 'text-brand-600' : 'text-gray-500')}>
              {DIAS_LABEL[DIAS.indexOf(d)]}
            </div>
            <div className="text-[10px] text-center text-gray-400 mb-1">{redondear(horasPorDia[d])}h</div>
            <div className="space-y-1">
              {todas
                .filter((f) => f.dia === d)
                .sort((a, b) => aMin(a.ini) - aMin(b.ini))
                .map((f) => (
                  <div
                    key={f.id}
                    title={f.nueva ? 'Este turno' : `${f.consultorio}${f.sede ? ' · ' + f.sede : ''}`}
                    className={clsx(
                      'rounded px-1 py-0.5 text-[10px] leading-tight border',
                      f.nueva ? 'bg-brand-50 border-brand-400 text-brand-800 font-semibold'
                        : choca(f) ? 'bg-red-50 border-red-400 text-red-700'
                          : 'bg-green-50 border-green-200 text-green-800',
                    )}
                  >
                    <div>{f.ini}–{f.fin}</div>
                    <div className="truncate">{f.nueva ? 'Este turno' : f.consultorio}</div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
          <div className={clsx('h-full', quedan < 0 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${pct}%` }} />
        </div>
        <div className={clsx('text-xs mt-1', quedan < 0 ? 'text-red-600 font-semibold' : 'text-gray-600')}>
          {total}h de {tope}h · {quedan < 0 ? `se pasa por ${-quedan}h` : `le quedan ${quedan}h`}
        </div>
      </div>
    </div>
  )
}
