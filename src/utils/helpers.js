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

// Oct-2026 · EL TIPO DE AUSENCIA, EN DOS NIVELES
//
// Hector, revisando en local: "cuando yo presione uno me aparezca otro select
// desglosando cuales son de cada uno". Primero se elige si la ausencia es
// remunerada o no, y eso recorta el segundo select.
//
// El reparto vive AQUI y en un solo sitio, porque es una regla de nomina y va
// a cambiar: mover un tipo de grupo es mover una linea. Los valores son los
// del enum que ya valida el backend, asi que esto no necesita migracion.
//
// PENDIENTE DE CONFIRMAR CON NOMINA: este reparto es una propuesta. 'otra'
// quedo en no remunerada porque es el caso sin respaldo documental; si en la
// practica se usa como cajon de sastre para cosas que si se pagan, hay que
// moverla o partirla en dos.
export const GRUPOS_TIPO_AUSENCIA = [
  {
    value: 'remunerada',
    label: 'Remunerada',
    descripcion: 'La clínica paga el tiempo no trabajado.',
    tipos: ['enfermedad', 'calamidad', 'familiar', 'academico', 'vacaciones', 'licencia_remunerada'],
  },
  {
    value: 'no_remunerada',
    label: 'No remunerada',
    descripcion: 'El tiempo no trabajado no se paga.',
    // 3650 · 'retraso_inicio' es un motivo del catálogo, no del enum. También
    // pendiente de confirmar con nómina si un retraso se paga.
    tipos: ['licencia_no_remunerada', 'no_presentacion', 'retraso_inicio', 'otra'],
  },
]

/** Motivo del catálogo que se registra por horas (debía empezar → empezó). */
export const MOTIVO_RETRASO = 'retraso_inicio'

/**
 * Los tipos de un grupo, listos para pintar en el segundo select.
 *
 * Si el catálogo de motivos tiene uno con el mismo código, mandan su id y su
 * nombre: así lo que el admin renombre desde Catálogos se ve aquí, y la
 * ausencia queda enlazada al motivo en vez de solo al enum.
 */
export function tiposDelGrupo(grupo, catalogo = []) {
  const g = GRUPOS_TIPO_AUSENCIA.find((x) => x.value === grupo)
  if (!g) return []
  // 22-oct · Hector: si es remunerado lo dice cada motivo del catálogo
  // (Configuración → Motivos de ausencia). Así un motivo nuevo sale solo en su
  // grupo. Lo fijo de abajo queda para cuando el catálogo no carga.
  const conMarca = catalogo.filter((m) => m.active !== false && typeof m.is_paid === 'boolean')
  if (conMarca.length) {
    const delCatalogo = conMarca
      .filter((m) => m.is_paid === (grupo === 'remunerada'))
      .map((m) => {
        const base = TIPOS_AUSENCIA.find((t) => t.value === m.code)
        return { id: m.id, value: base ? m.code : 'otra', code: m.code, label: m.name }
      })
    // Los tipos base del grupo que el catálogo no trae siguen saliendo: si
    // faltaran, el grupo podría quedar vacío y no se podría registrar nada.
    const codigos = new Set(conMarca.map((m) => m.code))
    const base = g.tipos
      .filter((code) => !codigos.has(code) && TIPOS_AUSENCIA.some((t) => t.value === code))
      .map((code) => ({ id: null, value: code, code, label: TIPOS_AUSENCIA.find((t) => t.value === code).label }))
    return [...delCatalogo, ...base]
  }
  return g.tipos.flatMap((code) => {
    const base = TIPOS_AUSENCIA.find((t) => t.value === code)
    const delCatalogo = catalogo.find((m) => m.code === code)
    // Un motivo que solo existe en el catálogo (no en el enum) viaja como
    // tipo 'otra' con su id: el backend lo enlaza por el id. Sin catálogo
    // cargado no se ofrece, porque no habría cómo enlazarlo.
    if (!base) {
      return delCatalogo ? [{ id: delCatalogo.id, value: 'otra', code, label: delCatalogo.name }] : []
    }
    return [{ id: delCatalogo?.id ?? null, value: code, code, label: delCatalogo?.name ?? base?.label ?? code }]
  })
}

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

/**
 * Tipos cuyo esquema de pago POR DEFECTO es "por paciente" (sin tope semanal).
 * Espejo de TIPOS_POR_PACIENTE en el backend (src/lib/resourceTypes.js).
 *
 * Es solo el DEFECTO que propone el formulario al elegir el tipo. La regla real
 * la marca el esquema de pago: `por_paciente` ⇔ sin tope semanal. Mezclar las
 * dos cosas fue lo que dejó 94 oftalmólogos en un estado del que la interfaz no
 * permitía salir.
 */
export const TIPOS_POR_PACIENTE = ['oftalmologo', 'fonoaudiologa', 'otorrino']

export const ESPECIALIDADES = [
  { value: 'oftalmologia',         label: 'Oftalmología' },
  { value: 'optometria',           label: 'Optometría' },
  { value: 'anestesiologia',       label: 'Anestesiología' },
  { value: 'diagnostico',          label: 'Diagnóstico' },
  { value: 'asesoria',             label: 'Asesoría' },
  { value: 'fonoaudiologia',       label: 'Fonoaudiología' },
  { value: 'otorrinolaringologia', label: 'Otorrinolaringología' },
]

/**
 * APOYO EN CONSULTORIO — espejo de ESPECIALIDADES_EXIGEN_APOYO /
 * ESPECIALIDADES_PERMITEN_APOYO en el backend (src/lib/timeSlots.js).
 *
 * EXIGEN: la auxiliar es obligatoria, el profesional no atiende solo.
 * PERMITEN: admiten apoyo. Diagnóstico solo permite, y ahí el apoyo es OTRO
 * TÉCNICO, no una auxiliar.
 *
 * Sep-2026 · se agrega 'otorrinolaringologia'. Estaba en las tres listas de
 * apoyo que había copiadas a mano (dos en AssignmentModal, una en AdminSitesPage)
 * pero en ninguna figuraba, así que el modal de asignación no mostraba el campo
 * de auxiliar y la ficha del consultorio decía "Requiere auxiliar: No" — cuando
 * el backend ya los creaba con `requiere_auxiliar = true` desde jul-2026.
 */
export const ESPECIALIDADES_EXIGEN_APOYO = ['oftalmologia', 'anestesiologia', 'otorrinolaringologia']
export const ESPECIALIDADES_PERMITEN_APOYO = [...ESPECIALIDADES_EXIGEN_APOYO, 'diagnostico']

/**
 * GRUPOS DE PERSONAL — las tarjetas de Gestión de ausencias.
 *
 * El módulo se entra por una pantalla de tarjetas, una por grupo, y dentro de
 * cada una van las ausencias de ese personal. Sep-2026, definido con Hector.
 *
 * Cubren los 8 tipos de recurso sin dejar ninguno fuera; si se agrega un tipo
 * nuevo hay que meterlo aquí o sus ausencias no aparecerían en ninguna tarjeta.
 * Por eso `tiposSinGrupo()` existe: la pantalla avisa en vez de esconderlas.
 *
 * Los asesores no atienden pacientes, así que sus ausencias no generan impacto
 * ni reposición — su tarjeta es más simple que las otras tres.
 */
export const GRUPOS_AUSENCIAS = [
  {
    key: 'profesionales',
    label: 'Profesionales',
    descripcion: 'Oftalmología, optometría, anestesiología, otorrino y fonoaudiología',
    icono: '🩺',
    color: 'teal',
    tipos: ['oftalmologo', 'optometra', 'anestesiologo', 'otorrino', 'fonoaudiologa'],
  },
  {
    key: 'auxiliares',
    label: 'Auxiliares',
    descripcion: 'Auxiliares de enfermería',
    icono: '💉',
    color: 'green',
    tipos: ['auxiliar'],
  },
  {
    key: 'tecnicos',
    label: 'Técnicos',
    descripcion: 'Técnicos de métodos diagnósticos',
    icono: '🔬',
    color: 'gray',
    tipos: ['tecnico'],
  },
  {
    key: 'asesores',
    label: 'Asesores',
    descripcion: 'Asesores de servicios — no atienden pacientes',
    icono: '💬',
    color: 'amber',
    tipos: ['asesor_servicios'],
  },
]

/**
 * Tipos con AGENDA PROPIA de pacientes. Espejo de TIPOS_QUE_IMPACTAN_PACIENTES
 * en el backend (src/services/absenceService.js).
 *
 * Solo la ausencia de estos deja pacientes sin atender, así que solo a ellos se
 * les muestra "Pacientes impactados" y "Costo de oportunidad". Una auxiliar
 * acompaña al médico pero no tiene agenda suya: atribuirle los pacientes de él
 * es contar dos veces el mismo daño.
 */
export const TIPOS_QUE_IMPACTAN_PACIENTES = [
  'oftalmologo', 'anestesiologo', 'otorrino', 'tecnico', 'fonoaudiologa', 'optometra',
]

/**
 * MULTI-CONSULTORIO — espejo de TIPOS_MULTI_CONSULTORIO en el backend
 * (src/lib/resourceTypes.js).
 *
 * El médico rota entre 2-3 consultorios y en cada uno hay una auxiliar
 * manejando la sala. Al activarlo, el programador permite asignaciones
 * simultáneas y cuenta las horas del día por UNIÓN DE INTERVALOS, no por suma.
 *
 * Oct-2026 · se agrega 'otorrino'. La regla estaba escrita a mano como
 * `type === 'oftalmologo'` acá y en tres sitios del backend, así que no había
 * forma de activarla para un otorrino: la casilla no se renderizaba.
 *
 * Solo vale para quien de verdad rota entre salas. Si atiende una sala a la
 * vez, la unión de intervalos le dejaría registrar horas que no trabajó.
 */
export const TIPOS_MULTI_CONSULTORIO = ['oftalmologo', 'otorrino']

/**
 * ¿Tiene subespecialidad? Espejo de TIPOS_CON_SUBESPECIALIDAD en el backend.
 *
 * El campo es TEXTO LIBRE, no una lista cerrada: el oftalmólogo escribe Retina
 * o Córnea, el otorrino escribiría Otología o Rinología. Lo único que cambia
 * por tipo es el ejemplo que sugiere el formulario.
 */
export const TIPOS_CON_SUBESPECIALIDAD = ['oftalmologo', 'otorrino']

/** Ejemplos de subespecialidad para el placeholder, según el tipo. */
export const EJEMPLO_SUBESPECIALIDAD = {
  oftalmologo: 'Ej: Retina, Córnea, Glaucoma',
  otorrino: 'Ej: Otología, Rinología, Laringología',
}

/**
 * ¿Necesita "intervalo por paciente"? Es el mismo conjunto que
 * TIPOS_QUE_IMPACTAN_PACIENTES, y no una lista aparte: el intervalo divide la
 * franja para calcular la capacidad de la agenda, así que lo necesita
 * exactamente quien tiene agenda propia.
 *
 * Oct-2026 · eran dos listas separadas y se desincronizaron. 'otorrino' estaba
 * en la de impacto pero faltaba en la del formulario, así que el campo no se
 * mostraba — y el formulario seguía enviando el valor por defecto. Cada
 * otorrino quedaba con 10 min por paciente que nadie eligió ni podía cambiar.
 */
export const requiereIntervaloPorPaciente = (tipo) => TIPOS_QUE_IMPACTAN_PACIENTES.includes(tipo)

/** Tipos de recurso que no quedaron en ninguna tarjeta. Debería ser vacío. */
export const tiposSinGrupo = () => {
  const cubiertos = new Set(GRUPOS_AUSENCIAS.flatMap((g) => g.tipos))
  return TIPOS_RECURSO.map((t) => t.value).filter((t) => !cubiertos.has(t))
}

export const ROLES = {
  recurso:     { label: 'Recurso',             color: 'green' },
  coordinador: { label: 'Coordinador',         color: 'blue' },
  directivo:   { label: 'Directivo',           color: 'purple' },
  supervisor:  { label: 'Supervisor',          color: 'amber' },
  gerencia:    { label: 'Gerencia',            color: 'red' },
  // Sep-2026 · Quien reprograma las agendas caídas por una ausencia. Hoy es una
  // sola persona. Ve únicamente ausencias de profesionales y su módulo de
  // reprogramaciones; el recorte real lo hace el backend, no esta pantalla.
  reprogramador: { label: 'Reprogramación',    color: 'teal' },
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
  return Math.floor(jornada / (intervaloMinutos || 10))
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

// PROYECTOS-3255 #3.2: etiquetas legibles para las familias de motivo (schema.prisma).
const FAMILIA_LABELS = {
  ausencia_profesional: 'Ausencia profesional',
  reprogramacion_operativa: 'Reprogramación operativa',
  ajuste_cupos: 'Ajuste de cupos',
  movilidad_regional: 'Movilidad regional',
  calendario_festivo: 'Calendario festivo',
  otros: 'Otros',
  sin_familia: 'Sin motivo',
}
export const formatFamiliaLabel = (v) => FAMILIA_LABELS[v] ?? titleCase(v ?? 'sin_familia')

/**
 * UTILIZACIÓN SEMANAL DE UN RECURSO — fuente única para la pantalla y sus KPIs.
 *
 * Existe porque los dos sitios que la calculaban no coincidían. Los KPIs de
 * cabecera dividían por `max_hours_per_week ?? 42` y las filas por
 * `max_effective_hours ?? max_hours_per_week ?? 42`: en una semana con festivo
 * el contador decía "3 por debajo del 60%" y en la lista solo 1 traía la
 * etiqueta, porque el tope ajustado por festivos no entraba en la cuenta de
 * arriba.
 *
 * Y el `?? 42` era peor de lo que parece: a quien cobra POR PACIENTE el backend
 * le deja `max_hours_per_week` en null a propósito — no tiene tope semanal. El
 * fallback le inventaba uno de 42 horas y lo medía contra él, que es la misma
 * confusión que dejó a 94 oftalmólogos en un estado del que no se salía. Para
 * ellos `aplica` sale en false y la pantalla muestra las horas sin porcentaje.
 */
export function utilizacionSemanal(r = {}) {
  const horas = r.assigned_hours ?? 0
  const sinTope = r.pay_scheme === 'por_paciente' || r.max_hours_per_week == null
  if (sinTope) {
    return { horas, tope: null, pct: null, aplica: false, ociosa: false, cerca: false, festivos: r.festivos_en_semana ?? 0 }
  }
  const topeNominal = r.max_hours_per_week
  const tope = r.max_effective_hours ?? topeNominal
  const pct = tope > 0 ? Math.min(100, Math.round((horas / tope) * 100)) : 0
  return {
    horas,
    tope,
    topeNominal,
    pct,
    aplica: true,
    ociosa: pct < 60,
    cerca: pct >= 90 && !r.is_overtime,
    festivos: r.festivos_en_semana ?? 0,
  }
}

/**
 * Los pacientes de un caso de reprogramación: el número REAL que puso la
 * líder, o el estimado del sistema si no lo ha puesto. Misma regla que
 * `pacientesDelCaso` en el servidor (src/lib/pacientesDelCaso.js): si cada
 * pantalla eligiera su número, una diría "faltan 12" y el servidor
 * rechazaría el 11.
 */
export const pacientesDelCaso = (a) => a?.patients_confirmed ?? a?.patients_affected ?? 0

/**
 * Cómo se nombra a quien cubre, según el tipo del ausente: "Cambiar de médico"
 * no tiene sentido en el caso de un técnico (Hector, 21-oct).
 */
export function palabraDelRecurso(tipo) {
  if (GRUPOS_AUSENCIAS.find((g) => g.key === 'profesionales')?.tipos.includes(tipo)) return 'médico'
  return { tecnico: 'técnico', auxiliar: 'auxiliar', asesor_servicios: 'asesor' }[tipo] ?? 'recurso'
}

/**
 * 21-oct · Hector: el coordinador registra la ausencia de un profesional pero
 * no la gestiona (eso es de la líder): solo ve el detalle. Igual que el
 * servidor (lib/resourceTypes `coordSoloVe`).
 */
export function coordSoloVe(rol, tipoRecurso) {
  return rol === 'coordinador' && !!GRUPOS_AUSENCIAS.find((g) => g.key === 'profesionales')?.tipos.includes(tipoRecurso)
}
