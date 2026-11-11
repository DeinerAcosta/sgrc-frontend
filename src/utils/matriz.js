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
  disponible:  { label: 'Disponible',  cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  sin_asignar: { label: 'Sin asignar', cls: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-500' },
  asignado:    { label: 'Asignado',    cls: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  ausente:     { label: 'Ausente',     cls: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500' },
}
export const elegible = (estado) => estado === 'disponible' || estado === 'sin_asignar'
