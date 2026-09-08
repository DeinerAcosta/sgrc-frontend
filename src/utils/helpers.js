import { format, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
export const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Parsea una fecha "calendario" (YYYY-MM-DD, sin hora) como Date LOCAL.
 *
 * Por qué: cuando el backend devuelve un campo DATE de MySQL, Prisma lo serializa
 * como ISO 8601 con sufijo Z ("2026-06-08T00:00:00.000Z") = medianoche UTC.
 * parseISO interpreta eso como UTC, y format() lo muestra en timezone local.
 * En Colombia (UTC-5), medianoche UTC = 7 PM del día anterior → se ve "domingo 7"
 * en lugar de "lunes 8".
 *
 * Esta helper extrae YYYY-MM-DD del string y construye Date(y, m-1, d) que
 * representa el día calendario en TIMEZONE LOCAL → format() lo muestra correcto.
 *
 * Uso:
 *   parseFechaLocal(festivo.fecha)  // en lugar de parseISO(festivo.fecha)
 *   format(parseFechaLocal('2026-06-08'), 'EEEE d MMM', { locale: es }) → "lunes 8 jun"
 */
export function parseFechaLocal(iso) {
  if (!iso) return null
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
export const DIAS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export const TIPOS_AUSENCIA = [
  { value: 'enfermedad',          label: 'Incapacidad por enfermedad' },
  { value: 'calamidad',           label: 'Ausencia por calamidad' },
  { value: 'academico',           label: 'Evento académico (congreso)' },
  { value: 'familiar',            label: 'Evento familiar' },
  { value: 'vacaciones',          label: 'Vacaciones / viaje' },
  { value: 'no_presentacion',     label: 'No presentación' },
  { value: 'licencia_remunerada', label: 'Licencia remunerada' },
  { value: 'licencia_no_remunerada', label: 'Licencia no remunerada' },
  { value: 'otra',                label: 'Otra' },
]

export const TIPOS_RECURSO = [
  { value: 'oftalmologo',      label: 'Oftalmólogo',         color: 'teal' },
  { value: 'optometra',        label: 'Optómetra',           color: 'purple' },
  { value: 'anestesiologo',    label: 'Anestesiólogo',       color: 'blue' },
  { value: 'asesor_servicios', label: 'Asesor de Servicios', color: 'amber' },
  { value: 'auxiliar',         label: 'Auxiliar',            color: 'green' },
  { value: 'tecnico',          label: 'Técnico',             color: 'gray' },
  { value: 'fonoaudiologa',    label: 'Fonoaudióloga',       color: 'pink' },
  { value: 'otorrino',         label: 'Otorrino',            color: 'orange' },
]

export const ESPECIALIDADES = [
  { value: 'oftalmologia',         label: 'Oftalmología' },
  { value: 'optometria',           label: 'Optometría' },
  { value: 'anestesiologia',       label: 'Anestesiología' },
  { value: 'diagnostico',          label: 'Diagnóstico' },
  { value: 'asesoria',             label: 'Asesoría' },
  { value: 'fonoaudiologia',       label: 'Fonoaudiología' },
  { value: 'otorrinolaringologia', label: 'Otorrinolaringología' },
]

export const ROLES = {
  resource:     { label: 'Recurso',             color: 'green' },
  coordinador: { label: 'Coordinador',         color: 'blue' },
  directivo:   { label: 'Directivo',           color: 'purple' },
  supervisor:  { label: 'Supervisor',          color: 'amber' },
  gerencia:    { label: 'Gerencia',            color: 'red' },
}

// Rotativos / agenda intensa: solo 30 min de almuerzo (versus 60 min del resto).
// Mantiene paridad con backend/src/services/asignacionService.js ALMUERZO_CORTO.
const ALMUERZO_CORTO_TIPOS = new Set(['oftalmologo', 'anestesiologo', 'optometra', 'fonoaudiologa', 'otorrino'])

// Regla operativa v4 (jul-2026): descuenta almuerzo si dura ≥ 6h, EXCEPTO
// técnicos con turnos partidos de ayudas diagnósticas (07:00-13:00 exactos
// o 13:00-19:00 exactos) — esos van corridos sin descuento.
// Sincronizar con backend/src/lib/horarios.js minutosAlmuerzo.
export const debeDescontarAlmuerzo = (totalMin, inicioMin, finMin, tipoRecurso = null) => {
  if (totalMin < 360) return false
  if (tipoRecurso === 'tecnico') {
    const esMatutinoCorrido  = inicioMin === 420 && finMin === 780     // 07:00-13:00
    const esVespertinoCorrido = inicioMin === 780 && finMin === 1140   // 13:00-19:00
    if (esMatutinoCorrido || esVespertinoCorrido) return false
  }
  return true
}

export const calcularCapacidadPacientes = (horaInicio, horaFin, intervaloMinutos, tipoRecurso = null) => {
  // PROYECTOS-3255 · Los asesores de servicios NO atienden pacientes con cita
  // (hacen recepcion / gestion), por lo que el numero de pacientes no aplica.
  // Devolver 0 aqui hace que el badge "N pac." no se muestre en el AsignacionModal
  // ni en el resto de vistas que consumen esta funcion (grid del programador,
  // resumen diario, PDF de horarios semanales).
  if (tipoRecurso === 'asesor_servicios') return 0
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFin.split(':').map(Number)
  const inicioMin = hI * 60 + mI
  const finMin = hF * 60 + mF
  const totalMin = finMin - inicioMin
  if (totalMin <= 0) return 0
  const minAlmuerzo = ALMUERZO_CORTO_TIPOS.has(tipoRecurso) ? 30 : 60
  const descuenta = debeDescontarAlmuerzo(totalMin, inicioMin, finMin, tipoRecurso)
  const jornada = descuenta ? totalMin - minAlmuerzo : totalMin
  return Math.floor(jornada / (intervaloMinutos || 15))
}

export const semanaLabel = (fechaInicio) => {
  if (!fechaInicio) return ''
  const d = typeof fechaInicio === 'string' ? parseISO(fechaInicio) : fechaInicio
  const fin = addDays(d, 6)
  return `${format(d, 'd MMM', { locale: es })} – ${format(fin, 'd MMM yyyy', { locale: es })}`
}

export const diasDeSemana = (fechaInicio) => {
  const d = typeof fechaInicio === 'string' ? parseISO(fechaInicio) : fechaInicio
  return Array.from({ length: 7 }, (_, i) => addDays(d, i))
}

export const colorPorTipo = (tipo) => {
  const mapa = {
    oftalmologo:   'teal',
    optometra:     'purple',
    anestesiologo: 'blue',
    assistant:      'green',
    tecnico:       'gray',
    fonoaudiologa: 'pink',
    otorrino:      'orange',
  }
  return mapa[tipo] ?? 'gray'
}

export const semaforo = (pct, metaVerde = 80) => {
  if (pct >= metaVerde) return 'g'
  if (pct >= metaVerde - 10) return 'a'
  return 'r'
}

export const formatHoras = (h) => {
  if (h === null || h === undefined) return '—'
  return `${Math.round(h * 10) / 10}h`
}

export const formatPct = (v) => `${Math.round(v)}%`

export const formatCOP = (v) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)

export const initials = (nombre = '') =>
  nombre.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()

export const clsx = (...args) => args.filter(Boolean).join(' ')

// Normaliza texto para búsqueda tolerante a mayúsculas y acentos.
// "María José" y "maria jose" hacen match; también "Muñoz" contra "munoz".
// El rango ̀-ͯ cubre los "combining diacritical marks" — se generan
// tras `normalize('NFD')` al separar la letra base del acento.
export const normalizarTexto = (s) => {
  if (s === null || s === undefined) return ''
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const PALABRAS_MINUSCULA = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'al', 'en'])

/**
 * Normaliza textos heterogéneos (TODO MAYÚSCULAS, todo minúscula, mezcla)
 * a Title Case: "Karen Rossana Romero Pinto", "Consultorio 31 — Consulta Catarata".
 * Mantiene conectores en minúscula ("Consulta de Glaucoma") y respeta tildes.
 * Separa por whitespace, `_` y `-` para nombres como "asesor_servicios".
 */
export const titleCase = (str) => {
  if (str === null || str === undefined) return str
  if (typeof str !== 'string') return str
  return str
    .toLowerCase()
    .split(/(\s+|[_-])/)
    .map((w, i) => {
      if (!w || /^\s+$/.test(w) || w === '_' || w === '-') return w === '_' ? ' ' : w
      if (i > 0 && PALABRAS_MINUSCULA.has(w)) return w
      if (/^\d+$/.test(w)) return w
      return w[0].toLocaleUpperCase('es-CO') + w.slice(1)
    })
    .join('')
}

/**
 * Compara dos strings con orden natural ("CONSULTORIO 2" antes que "CONSULTORIO 10").
 * Usar como callback de Array.prototype.sort.
 */
export const compareNatural = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' })

/**
 * Descarga un CSV en el navegador a partir de filas y un nombre de archivo.
 * Excel y LibreOffice lo abren nativo. Soporta strings con comas/saltos vía
 * quoting RFC 4180 y prepende BOM UTF-8 para que Excel respete tildes/eñes.
 *
 * @param {string} filename - sin extensión; el helper agrega .csv
 * @param {string[]} headers - títulos de las columnas
 * @param {Array<Array<string|number>>} rows - una fila por sub-array
 */
export const descargarCSV = (filename, headers, rows) => {
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linea = (arr) => arr.map(escape).join(';')
  const contenido = '﻿' + [linea(headers), ...rows.map(linea)].join('\r\n')
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
