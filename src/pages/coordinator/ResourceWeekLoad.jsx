import { useState } from 'react'
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

/** En qué va la persona dentro del turno. */
function papelEnTurno(a, personaId) {
  if (a.assistant_id === personaId) return 'Auxiliar'
  if (a.assistant2_id === personaId) return 'Auxiliar #2'
  return 'Profesional'
}

const conHorario = (nombre, ini, fin) => (ini && fin ? `${nombre} (${ini}–${fin})` : nombre)

/** Tarjeta con el detalle del turno, fija en pantalla para que el scroll del panel no la corte. */
function DetalleTurno({ f, rect, choca, tipo }) {
  const ancho = 260
  const izq = rect.right + 8 + ancho <= window.innerWidth ? rect.right + 8 : Math.max(8, rect.left - 8 - ancho)
  const arriba = Math.max(8, Math.min(rect.top - 8, window.innerHeight - 230))
  const d = f.detalle ?? {}
  const fila = (k, v) => (v ? <div><span className="text-gray-400">{k}:</span> <span className="font-medium text-gray-800">{v}</span></div> : null)
  const parcial = d.papel !== 'Profesional' && d.turnoIni && (d.turnoIni !== f.ini || d.turnoFin !== f.fin)
  return (
    <div
      className="fixed z-[70] pointer-events-none rounded-lg border border-gray-200 bg-white shadow-xl p-3 text-xs space-y-1"
      style={{ left: izq, top: arriba, width: ancho }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{DIAS_LABEL[DIAS.indexOf(f.dia)]} · {f.ini}–{f.fin}</span>
        <span className="text-gray-500 tabular-nums">{redondear(horasDelDia([f], tipo))}h</span>
      </div>
      {f.nueva && <div className="text-brand-600 font-semibold">Este turno</div>}
      {choca && <div className="text-red-700 font-semibold">Se cruza con este turno</div>}
      {fila('Consultorio', [d.consultorio, d.sede].filter(Boolean).join(' · '))}
      {fila('Va como', parcial ? `${d.papel} · turno de ${d.turnoIni}–${d.turnoFin}` : d.papel)}
      {fila('Profesional', d.profesional)}
      {(d.auxiliares ?? []).map((x, i) => <div key={i}>{fila(i === 0 ? 'Auxiliar' : 'Auxiliar #2', x)}</div>)}
      {fila('Pacientes', d.pacientes != null && d.pacientes !== '' ? String(d.pacientes) : null)}
      {d.contingencia && <div className="text-orange-700 font-medium">🟧 En contingencia</div>}
      {d.reprogramacion && <div className="text-blue-700 font-medium">🔀 Cubre una ausencia</div>}
    </div>
  )
}

/**
 * Nov-2026 · Hector: al elegir a alguien en el modal de asignación (profesional
 * o auxiliar), ver en qué está programado esa semana y cuántas horas le quedan,
 * contando ya el turno que se está armando.
 *
 * Props: persona (el recurso elegido), rol (texto sobre el nombre), semanaId,
 * dia, ini/fin (su horario en este turno), asignacionId (al editar, para no
 * contar el turno dos veces), turnoActual (lo que se está armando, para el
 * detalle al pasar el mouse).
 */
export default function ResourceWeekLoad({ persona, rol, semanaId, dia, ini, fin, asignacionId, turnoActual }) {
  const [hover, setHover] = useState(null)
  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['asigs-persona-semana', semanaId, persona.id],
    queryFn: () => asignacionService.list({ week_id: semanaId, resource_id: persona.id }),
    enabled: !!semanaId,
  })

  const franjas = turnos
    .filter((a) => a.id !== asignacionId)
    .map((a) => {
      const [i, f] = horarioEnTurno(a, persona.id)
      return {
        id: a.id, dia: a.weekday, ini: i, fin: f, consultorio: a.room?.name ?? '—',
        detalle: {
          consultorio: a.room?.name, sede: a.room?.site?.name,
          papel: papelEnTurno(a, persona.id), turnoIni: a.start_time, turnoFin: a.end_time,
          profesional: a.resource?.name,
          auxiliares: [
            a.assistant && conHorario(a.assistant.name, a.assistant_start_time, a.assistant_end_time),
            a.assistant2 && conHorario(a.assistant2.name, a.assistant2_start_time, a.assistant2_end_time),
          ].filter(Boolean),
          pacientes: a.patient_capacity,
          contingencia: a.contingency,
          reprogramacion: !!a.covered_absence_id,
        },
      }
    })
  const nueva = ini && fin && aMin(fin) > aMin(ini)
    ? { id: 'nueva', dia, ini, fin, nueva: true, detalle: { ...turnoActual, papel: rol, turnoIni: turnoActual?.ini, turnoFin: turnoActual?.fin } }
    : null
  const todas = nueva ? [...franjas, nueva] : franjas
  const choca = (f) => !f.nueva && nueva && f.dia === dia && aMin(f.ini) < aMin(nueva.fin) && aMin(nueva.ini) < aMin(f.fin)

  // Domingo solo si tiene algo: casi nunca se programa.
  const dias = DIAS.filter((d) => d !== 'domingo' || todas.some((f) => f.dia === 'domingo'))
  const horasPorDia = Object.fromEntries(dias.map((d) => [d, horasDelDia(todas.filter((f) => f.dia === d), persona.type)]))
  const total = redondear(Object.values(horasPorDia).reduce((a, b) => a + b, 0))
  // null = sin tope semanal (oftalmólogos y otorrinos): se muestran las horas y ya.
  const tope = persona.max_effective_hours ?? persona.max_hours_per_week ?? null
  const quedan = tope == null ? null : redondear(tope - total)
  const pct = tope ? Math.min(100, (total / tope) * 100) : 0
  // El tope baja con los festivos: 42h × 5/6 = 35h si el lunes es festivo.
  const festivos = persona.festivos_en_semana ?? 0

  return (
    <div className="rounded-lg border border-gray-200 p-2 bg-white">
      <div className="mb-2 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">{rol}</div>
        <div className="text-xs font-semibold text-gray-900 truncate">{persona.name}</div>
      </div>
      {isLoading ? <div className="text-xs text-gray-400">Cargando su semana…</div> : (<>
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
                    onMouseEnter={(e) => setHover({ f, rect: e.currentTarget.getBoundingClientRect() })}
                    onMouseLeave={() => setHover(null)}
                    className={clsx(
                      'rounded px-1 py-0.5 text-[10px] leading-tight border cursor-default transition-transform duration-150 hover:scale-110 hover:shadow-md hover:relative hover:z-10',
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
      {tope == null ? (
        <div className="text-xs mt-2 text-gray-600">{total}h esta semana · sin tope semanal</div>
      ) : (
        <div className="mt-2">
          <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
            <div className={clsx('h-full', quedan < 0 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${pct}%` }} />
          </div>
          <div className={clsx('text-xs mt-1', quedan < 0 ? 'text-red-600 font-semibold' : 'text-gray-600')}>
            {total}h de {tope}h · {quedan < 0 ? `se pasa por ${-quedan}h` : `le quedan ${quedan}h`}
            {festivos > 0 && persona.max_hours_per_week != null && (
              <span className="text-gray-400"> · {persona.max_hours_per_week}h menos {festivos} {festivos === 1 ? 'festivo' : 'festivos'}</span>
            )}
          </div>
        </div>
      )}
      </>)}
      {hover && <DetalleTurno f={hover.f} rect={hover.rect} choca={choca(hover.f)} tipo={persona.type} />}
    </div>
  )
}
