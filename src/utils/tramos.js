/**
 * Pacientes de un tramo de franja — copia para MOSTRAR.
 *
 * Quien decide es el servidor (sgrc-backend/src/lib/tramos.js): al guardar un
 * tramo de reemplazo calcula él los pacientes desde la agenda que se cayó.
 * Esta copia solo sirve para enseñar el número mientras se elige el horario,
 * antes de guardar. Si una cambia, la otra también.
 *
 * Redondeo ACUMULADO: los tramos de cualquier partición suman exactamente los
 * pacientes de la franja. Redondear cada uno por separado podía dar 10 =
 * 3 + 3 + 3, y el caso no se cerraría nunca.
 */
const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

export function pacientesDelTramo(pacientes, franja, tramo) {
  const ini = aMinutos(franja.desde)
  const dur = aMinutos(franja.hasta) - ini
  if (dur <= 0 || !pacientes) return 0
  const hastaDonde = (hhmm) => {
    const m = Math.min(Math.max(aMinutos(hhmm) - ini, 0), dur)
    return Math.round((pacientes * m) / dur)
  }
  return Math.max(0, hastaDonde(tramo.hasta) - hastaDonde(tramo.desde))
}

const aHHmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * Hasta qué hora atiende quien toma `n` pacientes empezando en `desde`.
 *
 * Oct-2026 · Hector: al pulsar Asignar "me debe salir un modal diciendo
 * cuántos pacientes puede, y así poder seleccionar a más de uno". Se elige
 * cuántos pacientes, no las horas; la hora sale de aquí, porque cada paciente
 * conserva la suya: si toma los primeros 10 de una agenda de 16 entre 07:00 y
 * 13:00, atiende de 07:00 a 10:45 y el siguiente médico sigue desde ahí.
 *
 * Devuelve una hora tal que pacientesDelTramo(desde → hora) es exactamente n,
 * así el resto que queda pendiente cuadra con lo que dice la pantalla. Se
 * prefiere una hora redonda (múltiplo de 5) si da el mismo número.
 */
export function horaDeCorte(pacientes, franja, desde, n) {
  const ini = aMinutos(franja.desde)
  const fin = aMinutos(franja.hasta)
  const dur = fin - ini
  if (dur <= 0 || !pacientes || n <= 0) return desde
  const acumulado = (m) => Math.round((pacientes * Math.min(Math.max(m, 0), dur)) / dur)
  const objetivo = acumulado(aMinutos(desde) - ini) + n
  if (objetivo >= pacientes) return franja.hasta

  const exacto = Math.round((dur * objetivo) / pacientes)
  const candidatos = [Math.round(exacto / 5) * 5, exacto]
  for (let d = 1; d <= dur; d++) candidatos.push(exacto - d, exacto + d)
  const m = candidatos.find((x) => x > aMinutos(desde) - ini && x <= dur && acumulado(x) === objetivo)
  return m == null ? franja.hasta : aHHmm(ini + m)
}
