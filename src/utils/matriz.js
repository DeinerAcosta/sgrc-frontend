/**
 * Matriz de asignaciones — cuentas de la malla.
 * Copia de sgrc-backend/src/lib/matrizAuxiliares.js: si cambia la regla, se
 * cambia en los dos lados.
 */

export const DIAS_MATRIZ = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
export const DIAS_MATRIZ_LABEL = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const aMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Horas de un día: el hueco entre franjas es el almuerzo; una sola franja
 * corrida de más de 7h descuenta 1h. Es la cuenta que hacía el Excel.
 */
export function horasDelDiaMatriz(franjas = []) {
  const validas = franjas.filter((f) => HHMM.test(f?.ini ?? '') && HHMM.test(f?.fin ?? '') && aMin(f.fin) > aMin(f.ini))
  const minutos = validas.reduce((s, f) => s + aMin(f.fin) - aMin(f.ini), 0)
  const almuerzo = validas.length === 1 && minutos > 7 * 60 ? 60 : 0
  return (minutos - almuerzo) / 60
}

/**
 * Las horas de cada franja, para pintarlas una por una. Suman lo mismo que
 * horasDelDiaMatriz: con una sola franja larga el almuerzo se le descuenta a
 * ella; con varias, cada una vale lo que dura.
 */
export function horasPorFranja(franjas = []) {
  if (franjas.length === 1) return [horasDelDiaMatriz(franjas)]
  return franjas.map((f) => Math.max(0, aMin(f.fin) - aMin(f.ini)) / 60)
}

/** 8.5 → "8,5" · 8 → "8" (como se escribe en la clínica). */
export const fmtHoras = (h) => (Math.round(h * 10) / 10).toString().replace('.', ',')

/**
 * Estado de una auxiliar en el día y la hora de un turno (lo calcula el
 * backend, lib/matrizAuxiliares.js estadoAuxiliarEnTurno). Ausente y Asignado
 * no se pueden elegir.
 */
export const ESTADOS_AUX = {
  // Colores clínicos (ver TONOS en components/ui): menta disponible, cielo
  // asignado, gris sin asignar, rojo ausente.
  disponible:  { label: 'Disponible',  cls: 'bg-iris-green-50 text-iris-green-800 ring-1 ring-iris-green-200', dot: 'bg-iris-green-700' },
  sin_asignar: { label: 'Sin asignar', cls: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200',                   dot: 'bg-gray-400' },
  asignado:    { label: 'Asignado',    cls: 'bg-iris-blue-50 text-iris-blue-800 ring-1 ring-iris-blue-200',    dot: 'bg-iris-blue-700' },
  ausente:     { label: 'Ausente',     cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',                   dot: 'bg-rose-500' },
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
    }))
  }
  return [
    a.assistant_id && { id: a.assistant_id, name: a.assistant?.name ?? '', ini: a.assistant_start_time || ini, fin: a.assistant_end_time || fin },
    a.assistant2_id && { id: a.assistant2_id, name: a.assistant2?.name ?? '', ini: a.assistant2_start_time || ini, fin: a.assistant2_end_time || fin },
  ].filter(Boolean)
}
