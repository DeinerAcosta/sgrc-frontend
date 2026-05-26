// Datos mock para modo demo (sin backend).
// Cuando se conecte el backend real, este archivo se conserva como referencia
// pero los services en api.js dejan de usarlo.

import { startOfWeek, addDays, format, subWeeks } from 'date-fns'

const today = new Date()
const semanaActualInicio = startOfWeek(today, { weekStartsOn: 1 })
const semanaAnteriorInicio = subWeeks(semanaActualInicio, 1)
const semanaSiguienteInicio = addDays(semanaActualInicio, 7)

const fmt = (d) => format(d, 'yyyy-MM-dd')

// ============ SEDES & CIUDADES ============
export const SEDES = [
  { id: 's1', nombre: 'Sede 1 Barranquilla', ciudad: 'Barranquilla', direccion: 'Cl. 76 #50-10', activa: true },
  { id: 's2', nombre: 'Sede 2 Barranquilla', ciudad: 'Barranquilla', direccion: 'Cra. 53 #80-32', activa: true },
  { id: 's3', nombre: 'Sede Santa Marta',    ciudad: 'Santa Marta',  direccion: 'Cl. 22 #4-30',  activa: true },
  { id: 's4', nombre: 'Sede Cartagena',      ciudad: 'Cartagena',    direccion: 'Av. San Martín', activa: true },
  { id: 's5', nombre: 'Sede Valledupar',     ciudad: 'Valledupar',   direccion: 'Cra. 19 #16-50', activa: true },
  { id: 's6', nombre: 'Sede Riohacha',       ciudad: 'Riohacha',     direccion: 'Cl. 15 #7-20',   activa: true },
  { id: 's7', nombre: 'Sede Sabanalarga',    ciudad: 'Sabanalarga',  direccion: 'Cl. 20 #19-15',  activa: true },
]

// ============ CONSULTORIOS (de la Sede 2 Barranquilla) ============
export const CONSULTORIOS = [
  { id: 'c1', sede_id: 's2', nombre: 'Cons. 6',  especialidad: 'oftalmologia',   requiere_auxiliar: true,  activo: true },
  { id: 'c2', sede_id: 's2', nombre: 'Cons. 9',  especialidad: 'oftalmologia',   requiere_auxiliar: true,  activo: true },
  { id: 'c3', sede_id: 's2', nombre: 'Cons. 13', especialidad: 'optometria',     requiere_auxiliar: false, activo: true },
  { id: 'c4', sede_id: 's2', nombre: 'Cons. 14', especialidad: 'optometria',     requiere_auxiliar: false, activo: true },
  { id: 'c5', sede_id: 's2', nombre: 'Cons. 1',  especialidad: 'diagnostico',    requiere_auxiliar: false, activo: true },
  { id: 'c6', sede_id: 's2', nombre: 'Cons. 2',  especialidad: 'anestesiologia', requiere_auxiliar: true,  activo: true },
]

// ============ RECURSOS ============
export const RECURSOS = [
  // Oftalmólogos
  { id: 'r1', nombre: 'Dr. Rhenals',      tipo: 'oftalmologo',   especialidad: 'Retina',         intervalo_minutos: 20, esquema_pago: 'por_paciente', horas_max_semana: 60, horas_max_dia: 12, activo: true, horas_asignadas: 30 },
  { id: 'r2', nombre: 'Dr. Martínez',     tipo: 'oftalmologo',   especialidad: 'Retina',         intervalo_minutos: 20, esquema_pago: 'por_paciente', horas_max_semana: 60, horas_max_dia: 12, activo: true, horas_asignadas: 4 },
  { id: 'r3', nombre: 'Dr. Córnea',       tipo: 'oftalmologo',   especialidad: 'Córnea',         intervalo_minutos: 20, esquema_pago: 'por_paciente', horas_max_semana: 60, horas_max_dia: 12, activo: true, horas_asignadas: 3 },
  // Optómetras
  { id: 'r4', nombre: 'Dr. Gutierrez',    tipo: 'optometra',     especialidad: 'General',        intervalo_minutos: 15, esquema_pago: 'mixto',        horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 36 },
  { id: 'r5', nombre: 'Dr. Escudero',     tipo: 'optometra',     especialidad: 'General',        intervalo_minutos: 15, esquema_pago: 'mixto',        horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 36 },
  // Anestesiólogo
  { id: 'r6', nombre: 'Dr. Pérez',        tipo: 'anestesiologo', especialidad: 'Anestesia',      intervalo_minutos: 30, esquema_pago: 'por_paciente', horas_max_semana: 60, horas_max_dia: 12, activo: true, horas_asignadas: 0 },
  // Auxiliares
  { id: 'r7',  nombre: 'Angela Sarmiento',     tipo: 'auxiliar', intervalo_minutos: null, esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 39, sede_id: 's2' },
  { id: 'r8',  nombre: 'Alba Tete',            tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 42, sede_id: 's2' },
  { id: 'r9',  nombre: 'Ana Castillo',         tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 42, sede_id: 's2' },
  { id: 'r10', nombre: 'Ana Nuñez',            tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 5,  sede_id: 's2' },
  { id: 'r11', nombre: 'Cynthia Maury',        tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 42.5, es_horas_extras: true, sede_id: 's2' },
  { id: 'r12', nombre: 'Darleis Silva',        tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 36, sede_id: 's2', estado_badge: 'liberada' },
  { id: 'r13', nombre: 'Yasiris Trespalacios', tipo: 'auxiliar', esquema_pago: 'fijo', horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 0,  sede_id: 's2' },
  // Técnicos
  { id: 'r14', nombre: 'Tec. Rivera',          tipo: 'tecnico',  esquema_pago: 'fijo', intervalo_minutos: 30, horas_max_semana: 42, horas_max_dia: 10, activo: true, horas_asignadas: 24, sede_id: 's2' },
]

// ============ USUARIOS ============
export const USUARIOS = {
  recurso: {
    id: 'u1',
    nombre: 'Angela Sarmiento',
    email: 'angela.sarmiento@cofca.co',
    rol: 'recurso',
    recurso_id: 'r7',
    tipo: 'auxiliar',
    especialidad: 'Auxiliar de enfermería',
    horas_max_semana: 42,
    sedes: ['s2'],
    sedes_nombres: ['Sede 2 Barranquilla'],
  },
  coordinador: {
    id: 'u2',
    nombre: 'María López',
    email: 'maria.lopez@cofca.co',
    rol: 'coordinador',
    sedes: ['s2'],
    sedes_nombres: ['Sede 2 Barranquilla'],
  },
  directivo: {
    id: 'u3',
    nombre: 'Carlos Reyes',
    email: 'carlos.reyes@cofca.co',
    rol: 'directivo',
    sedes: SEDES.map((s) => s.id),
    sedes_nombres: SEDES.map((s) => s.nombre),
  },
  supervisor: {
    id: 'u4',
    nombre: 'Diana Martínez',
    email: 'desarrollo@cofca.com',
    rol: 'supervisor',
    sedes: SEDES.map((s) => s.id),
    sedes_nombres: SEDES.map((s) => s.nombre),
  },
}

// ============ SEMANAS ============
export const SEMANAS = [
  { id: 'sem-prev', fecha_inicio: fmt(semanaAnteriorInicio), fecha_fin: fmt(addDays(semanaAnteriorInicio, 6)), estado: 'cerrada' },
  { id: 'sem-actual', fecha_inicio: fmt(semanaActualInicio), fecha_fin: fmt(addDays(semanaActualInicio, 6)), estado: 'abierta' },
  { id: 'sem-next', fecha_inicio: fmt(semanaSiguienteInicio), fecha_fin: fmt(addDays(semanaSiguienteInicio, 6)), estado: 'abierta' },
]

// ============ ASIGNACIONES de la semana actual ============
const recursoById = (id) => RECURSOS.find((r) => r.id === id)
const consById = (id) => CONSULTORIOS.find((c) => c.id === id)

const _mkAsig = (id, semanaId, consultorioId, dia, hi, hf, recursoId, auxId, capacidad, extras = false, reemplazo = false) => ({
  id,
  semana_id: semanaId,
  consultorio_id: consultorioId,
  consultorio: consById(consultorioId),
  dia_semana: dia,
  hora_inicio: hi,
  hora_fin: hf,
  recurso_id: recursoId,
  recurso: recursoById(recursoId),
  recurso_principal: recursoById(recursoId),
  auxiliar_id: auxId,
  auxiliar: auxId ? recursoById(auxId) : null,
  pacientes_capacidad: capacidad,
  es_horas_extras: extras,
  es_reemplazo: reemplazo,
  horas: ((parseInt(hf.split(':')[0]) * 60 + parseInt(hf.split(':')[1])) - (parseInt(hi.split(':')[0]) * 60 + parseInt(hi.split(':')[1]))) / 60,
})

export const ASIGNACIONES = [
  // Cons. 6 (oftalmología, retina) - Lunes
  _mkAsig('a1', 'sem-actual', 'c1', 'lunes',   '07:00', '13:00', 'r1', 'r7', 18),
  _mkAsig('a2', 'sem-actual', 'c1', 'lunes',   '14:00', '17:00', 'r3', null,  9),
  _mkAsig('a3', 'sem-actual', 'c1', 'martes',  '07:00', '13:00', 'r1', 'r8', 18),
  _mkAsig('a4', 'sem-actual', 'c1', 'miercoles','07:00', '11:00', 'r2', 'r9', 12),
  _mkAsig('a5', 'sem-actual', 'c1', 'jueves',  '07:00', '13:00', 'r1', 'r7', 18),
  _mkAsig('a6', 'sem-actual', 'c1', 'viernes', '07:00', '13:00', 'r1', 'r7', 18),

  // Cons. 13 (optometría)
  _mkAsig('a10', 'sem-actual', 'c3', 'lunes',     '07:00', '19:00', 'r4', null, 44),
  _mkAsig('a11', 'sem-actual', 'c3', 'martes',    '07:00', '19:00', 'r4', null, 44),
  _mkAsig('a12', 'sem-actual', 'c3', 'miercoles', '07:00', '19:00', 'r5', null, 44),
  _mkAsig('a13', 'sem-actual', 'c3', 'jueves',    '07:00', '19:00', 'r4', null, 44),
  _mkAsig('a14', 'sem-actual', 'c3', 'viernes',   '07:00', '19:00', 'r5', null, 44),

  // Cons. 14 (optometría) - martes sin cubrir (ausencia)
  _mkAsig('a20', 'sem-actual', 'c4', 'lunes',     '07:00', '19:00', 'r5', null, 44),
  _mkAsig('a21', 'sem-actual', 'c4', 'miercoles', '07:00', '19:00', 'r5', null, 44),
  _mkAsig('a22', 'sem-actual', 'c4', 'jueves',    '07:00', '19:00', 'r5', null, 44),
  _mkAsig('a23', 'sem-actual', 'c4', 'viernes',   '07:00', '19:00', 'r5', null, 44),

  // Cons. 1 (diagnóstico)
  _mkAsig('a30', 'sem-actual', 'c5', 'miercoles', '07:00', '19:00', 'r14', null, 22),
  _mkAsig('a31', 'sem-actual', 'c5', 'viernes',   '07:00', '19:00', 'r14', null, 22),
]

// ============ AUSENCIAS ============
export const AUSENCIAS = [
  {
    id: 'au1', recurso_id: 'r5', recurso: recursoById('r5'),
    fecha_inicio: fmt(addDays(semanaActualInicio, 1)), fecha_fin: fmt(addDays(semanaActualInicio, 1)),
    tipo: 'no_presentacion', motivo: 'No se presentó al consultorio',
    pacientes_impactados: 27, costo_oportunidad: 4050000,
    estado: 'pendiente', es_programada: false, anticipacion_dias: 0,
    reportado_por: 'u2', reportado_en: new Date().toISOString(),
  },
  {
    id: 'au2', recurso_id: 'r13', recurso: recursoById('r13'),
    fecha_inicio: fmt(semanaActualInicio), fecha_fin: fmt(addDays(semanaActualInicio, 1)),
    tipo: 'enfermedad', motivo: 'Incapacidad médica',
    pacientes_impactados: 34, costo_oportunidad: 1700000,
    estado: 'pendiente', es_programada: false, anticipacion_dias: 0,
    reportado_por: 'u2', reportado_en: new Date().toISOString(),
  },
  {
    id: 'au3', recurso_id: 'r10', recurso: recursoById('r10'),
    fecha_inicio: fmt(addDays(semanaActualInicio, 4)), fecha_fin: fmt(addDays(semanaActualInicio, 4)),
    tipo: 'familiar', motivo: 'Evento familiar',
    pacientes_impactados: 0, costo_oportunidad: 0,
    estado: 'pendiente', es_programada: true, anticipacion_dias: 4,
    reportado_por: 'u1', reportado_en: new Date().toISOString(),
  },
  {
    id: 'au4', recurso_id: 'r12', recurso: recursoById('r12'),
    fecha_inicio: fmt(addDays(semanaAnteriorInicio, 0)), fecha_fin: fmt(addDays(semanaAnteriorInicio, 6)),
    tipo: 'vacaciones', motivo: 'Vacaciones programadas',
    pacientes_impactados: 42, costo_oportunidad: 2100000,
    estado: 'confirmada', es_programada: true, anticipacion_dias: 35,
    reportado_por: 'u1', confirmado_por: 'u2', reportado_en: new Date().toISOString(),
  },
]

// ============ NOTIFICACIONES ============
export const NOTIFICACIONES = [
  { id: 'n1', tipo: 'ausencia_reportada', titulo: 'Ausencia sin confirmar — Dr. Escudero', mensaje: 'Martes 12 mayo · 27 pacientes impactados', canal: 'app', leida: false, creada_en: new Date().toISOString() },
  { id: 'n2', tipo: 'horas_ociosas',      titulo: 'Ana Nuñez · 5h disponibles sin asignar', mensaje: 'Costo fijo ocioso esta semana', canal: 'app', leida: false, creada_en: new Date().toISOString() },
  { id: 'n3', tipo: 'horas_limite',       titulo: 'Cynthia Maury supera 42h semanales',    mensaje: '+0.5h extras registradas', canal: 'app', leida: false, creada_en: new Date().toISOString() },
  { id: 'n4', tipo: 'asignacion_cambiada', titulo: 'Programación semana 11-16 actualizada', mensaje: 'Supervisor modificó Cons. 14 miércoles', canal: 'app', leida: true, creada_en: new Date().toISOString() },
]

// ============ TAREAS DE BACKOFFICE ============
export const TAREAS_BACKOFFICE = [
  { id: 't1', nombre: 'Confirmación de citas', tiempo_estimado_minutos: 5, activa: true },
  { id: 't2', nombre: 'Generación de autorizaciones', tiempo_estimado_minutos: 10, activa: true },
  { id: 't3', nombre: 'Llamadas de seguimiento postoperatorio', tiempo_estimado_minutos: 8, activa: true },
  { id: 't4', nombre: 'Archivo y digitalización', tiempo_estimado_minutos: 3, activa: true },
]

// ============ INFORMES (filas pre-calculadas) ============
// IMPORTANTE: el orden de las claves debe coincidir con cfg.cols en InformePage.
// El último campo (pct_*) se usa para el semáforo.

export const INFORME_OCUPACION = [
  { consultorio: 'Cons. 6',  sede: 'Barranquilla S2', especialidad: 'Retina',     h_asignadas: 60, h_base: 72, pct_ocupacion: 83 },
  { consultorio: 'Cons. 13', sede: 'Barranquilla S2', especialidad: 'Optometría', h_asignadas: 70, h_base: 72, pct_ocupacion: 97 },
  { consultorio: 'Cons. 14', sede: 'Barranquilla S2', especialidad: 'Optometría', h_asignadas: 60, h_base: 72, pct_ocupacion: 83 },
  { consultorio: 'Cons. 1',  sede: 'Barranquilla S2', especialidad: 'Ecografía',  h_asignadas: 24, h_base: 72, pct_ocupacion: 33 },
  { consultorio: 'Cons. 2',  sede: 'Santa Marta',     especialidad: 'Retina',     h_asignadas: 72, h_base: 72, pct_ocupacion: 100 },
  { consultorio: 'Cons. 5',  sede: 'Sabanalarga',     especialidad: 'Optometría', h_asignadas: 44, h_base: 72, pct_ocupacion: 61 },
]

export const INFORME_PRODUCTIVIDAD = [
  { recurso: 'Dr. Rhenals',   tipo: 'Oftalmólogo', sede: 'BQ S2', h_prog: 36, h_ejec: 36, pac_prog: 108, pac_at: 105, pct_cumplimiento: 97 },
  { recurso: 'Dr. Gutierrez', tipo: 'Optómetra',   sede: 'BQ S2', h_prog: 60, h_ejec: 60, pac_prog: 110, pac_at: 110, pct_cumplimiento: 100 },
  { recurso: 'Dr. Escudero',  tipo: 'Optómetra',   sede: 'BQ S2', h_prog: 54, h_ejec: 48, pac_prog: 99,  pac_at: 80,  pct_cumplimiento: 81 },
  { recurso: 'Alba Tete',     tipo: 'Auxiliar',    sede: 'BQ S2', h_prog: 42, h_ejec: 42, pac_prog: '—', pac_at: '—', pct_cumplimiento: 100 },
]

export const INFORME_AUSENTISMO = [
  { recurso: 'Doraine Barrios',      tipo: 'Auxiliar',  sede: 'BQ S2',       ausencias: 3, dias: 7, pac_afectados: 89, costo: 4450000, quejas: 2 },
  { recurso: 'Yasiris Trespalacios', tipo: 'Auxiliar',  sede: 'BQ S2',       ausencias: 2, dias: 4, pac_afectados: 68, costo: 3400000, quejas: 3 },
  { recurso: 'Dr. Escudero',         tipo: 'Optómetra', sede: 'BQ S2',       ausencias: 1, dias: 1, pac_afectados: 27, costo: 4050000, quejas: 1 },
  { recurso: 'Yurley Pua',           tipo: 'Auxiliar',  sede: 'Sabanalarga', ausencias: 1, dias: 1, pac_afectados: 11, costo: 550000,  quejas: 0 },
]

export const INFORME_SUBUTILIZACION = [
  { recurso: 'Ana Nuñez',    tipo: 'Auxiliar',  sede: 'BQ S2',       h_asignadas: 5,  h_disponibles: 42, pct_utilizacion: 12, sem_consec: 2 },
  { recurso: 'Betty Meza',   tipo: 'Optómetra', sede: 'Santa Marta', h_asignadas: 30, h_disponibles: 42, pct_utilizacion: 71, sem_consec: 1 },
  { recurso: 'Lina Torres',  tipo: 'Auxiliar',  sede: 'Riohacha',    h_asignadas: 32, h_disponibles: 42, pct_utilizacion: 76, sem_consec: 1 },
  { recurso: 'Carlos Díaz',  tipo: 'Técnico',   sede: 'Valledupar',  h_asignadas: 40, h_disponibles: 42, pct_utilizacion: 95, sem_consec: 0 },
]

export const INFORME_IMPACTO = [
  { recurso: 'Yasiris Trespalacios', fecha: '11 may 2026', tipo: 'Enfermedad',     pac_afectados: 34, costo_oport: 5100000, costo_personal: 700000,  costo_reprog: 200000, total: 6000000 },
  { recurso: 'Doraine Barrios',      fecha: '8 may 2026',  tipo: 'Vacaciones',     pac_afectados: 42, costo_oport: 6300000, costo_personal: 0,       costo_reprog: 100000, total: 6400000 },
  { recurso: 'Dr. Escudero',         fecha: '12 may 2026', tipo: 'No presentación', pac_afectados: 27, costo_oport: 4050000, costo_personal: 0,       costo_reprog: 80000,  total: 4130000 },
]

// ============ DASHBOARD DIRECTIVO ============
export const DASH_DIRECTIVO = {
  pacientes_programados: 4218,
  delta_pacientes: 6.2,
  impactados_ausencias: 87,
  delta_impactados: 12,
  recursos_ociosos: 3,
  ocupacion_global: 94,
  meta_ocupacion: 80,
  sedes_ocupacion: [
    { nombre: 'Barranquilla S2', pct: 97 },
    { nombre: 'Barranquilla S1', pct: 91 },
    { nombre: 'Riohacha',        pct: 88 },
    { nombre: 'Valledupar',      pct: 82 },
    { nombre: 'Santa Marta',     pct: 75 },
    { nombre: 'Sabanalarga',     pct: 62 },
  ],
  ausencias_activas: [
    { nombre: 'Yasiris Trespalacios', sede: 'Barranquilla S2', pacientes: 34, costo: 5200000 },
    { nombre: 'Doraine Barrios',      sede: 'Barranquilla S2', pacientes: 42, costo: 6400000 },
    { nombre: 'Yurley Pua',           sede: 'Sabanalarga',     pacientes: 11, costo: 1650000 },
  ],
  costo_total_ausentismo: 13250000,
}

// ============ FESTIVOS COLOMBIANOS (RN-06) ============
export const FESTIVOS_2026 = [
  { fecha: '2026-01-01', descripcion: 'Año Nuevo' },
  { fecha: '2026-01-12', descripcion: 'Día de los Reyes Magos' },
  { fecha: '2026-03-23', descripcion: 'Día de San José' },
  { fecha: '2026-04-02', descripcion: 'Jueves Santo' },
  { fecha: '2026-04-03', descripcion: 'Viernes Santo' },
  { fecha: '2026-05-01', descripcion: 'Día del Trabajo' },
  { fecha: '2026-05-18', descripcion: 'Día de la Ascensión' },
  { fecha: '2026-06-08', descripcion: 'Corpus Christi' },
  { fecha: '2026-06-15', descripcion: 'Sagrado Corazón' },
  { fecha: '2026-06-29', descripcion: 'San Pedro y San Pablo' },
  { fecha: '2026-07-20', descripcion: 'Día de la Independencia' },
  { fecha: '2026-08-07', descripcion: 'Batalla de Boyacá' },
  { fecha: '2026-08-17', descripcion: 'Asunción de la Virgen' },
  { fecha: '2026-10-12', descripcion: 'Día de la Raza' },
  { fecha: '2026-11-02', descripcion: 'Todos los Santos' },
  { fecha: '2026-11-16', descripcion: 'Independencia de Cartagena' },
  { fecha: '2026-12-08', descripcion: 'Día de la Inmaculada Concepción' },
  { fecha: '2026-12-25', descripcion: 'Navidad' },
]

// ============ PARÁMETROS DE COSTO (RN spec — versionados) ============
export const PARAMETROS_COSTO = [
  { id: 'p1', tipo_consulta: 'oftalmologia',   costo_cita: 150000, costo_reprogramacion: 8000,  vigente_desde: '2026-01-01', configurado_por: 'u4' },
  { id: 'p2', tipo_consulta: 'optometria',     costo_cita: 50000,  costo_reprogramacion: 5000,  vigente_desde: '2026-01-01', configurado_por: 'u4' },
  { id: 'p3', tipo_consulta: 'anestesiologia', costo_cita: 250000, costo_reprogramacion: 12000, vigente_desde: '2026-01-01', configurado_por: 'u4' },
  { id: 'p4', tipo_consulta: 'diagnostico',    costo_cita: 80000,  costo_reprogramacion: 6000,  vigente_desde: '2026-01-01', configurado_por: 'u4' },
]

// ============ PARÁMETROS DEL SISTEMA (metas, semáforo, RN-30) ============
export const PARAMETROS_SISTEMA = {
  meta_ocupacion_consultorios: 80,
  meta_utilizacion_th: 90,
  meta_cumplimiento_ejecucion: 85,
  semaforo_umbral_naranja: 10, // verde si >= meta; naranja si meta-10 <= pct < meta; rojo si < meta-10
  base_horas_lun_vie_min: 720, // 12h
  base_horas_sabado_min: 240,  // 4h
}

// ============ EJECUCIONES (lo que el coordinador ya registró del lunes) ============
export const EJECUCIONES = [
  { id: 'e1', asignacion_id: 'a10', pacientes_atendidos: 44, estado_jornada: 'completa', registrado_en: new Date().toISOString(), bloqueado: false, observaciones: '' },
  { id: 'e2', asignacion_id: 'a20', pacientes_atendidos: 42, estado_jornada: 'parcial',  registrado_en: new Date().toISOString(), bloqueado: false, observaciones: 'Médico salió 30min antes' },
]

// ============ HISTORIAL AUSENCIAS DEL RECURSO (HU-R-06) ============
// Para el perfil "recurso" (Angela Sarmiento, u1 → r7)
export const HISTORIAL_AUSENCIAS_RECURSO = [
  { id: 'ha1', fecha_inicio: '2026-02-12', fecha_fin: '2026-02-12', tipo: 'enfermedad', motivo: 'Gripe', estado: 'confirmada', pacientes_impactados: 27 },
  { id: 'ha2', fecha_inicio: '2026-04-03', fecha_fin: '2026-04-03', tipo: 'academico',  motivo: 'Congreso de Enfermería', estado: 'confirmada', pacientes_impactados: 27 },
]

// ============ ESTADÍSTICAS DEL RECURSO (HU-R-08) ============
export const PRODUCTIVIDAD_RECURSO = {
  horas_semana_actual: 39,
  horas_mes: 156,
  pacientes_semana: 127,
  pacientes_mes: 498,
  incentivo_acumulado: null, // null si no es optómetra
  promedio_4_semanas: { horas: 41, pacientes: 132 },
  ultimas_4_semanas: [
    { semana: 'Sem -3', horas: 42, pacientes: 138 },
    { semana: 'Sem -2', horas: 40, pacientes: 128 },
    { semana: 'Sem -1', horas: 42, pacientes: 135 },
    { semana: 'Actual', horas: 39, pacientes: 127 },
  ],
}

// ============ ASIGNACIONES BACKOFFICE (auxiliar liberada → tarea admin) ============
export const ASIGNACIONES_BACKOFFICE = [
  {
    id: 'ab1',
    auxiliar_id: 'r12',       // Darleis Silva (liberada)
    auxiliar: recursoById('r12'),
    sede_id: 's2',
    sede: SEDES.find((s) => s.id === 's2'),
    tarea_backoffice_id: 't1',
    tarea: TAREAS_BACKOFFICE[0],
    dia: fmt(semanaActualInicio),
    hora_inicio: '07:00',
    hora_fin: '13:00',
    ausencia_origen_id: 'au1',
    asignado_por: 'u2',
  },
]

// ============ EJECUCIÓN BACKOFFICE ============
export const EJECUCION_BACKOFFICE = [
  {
    id: 'eb1',
    asignacion_backoffice_id: 'ab1',
    tarea_id: 't1',
    unidades_completadas: 45,
    tiempo_real_minutos: 240,
    observaciones: '45 confirmaciones de citas para la semana 19-25 mayo',
    registrado_en: new Date().toISOString(),
  },
]

// ============ USUARIOS COMPLETOS (para Admin de Supervisor — HU-S-02) ============
export const USUARIOS_LISTA = [
  { id: 'u1',  nombre: 'Angela Sarmiento', email: 'angela.sarmiento@cofca.co', celular: '300 555 0001', rol: 'recurso',     recurso_id: 'r7',  activo: true,  ultimo_login: '2026-05-12 08:30', sedes: ['s2'] },
  { id: 'u2',  nombre: 'María López',      email: 'maria.lopez@cofca.co',      celular: '300 555 0002', rol: 'coordinador', recurso_id: null,  activo: true,  ultimo_login: '2026-05-12 09:15', sedes: ['s2'] },
  { id: 'u3',  nombre: 'Carlos Reyes',     email: 'carlos.reyes@cofca.co',     celular: '300 555 0003', rol: 'directivo',   recurso_id: null,  activo: true,  ultimo_login: '2026-05-11 14:00', sedes: [] },
  { id: 'u4',  nombre: 'Diana Martínez',   email: 'desarrollo@cofca.com',      celular: '300 555 0004', rol: 'supervisor',  recurso_id: null,  activo: true,  ultimo_login: '2026-05-13 07:00', sedes: [] },
  { id: 'u5',  nombre: 'Dr. Rhenals',      email: 'rhenals@cofca.co',          celular: '300 555 0005', rol: 'recurso',     recurso_id: 'r1',  activo: true,  ultimo_login: '2026-05-11 17:45', sedes: ['s2'] },
  { id: 'u6',  nombre: 'Dr. Gutierrez',    email: 'gutierrez@cofca.co',        celular: '300 555 0006', rol: 'recurso',     recurso_id: 'r4',  activo: true,  ultimo_login: '2026-05-12 07:10', sedes: ['s2'] },
  { id: 'u7',  nombre: 'Alba Tete',        email: 'alba.tete@cofca.co',        celular: '300 555 0007', rol: 'recurso',     recurso_id: 'r8',  activo: true,  ultimo_login: '2026-05-12 06:50', sedes: ['s2'] },
  { id: 'u8',  nombre: 'Andrea Pérez',     email: 'andrea.perez@cofca.co',     celular: '300 555 0008', rol: 'coordinador', recurso_id: null,  activo: true,  ultimo_login: '2026-05-12 09:00', sedes: ['s1'] },
  { id: 'u9',  nombre: 'Luis Ramírez',     email: 'luis.ramirez@cofca.co',     celular: '300 555 0009', rol: 'coordinador', recurso_id: null,  activo: false, ultimo_login: '2026-04-22 12:00', sedes: ['s3'] },
]

// ============ AUDITORÍA (HU-S-05) ============
export const AUDITORIA = [
  { id: 'au-l1', usuario_id: 'u4', usuario_nombre: 'Diana Martínez', accion: 'modificar_semana_cerrada', entidad: 'semanas', entidad_id: 'sem-prev', motivo: 'Corrección de error de digitación en Cons. 6 viernes', ip_address: '186.84.x.x', creada_en: '2026-05-12 14:32:00' },
  { id: 'au-l2', usuario_id: 'u4', usuario_nombre: 'Diana Martínez', accion: 'cambiar_parametro_costo', entidad: 'parametros_costo', entidad_id: 'p1', motivo: 'Actualización trimestral de tarifas oftalmología', ip_address: '186.84.x.x', creada_en: '2026-05-10 10:15:00' },
  { id: 'au-l3', usuario_id: 'u2', usuario_nombre: 'María López', accion: 'registrar_ausencia_por_recurso', entidad: 'ausencias', entidad_id: 'au1', motivo: 'Recurso no se presentó y no reportó', ip_address: '190.45.x.x', creada_en: '2026-05-12 08:15:00' },
  { id: 'au-l4', usuario_id: 'u4', usuario_nombre: 'Diana Martínez', accion: 'crear_usuario', entidad: 'usuarios', entidad_id: 'u9', motivo: '', ip_address: '186.84.x.x', creada_en: '2026-04-15 09:00:00' },
  { id: 'au-l5', usuario_id: 'u3', usuario_nombre: 'Carlos Reyes', accion: 'exportar_informe', entidad: 'informes', entidad_id: 'productividad', motivo: '{ "formato": "pdf", "desde": "2026-04-01", "hasta": "2026-04-30" }', ip_address: '186.84.x.x', creada_en: '2026-05-01 16:45:00' },
  { id: 'au-l6', usuario_id: 'u4', usuario_nombre: 'Diana Martínez', accion: 'desactivar_usuario', entidad: 'usuarios', entidad_id: 'u9', motivo: 'Recurso finalizó contrato', ip_address: '186.84.x.x', creada_en: '2026-04-22 11:30:00' },
]

// ============ HORAS PROGRAMADAS VS EJECUTADAS (HU-D-08) ============
export const INFORME_HORAS_PROG_EJEC = [
  { sede: 'Barranquilla S2', semana: 'Sem 19', h_programadas: 280, h_ejecutadas: 274, diferencia: -6,  pct_cumplimiento: 98 },
  { sede: 'Barranquilla S1', semana: 'Sem 19', h_programadas: 220, h_ejecutadas: 210, diferencia: -10, pct_cumplimiento: 95 },
  { sede: 'Santa Marta',     semana: 'Sem 19', h_programadas: 180, h_ejecutadas: 148, diferencia: -32, pct_cumplimiento: 82 },
  { sede: 'Cartagena',       semana: 'Sem 19', h_programadas: 160, h_ejecutadas: 156, diferencia: -4,  pct_cumplimiento: 98 },
  { sede: 'Valledupar',      semana: 'Sem 19', h_programadas: 140, h_ejecutadas: 115, diferencia: -25, pct_cumplimiento: 82 },
  { sede: 'Riohacha',        semana: 'Sem 19', h_programadas: 120, h_ejecutadas: 106, diferencia: -14, pct_cumplimiento: 88 },
  { sede: 'Sabanalarga',     semana: 'Sem 19', h_programadas: 200, h_ejecutadas: 124, diferencia: -76, pct_cumplimiento: 62 },
]

// ============ COMPARATIVO SEMANAL (HU-D-06) ============
export const COMPARATIVO_SEMANAS = {
  semana_a: { label: 'Sem actual (11–17 may)', pacientes: 4218, horas_ejec: 1218, ocupacion: 94, ausencias: 4, costo_ausentismo: 13250000 },
  semana_b: { label: 'Sem anterior (4–10 may)', pacientes: 3970, horas_ejec: 1180, ocupacion: 89, ausencias: 3, costo_ausentismo: 10100000 },
  ultimas_12: Array.from({ length: 12 }, (_, i) => ({
    semana: `Sem -${11 - i}`,
    pacientes: 3500 + Math.round(Math.random() * 800),
    ocupacion: 75 + Math.round(Math.random() * 20),
    ausencias: 2 + Math.round(Math.random() * 5),
  })),
}
