import { format, startOfWeek, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
export const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
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
]

export const ROLES = {
  recurso:     { label: 'Recurso',             color: 'green' },
  coordinador: { label: 'Coordinador',         color: 'blue' },
  directivo:   { label: 'Directivo',           color: 'purple' },
  supervisor:  { label: 'Supervisor',          color: 'amber' },
}

export const calcularCapacidadPacientes = (horaInicio, horaFin, intervaloMinutos) => {
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFin.split(':').map(Number)
  const totalMin = (hF * 60 + mF) - (hI * 60 + mI)
  const jornada = totalMin >= 360 ? totalMin - 60 : totalMin
  return Math.floor(jornada / intervaloMinutos)
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
    auxiliar:      'green',
    tecnico:       'gray',
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
