/**
 * Matriz de asignaciones — cuentas de la malla.
 * Copia de sgrc-backend/src/lib/matrizAuxiliares.js: si cambia la regla, se
 * cambia en los dos lados.
 */

// 13-nov · Hector: también el domingo.
export const DIAS_MATRIZ = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
export const DIAS_MATRIZ_LABEL = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const aMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Horas de un día: el hueco entre franjas es el almuerzo; una sola franja
 * corrida de más de 7h descuenta 1h. Es la cuenta que hacía el Excel.
 * Nov-2026 · Si la franja trae su almuerzo marcado (`lunch`), se descuenta
 * ese y ya no el automático.
 */
export function horasDelDiaMatriz(franjas = []) {
  return horasPorFranja(franjas).reduce((s, h) => s + h, 0)
}

/** Las horas de cada franja, para pintarlas una por una (suman lo mismo que horasDelDiaMatriz). */
export function horasPorFranja(franjas = []) {
  const validas = (franjas ?? []).filter((f) => HHMM.test(f?.ini ?? '') && HHMM.test(f?.fin ?? '') && aMin(f.fin) > aMin(f.ini))
  const unaSola = validas.length === 1
  return validas.map((f) => {
    const minutos = aMin(f.fin) - aMin(f.ini)
    const li = f.lunch?.ini, lf = f.lunch?.fin
    if (HHMM.test(li ?? '') && HHMM.test(lf ?? '') && aMin(lf) > aMin(li)) return Math.max(0, minutos - (aMin(lf) - aMin(li))) / 60
    return (minutos - (unaSola && minutos > 7 * 60 ? 60 : 0)) / 60
  })
}

/** 8.5 → "8,5" · 8 → "8" (como se escribe en la clínica). */
export const fmtHoras = (h) => (Math.round(h * 10) / 10).toString().replace('.', ',')

/**
 * Estado de una auxiliar en el día y la hora de un turno (lo calcula el
 * backend, lib/matrizAuxiliares.js estadoAuxiliarEnTurno). Ausente y Asignado
 * no se pueden elegir.
 */
export const ESTADOS_AUX = {
  disponible:  { label: 'Disponible',  cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  sin_asignar: { label: 'Sin asignar', cls: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-500' },
  asignado:    { label: 'Asignado',    cls: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  ausente:     { label: 'Ausente',     cls: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500' },
}
export const elegible = (estado) => estado === 'disponible' || estado === 'sin_asignar'

const aHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const valida = (f) => HHMM.test(f?.ini ?? '') && HHMM.test(f?.fin ?? '') && aMin(f.fin) > aMin(f.ini)

/**
 * Nov-2026 · Hector: un turno lleva auxiliares "hasta que se acabe el horario
 * del médico". Devuelve los tramos del turno [ini, fin) que ninguna auxiliar
 * cubre todavía, como [{ ini, fin }] en HH:MM. Vacío = turno cubierto.
 */
export function huecosSinCubrir(ini, fin, rangos = []) {
  if (!valida({ ini, fin })) return []
  const s = aMin(ini), e = aMin(fin)
  const tramos = rangos.filter(valida)
    .map((r) => [Math.max(s, aMin(r.ini)), Math.min(e, aMin(r.fin))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  const huecos = []
  let cursor = s
  for (const [a, b] of tramos) {
    if (a > cursor) huecos.push({ ini: aHHMM(cursor), fin: aHHMM(a) })
    cursor = Math.max(cursor, b)
  }
  if (cursor < e) huecos.push({ ini: aHHMM(cursor), fin: aHHMM(e) })
  return huecos
}

/**
 * La hora con la que llega una auxiliar al turno. Hector: "la de la Matriz".
 * Se toma su franja de la Matriz que más se cruza con el turno, recortada al
 * turno. Si no tiene franja en la Matriz que caiga en el turno, el primer
 * tramo que falta cubrir; y si ya está todo cubierto, el turno completo.
 */
export function horaPorDefecto({ franjasMatriz = [], ini, fin, huecos = [] }) {
  if (!valida({ ini, fin })) return { ini, fin }
  const s = aMin(ini), e = aMin(fin)
  let mejor = null
  for (const f of franjasMatriz.filter(valida)) {
    const a = Math.max(s, aMin(f.ini)), b = Math.min(e, aMin(f.fin))
    if (b > a && (!mejor || b - a > mejor[1] - mejor[0])) mejor = [a, b]
  }
  if (mejor) return { ini: aHHMM(mejor[0]), fin: aHHMM(mejor[1]) }
  if (huecos.length) return { ...huecos[0] }
  return { ini, fin }
}

/**
 * Nov-2026 · Las auxiliares de un turno, en orden: [{ id, name, ini, fin }]
 * con la hora efectiva de cada una. Lee la lista nueva (`assistants`) y, si
 * no viene, los campos viejos auxiliar/auxiliar #2.
 */
export function auxiliaresDeTurno(a) {
  if (!a) return []
  const ini = a.start_time, fin = a.end_time
  if (Array.isArray(a.assistants)) {
    return a.assistants.map((x) => ({
      id: x.resource_id, name: x.resource?.name ?? '', ini: x.start_time || ini, fin: x.end_time || fin,
      // Nov-2026 · Descanso de esta auxiliar y, si cubre el de otra, su orden.
      dIni: x.break_start_time ?? null, dFin: x.break_end_time ?? null,
      cubreDe: x.covers_break_of ?? null,
    }))
  }
  return [
    a.assistant_id && { id: a.assistant_id, name: a.assistant?.name ?? '', ini: a.assistant_start_time || ini, fin: a.assistant_end_time || fin },
    a.assistant2_id && { id: a.assistant2_id, name: a.assistant2?.name ?? '', ini: a.assistant2_start_time || ini, fin: a.assistant2_end_time || fin },
  ].filter(Boolean)
}
