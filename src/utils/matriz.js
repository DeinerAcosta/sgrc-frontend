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

/** 8.5 → "8,5" · 8 → "8" (como se escribe en la clínica). */
export const fmtHoras = (h) => (Math.round(h * 10) / 10).toString().replace('.', ',')
