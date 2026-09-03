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
  { id: 's1', name: 'Sede 1 Barranquilla', city: 'Barranquilla', address: 'Cl. 76 #50-10', active: true },
  { id: 's2', name: 'Sede 2 Barranquilla', city: 'Barranquilla', address: 'Cra. 53 #80-32', active: true },
  { id: 's3', name: 'Sede Santa Marta',    city: 'Santa Marta',  address: 'Cl. 22 #4-30',  active: true },
  { id: 's4', name: 'Sede Cartagena',      city: 'Cartagena',    address: 'Av. San Martín', active: true },
  { id: 's5', name: 'Sede Valledupar',     city: 'Valledupar',   address: 'Cra. 19 #16-50', active: true },
  { id: 's6', name: 'Sede Riohacha',       city: 'Riohacha',     address: 'Cl. 15 #7-20',   active: true },
  { id: 's7', name: 'Sede Sabanalarga',    city: 'Sabanalarga',  address: 'Cl. 20 #19-15',  active: true },
]

// ============ CONSULTORIOS (de la Sede 2 Barranquilla) ============
export const CONSULTORIOS = [
  { id: 'c1', site_id: 's2', name: 'Cons. 6',  specialty: 'oftalmologia',   requires_assistant: true,  active: true },
  { id: 'c2', site_id: 's2', name: 'Cons. 9',  specialty: 'oftalmologia',   requires_assistant: true,  active: true },
  { id: 'c3', site_id: 's2', name: 'Cons. 13', specialty: 'optometria',     requires_assistant: false, active: true },
  { id: 'c4', site_id: 's2', name: 'Cons. 14', specialty: 'optometria',     requires_assistant: false, active: true },
  { id: 'c5', site_id: 's2', name: 'Cons. 1',  specialty: 'diagnostico',    requires_assistant: false, active: true },
  { id: 'c6', site_id: 's2', name: 'Cons. 2',  specialty: 'anestesiologia', requires_assistant: true,  active: true },
]

// ============ RECURSOS ============
export const RECURSOS = [
  // Oftalmólogos
  { id: 'r1', name: 'Dr. Rhenals',      type: 'oftalmologo',   specialty: 'Retina',         slot_minutes: 20, pay_scheme: 'por_paciente', max_hours_per_week: 60, max_hours_per_day: 12, active: true, assigned_hours: 30 },
  { id: 'r2', name: 'Dr. Martínez',     type: 'oftalmologo',   specialty: 'Retina',         slot_minutes: 20, pay_scheme: 'por_paciente', max_hours_per_week: 60, max_hours_per_day: 12, active: true, assigned_hours: 4 },
  { id: 'r3', name: 'Dr. Córnea',       type: 'oftalmologo',   specialty: 'Córnea',         slot_minutes: 20, pay_scheme: 'por_paciente', max_hours_per_week: 60, max_hours_per_day: 12, active: true, assigned_hours: 3 },
  // Optómetras
  { id: 'r4', name: 'Dr. Gutierrez',    type: 'optometra',     specialty: 'General',        slot_minutes: 15, pay_scheme: 'mixto',        max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 36 },
  { id: 'r5', name: 'Dr. Escudero',     type: 'optometra',     specialty: 'General',        slot_minutes: 15, pay_scheme: 'mixto',        max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 36 },
  // Anestesiólogo
  { id: 'r6', name: 'Dr. Pérez',        type: 'anestesiologo', specialty: 'Anestesia',      slot_minutes: 30, pay_scheme: 'por_paciente', max_hours_per_week: 60, max_hours_per_day: 12, active: true, assigned_hours: 0 },
  // Auxiliares
  { id: 'r7',  name: 'Angela Sarmiento',     type: 'auxiliar', slot_minutes: null, pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 39, site_id: 's2' },
  { id: 'r8',  name: 'Alba Tete',            type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 42, site_id: 's2' },
  { id: 'r9',  name: 'Ana Castillo',         type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 42, site_id: 's2' },
  { id: 'r10', name: 'Ana Nuñez',            type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 5,  site_id: 's2' },
  { id: 'r11', name: 'Cynthia Maury',        type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 42.5, is_overtime: true, site_id: 's2' },
  { id: 'r12', name: 'Darleis Silva',        type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 36, site_id: 's2', status_badge: 'liberada' },
  { id: 'r13', name: 'Yasiris Trespalacios', type: 'auxiliar', pay_scheme: 'fijo', max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 0,  site_id: 's2' },
  // Técnicos
  { id: 'r14', name: 'Tec. Rivera',          type: 'tecnico',  pay_scheme: 'fijo', slot_minutes: 30, max_hours_per_week: 42, max_hours_per_day: 10, active: true, assigned_hours: 24, site_id: 's2' },
]

// ============ USUARIOS ============
export const USUARIOS = {
  resource: {
    id: 'u1',
    name: 'Angela Sarmiento',
    email: 'angela.sarmiento@cofca.co',
    role: 'recurso',
    resource_id: 'r7',
    type: 'auxiliar',
    specialty: 'Auxiliar de enfermería',
    max_hours_per_week: 42,
    sites: ['s2'],
    site_names: ['Sede 2 Barranquilla'],
  },
  coordinador: {
    id: 'u2',
    name: 'María López',
    email: 'maria.lopez@cofca.co',
    role: 'coordinador',
    sites: ['s2'],
    site_names: ['Sede 2 Barranquilla'],
  },
  directivo: {
    id: 'u3',
    name: 'Carlos Reyes',
    email: 'carlos.reyes@cofca.co',
    role: 'directivo',
    sites: SEDES.map((s) => s.id),
    site_names: SEDES.map((s) => s.name),
  },
  supervisor: {
    id: 'u4',
    name: 'Diana Martínez',
    email: 'desarrollo@cofca.com',
    role: 'supervisor',
    sites: SEDES.map((s) => s.id),
    site_names: SEDES.map((s) => s.name),
  },
}

// ============ SEMANAS ============
export const SEMANAS = [
  { id: 'sem-prev', start_date: fmt(semanaAnteriorInicio), end_date: fmt(addDays(semanaAnteriorInicio, 6)), status: 'cerrada' },
  { id: 'sem-actual', start_date: fmt(semanaActualInicio), end_date: fmt(addDays(semanaActualInicio, 6)), status: 'abierta' },
  { id: 'sem-next', start_date: fmt(semanaSiguienteInicio), end_date: fmt(addDays(semanaSiguienteInicio, 6)), status: 'abierta' },
]

// ============ ASIGNACIONES de la semana actual ============
const recursoById = (id) => RECURSOS.find((r) => r.id === id)
const consById = (id) => CONSULTORIOS.find((c) => c.id === id)

const _mkAsig = (id, semanaId, consultorioId, dia, hi, hf, recursoId, auxId, capacidad, extras = false, reemplazo = false) => ({
  id,
  week_id: semanaId,
  room_id: consultorioId,
  room: consById(consultorioId),
  weekday: dia,
  start_time: hi,
  end_time: hf,
  resource_id: recursoId,
  resource: recursoById(recursoId),
  recurso_principal: recursoById(recursoId),
  assistant_id: auxId,
  assistant: auxId ? recursoById(auxId) : null,
  patient_capacity: capacidad,
  is_overtime: extras,
  is_replacement: reemplazo,
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
    id: 'au1', resource_id: 'r5', resource: recursoById('r5'),
    start_date: fmt(addDays(semanaActualInicio, 1)), end_date: fmt(addDays(semanaActualInicio, 1)),
    type: 'no_presentacion', reason: 'No se presentó al consultorio',
    patients_affected: 27, opportunity_cost: 4050000,
    status: 'pendiente', is_planned: false, notice_days: 0,
    reported_by: 'u2', reported_at: new Date().toISOString(),
  },
  {
    id: 'au2', resource_id: 'r13', resource: recursoById('r13'),
    start_date: fmt(semanaActualInicio), end_date: fmt(addDays(semanaActualInicio, 1)),
    type: 'enfermedad', reason: 'Incapacidad médica',
    patients_affected: 34, opportunity_cost: 1700000,
    status: 'pendiente', is_planned: false, notice_days: 0,
    reported_by: 'u2', reported_at: new Date().toISOString(),
  },
  {
    id: 'au3', resource_id: 'r10', resource: recursoById('r10'),
    start_date: fmt(addDays(semanaActualInicio, 4)), end_date: fmt(addDays(semanaActualInicio, 4)),
    type: 'familiar', reason: 'Evento familiar',
    patients_affected: 0, opportunity_cost: 0,
    status: 'pendiente', is_planned: true, notice_days: 4,
    reported_by: 'u1', reported_at: new Date().toISOString(),
  },
  {
    id: 'au4', resource_id: 'r12', resource: recursoById('r12'),
    start_date: fmt(addDays(semanaAnteriorInicio, 0)), end_date: fmt(addDays(semanaAnteriorInicio, 6)),
    type: 'vacaciones', reason: 'Vacaciones programadas',
    patients_affected: 42, opportunity_cost: 2100000,
    status: 'confirmada', is_planned: true, notice_days: 35,
    reported_by: 'u1', confirmed_by: 'u2', reported_at: new Date().toISOString(),
  },
]

// ============ NOTIFICACIONES ============
export const NOTIFICACIONES = [
  { id: 'n1', type: 'ausencia_reportada', title: 'Ausencia sin confirmar — Dr. Escudero', message: 'Martes 12 mayo · 27 pacientes impactados', channel: 'app', read: false, created_at: new Date().toISOString() },
  { id: 'n2', type: 'horas_ociosas',      title: 'Ana Nuñez · 5h disponibles sin asignar', message: 'Costo fijo ocioso esta semana', channel: 'app', read: false, created_at: new Date().toISOString() },
  { id: 'n3', type: 'horas_limite',       title: 'Cynthia Maury supera 42h semanales',    message: '+0.5h extras registradas', channel: 'app', read: false, created_at: new Date().toISOString() },
  { id: 'n4', type: 'asignacion_cambiada', title: 'Programación semana 11-16 actualizada', message: 'Supervisor modificó Cons. 14 miércoles', channel: 'app', read: true, created_at: new Date().toISOString() },
]

// ============ TAREAS DE BACKOFFICE ============
export const TAREAS_BACKOFFICE = [
  { id: 't1', name: 'Confirmación de citas', estimated_minutes: 5, active: true },
  { id: 't2', name: 'Generación de autorizaciones', estimated_minutes: 10, active: true },
  { id: 't3', name: 'Llamadas de seguimiento postoperatorio', estimated_minutes: 8, active: true },
  { id: 't4', name: 'Archivo y digitalización', estimated_minutes: 3, active: true },
]

// ============ INFORMES (filas pre-calculadas) ============
// IMPORTANTE: el orden de las claves debe coincidir con cfg.cols en InformePage.
// El último campo (pct_*) se usa para el semáforo.

export const INFORME_OCUPACION = [
  { room: 'Cons. 6',  site: 'Barranquilla S2', specialty: 'Retina',     h_asignadas: 60, h_base: 72, pct_ocupacion: 83 },
  { room: 'Cons. 13', site: 'Barranquilla S2', specialty: 'Optometría', h_asignadas: 70, h_base: 72, pct_ocupacion: 97 },
  { room: 'Cons. 14', site: 'Barranquilla S2', specialty: 'Optometría', h_asignadas: 60, h_base: 72, pct_ocupacion: 83 },
  { room: 'Cons. 1',  site: 'Barranquilla S2', specialty: 'Ecografía',  h_asignadas: 24, h_base: 72, pct_ocupacion: 33 },
  { room: 'Cons. 2',  site: 'Santa Marta',     specialty: 'Retina',     h_asignadas: 72, h_base: 72, pct_ocupacion: 100 },
  { room: 'Cons. 5',  site: 'Sabanalarga',     specialty: 'Optometría', h_asignadas: 44, h_base: 72, pct_ocupacion: 61 },
]

export const INFORME_PRODUCTIVIDAD = [
  { resource: 'Dr. Rhenals',   type: 'Oftalmólogo', site: 'BQ S2', h_prog: 36, h_ejec: 36, pac_prog: 108, pac_at: 105, pct_cumplimiento: 97 },
  { resource: 'Dr. Gutierrez', type: 'Optómetra',   site: 'BQ S2', h_prog: 60, h_ejec: 60, pac_prog: 110, pac_at: 110, pct_cumplimiento: 100 },
  { resource: 'Dr. Escudero',  type: 'Optómetra',   site: 'BQ S2', h_prog: 54, h_ejec: 48, pac_prog: 99,  pac_at: 80,  pct_cumplimiento: 81 },
  { resource: 'Alba Tete',     type: 'Auxiliar',    site: 'BQ S2', h_prog: 42, h_ejec: 42, pac_prog: '—', pac_at: '—', pct_cumplimiento: 100 },
]

export const INFORME_AUSENTISMO = [
  { resource: 'Doraine Barrios',      type: 'Auxiliar',  site: 'BQ S2',       absences: 3, dias: 7, pac_afectados: 89, cost: 4450000, quejas: 2 },
  { resource: 'Yasiris Trespalacios', type: 'Auxiliar',  site: 'BQ S2',       absences: 2, dias: 4, pac_afectados: 68, cost: 3400000, quejas: 3 },
  { resource: 'Dr. Escudero',         type: 'Optómetra', site: 'BQ S2',       absences: 1, dias: 1, pac_afectados: 27, cost: 4050000, quejas: 1 },
  { resource: 'Yurley Pua',           type: 'Auxiliar',  site: 'Sabanalarga', absences: 1, dias: 1, pac_afectados: 11, cost: 550000,  quejas: 0 },
]

export const INFORME_SUBUTILIZACION = [
  { resource: 'Ana Nuñez',    type: 'Auxiliar',  site: 'BQ S2',       h_asignadas: 5,  h_disponibles: 42, pct_utilizacion: 12, sem_consec: 2 },
  { resource: 'Betty Meza',   type: 'Optómetra', site: 'Santa Marta', h_asignadas: 30, h_disponibles: 42, pct_utilizacion: 71, sem_consec: 1 },
  { resource: 'Lina Torres',  type: 'Auxiliar',  site: 'Riohacha',    h_asignadas: 32, h_disponibles: 42, pct_utilizacion: 76, sem_consec: 1 },
  { resource: 'Carlos Díaz',  type: 'Técnico',   site: 'Valledupar',  h_asignadas: 40, h_disponibles: 42, pct_utilizacion: 95, sem_consec: 0 },
]

export const INFORME_IMPACTO = [
  { resource: 'Yasiris Trespalacios', date: '11 may 2026', type: 'Enfermedad',     pac_afectados: 34, costo_oport: 5100000, costo_personal: 700000,  costo_reprog: 200000, total: 6000000 },
  { resource: 'Doraine Barrios',      date: '8 may 2026',  type: 'Vacaciones',     pac_afectados: 42, costo_oport: 6300000, costo_personal: 0,       costo_reprog: 100000, total: 6400000 },
  { resource: 'Dr. Escudero',         date: '12 may 2026', type: 'No presentación', pac_afectados: 27, costo_oport: 4050000, costo_personal: 0,       costo_reprog: 80000,  total: 4130000 },
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
    { name: 'Barranquilla S2', pct: 97 },
    { name: 'Barranquilla S1', pct: 91 },
    { name: 'Riohacha',        pct: 88 },
    { name: 'Valledupar',      pct: 82 },
    { name: 'Santa Marta',     pct: 75 },
    { name: 'Sabanalarga',     pct: 62 },
  ],
  ausencias_activas: [
    { name: 'Yasiris Trespalacios', site: 'Barranquilla S2', pacientes: 34, cost: 5200000 },
    { name: 'Doraine Barrios',      site: 'Barranquilla S2', pacientes: 42, cost: 6400000 },
    { name: 'Yurley Pua',           site: 'Sabanalarga',     pacientes: 11, cost: 1650000 },
  ],
  costo_total_ausentismo: 13250000,
}

// ============ FESTIVOS COLOMBIANOS (RN-06) ============
export const FESTIVOS_2026 = [
  { date: '2026-01-01', description: 'Año Nuevo' },
  { date: '2026-01-12', description: 'Día de los Reyes Magos' },
  { date: '2026-03-23', description: 'Día de San José' },
  { date: '2026-04-02', description: 'Jueves Santo' },
  { date: '2026-04-03', description: 'Viernes Santo' },
  { date: '2026-05-01', description: 'Día del Trabajo' },
  { date: '2026-05-18', description: 'Día de la Ascensión' },
  { date: '2026-06-08', description: 'Corpus Christi' },
  { date: '2026-06-15', description: 'Sagrado Corazón' },
  { date: '2026-06-29', description: 'San Pedro y San Pablo' },
  { date: '2026-07-20', description: 'Día de la Independencia' },
  { date: '2026-08-07', description: 'Batalla de Boyacá' },
  { date: '2026-08-17', description: 'Asunción de la Virgen' },
  { date: '2026-10-12', description: 'Día de la Raza' },
  { date: '2026-11-02', description: 'Todos los Santos' },
  { date: '2026-11-16', description: 'Independencia de Cartagena' },
  { date: '2026-12-08', description: 'Día de la Inmaculada Concepción' },
  { date: '2026-12-25', description: 'Navidad' },
]

// ============ PARÁMETROS DE COSTO (RN spec — versionados) ============
export const PARAMETROS_COSTO = [
  { id: 'p1', visit_type: 'oftalmologia',   visit_cost: 150000, reschedule_cost: 8000,  effective_from: '2026-01-01', set_by: 'u4' },
  { id: 'p2', visit_type: 'optometria',     visit_cost: 50000,  reschedule_cost: 5000,  effective_from: '2026-01-01', set_by: 'u4' },
  { id: 'p3', visit_type: 'anestesiologia', visit_cost: 250000, reschedule_cost: 12000, effective_from: '2026-01-01', set_by: 'u4' },
  { id: 'p4', visit_type: 'diagnostico',    visit_cost: 80000,  reschedule_cost: 6000,  effective_from: '2026-01-01', set_by: 'u4' },
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
  { id: 'e1', assignment_id: 'a10', patients_seen: 44, shift_status: 'completa', recorded_at: new Date().toISOString(), locked: false, notes: '' },
  { id: 'e2', assignment_id: 'a20', patients_seen: 42, shift_status: 'parcial',  recorded_at: new Date().toISOString(), locked: false, notes: 'Médico salió 30min antes' },
]

// ============ HISTORIAL AUSENCIAS DEL RECURSO (HU-R-06) ============
// Para el perfil "recurso" (Angela Sarmiento, u1 → r7)
export const HISTORIAL_AUSENCIAS_RECURSO = [
  { id: 'ha1', start_date: '2026-02-12', end_date: '2026-02-12', type: 'enfermedad', reason: 'Gripe', status: 'confirmada', patients_affected: 27 },
  { id: 'ha2', start_date: '2026-04-03', end_date: '2026-04-03', type: 'academico',  reason: 'Congreso de Enfermería', status: 'confirmada', patients_affected: 27 },
]

// ============ ESTADÍSTICAS DEL RECURSO (HU-R-08) ============
export const PRODUCTIVIDAD_RECURSO = {
  current_week_hours: 39,
  horas_mes: 156,
  pacientes_semana: 127,
  pacientes_mes: 498,
  incentivo_acumulado: null, // null si no es optómetra
  promedio_4_semanas: { horas: 41, pacientes: 132 },
  ultimas_4_semanas: [
    { week: 'Sem -3', horas: 42, pacientes: 138 },
    { week: 'Sem -2', horas: 40, pacientes: 128 },
    { week: 'Sem -1', horas: 42, pacientes: 135 },
    { week: 'Actual', horas: 39, pacientes: 127 },
  ],
}

// ============ ASIGNACIONES BACKOFFICE (auxiliar liberada → tarea admin) ============
export const ASIGNACIONES_BACKOFFICE = [
  {
    id: 'ab1',
    assistant_id: 'r12',       // Darleis Silva (liberada)
    assistant: recursoById('r12'),
    site_id: 's2',
    site: SEDES.find((s) => s.id === 's2'),
    backoffice_task_id: 't1',
    task: TAREAS_BACKOFFICE[0],
    day: fmt(semanaActualInicio),
    start_time: '07:00',
    end_time: '13:00',
    source_absence_id: 'au1',
    assigned_by: 'u2',
  },
]

// ============ EJECUCIÓN BACKOFFICE ============
export const EJECUCION_BACKOFFICE = [
  {
    id: 'eb1',
    backoffice_assignment_id: 'ab1',
    task_id: 't1',
    units_completed: 45,
    actual_minutes: 240,
    notes: '45 confirmaciones de citas para la semana 19-25 mayo',
    recorded_at: new Date().toISOString(),
  },
]

// ============ USUARIOS COMPLETOS (para Admin de Supervisor — HU-S-02) ============
export const USUARIOS_LISTA = [
  { id: 'u1',  name: 'Angela Sarmiento', email: 'angela.sarmiento@cofca.co', phone: '300 555 0001', role: 'recurso',     resource_id: 'r7',  active: true,  last_login_at: '2026-05-12 08:30', sites: ['s2'] },
  { id: 'u2',  name: 'María López',      email: 'maria.lopez@cofca.co',      phone: '300 555 0002', role: 'coordinador', resource_id: null,  active: true,  last_login_at: '2026-05-12 09:15', sites: ['s2'] },
  { id: 'u3',  name: 'Carlos Reyes',     email: 'carlos.reyes@cofca.co',     phone: '300 555 0003', role: 'directivo',   resource_id: null,  active: true,  last_login_at: '2026-05-11 14:00', sites: [] },
  { id: 'u4',  name: 'Diana Martínez',   email: 'desarrollo@cofca.com',      phone: '300 555 0004', role: 'supervisor',  resource_id: null,  active: true,  last_login_at: '2026-05-13 07:00', sites: [] },
  { id: 'u5',  name: 'Dr. Rhenals',      email: 'rhenals@cofca.co',          phone: '300 555 0005', role: 'recurso',     resource_id: 'r1',  active: true,  last_login_at: '2026-05-11 17:45', sites: ['s2'] },
  { id: 'u6',  name: 'Dr. Gutierrez',    email: 'gutierrez@cofca.co',        phone: '300 555 0006', role: 'recurso',     resource_id: 'r4',  active: true,  last_login_at: '2026-05-12 07:10', sites: ['s2'] },
  { id: 'u7',  name: 'Alba Tete',        email: 'alba.tete@cofca.co',        phone: '300 555 0007', role: 'recurso',     resource_id: 'r8',  active: true,  last_login_at: '2026-05-12 06:50', sites: ['s2'] },
  { id: 'u8',  name: 'Andrea Pérez',     email: 'andrea.perez@cofca.co',     phone: '300 555 0008', role: 'coordinador', resource_id: null,  active: true,  last_login_at: '2026-05-12 09:00', sites: ['s1'] },
  { id: 'u9',  name: 'Luis Ramírez',     email: 'luis.ramirez@cofca.co',     phone: '300 555 0009', role: 'coordinador', resource_id: null,  active: false, last_login_at: '2026-04-22 12:00', sites: ['s3'] },
]

// ============ AUDITORÍA (HU-S-05) ============
export const AUDITORIA = [
  { id: 'au-l1', user_id: 'u4', usuario_nombre: 'Diana Martínez', action: 'modificar_semana_cerrada', entity: 'semanas', entity_id: 'sem-prev', reason: 'Corrección de error de digitación en Cons. 6 viernes', ip_address: '186.84.x.x', created_at: '2026-05-12 14:32:00' },
  { id: 'au-l2', user_id: 'u4', usuario_nombre: 'Diana Martínez', action: 'cambiar_parametro_costo', entity: 'parametros_costo', entity_id: 'p1', reason: 'Actualización trimestral de tarifas oftalmología', ip_address: '186.84.x.x', created_at: '2026-05-10 10:15:00' },
  { id: 'au-l3', user_id: 'u2', usuario_nombre: 'María López', action: 'registrar_ausencia_por_recurso', entity: 'ausencias', entity_id: 'au1', reason: 'Recurso no se presentó y no reportó', ip_address: '190.45.x.x', created_at: '2026-05-12 08:15:00' },
  { id: 'au-l4', user_id: 'u4', usuario_nombre: 'Diana Martínez', action: 'crear_usuario', entity: 'usuarios', entity_id: 'u9', reason: '', ip_address: '186.84.x.x', created_at: '2026-04-15 09:00:00' },
  { id: 'au-l5', user_id: 'u3', usuario_nombre: 'Carlos Reyes', action: 'exportar_informe', entity: 'informes', entity_id: 'productividad', reason: '{ "formato": "pdf", "desde": "2026-04-01", "hasta": "2026-04-30" }', ip_address: '186.84.x.x', created_at: '2026-05-01 16:45:00' },
  { id: 'au-l6', user_id: 'u4', usuario_nombre: 'Diana Martínez', action: 'desactivar_usuario', entity: 'usuarios', entity_id: 'u9', reason: 'Recurso finalizó contrato', ip_address: '186.84.x.x', created_at: '2026-04-22 11:30:00' },
]

// ============ HORAS PROGRAMADAS VS EJECUTADAS (HU-D-08) ============
export const INFORME_HORAS_PROG_EJEC = [
  { site: 'Barranquilla S2', week: 'Sem 19', h_programadas: 280, h_ejecutadas: 274, diferencia: -6,  pct_cumplimiento: 98 },
  { site: 'Barranquilla S1', week: 'Sem 19', h_programadas: 220, h_ejecutadas: 210, diferencia: -10, pct_cumplimiento: 95 },
  { site: 'Santa Marta',     week: 'Sem 19', h_programadas: 180, h_ejecutadas: 148, diferencia: -32, pct_cumplimiento: 82 },
  { site: 'Cartagena',       week: 'Sem 19', h_programadas: 160, h_ejecutadas: 156, diferencia: -4,  pct_cumplimiento: 98 },
  { site: 'Valledupar',      week: 'Sem 19', h_programadas: 140, h_ejecutadas: 115, diferencia: -25, pct_cumplimiento: 82 },
  { site: 'Riohacha',        week: 'Sem 19', h_programadas: 120, h_ejecutadas: 106, diferencia: -14, pct_cumplimiento: 88 },
  { site: 'Sabanalarga',     week: 'Sem 19', h_programadas: 200, h_ejecutadas: 124, diferencia: -76, pct_cumplimiento: 62 },
]

// ============ COMPARATIVO SEMANAL (HU-D-06) ============
export const COMPARATIVO_SEMANAS = {
  semana_a: { label: 'Sem actual (11–17 may)', pacientes: 4218, horas_ejec: 1218, ocupacion: 94, absences: 4, costo_ausentismo: 13250000 },
  semana_b: { label: 'Sem anterior (4–10 may)', pacientes: 3970, horas_ejec: 1180, ocupacion: 89, absences: 3, costo_ausentismo: 10100000 },
  ultimas_12: Array.from({ length: 12 }, (_, i) => ({
    week: `Sem -${11 - i}`,
    pacientes: 3500 + Math.round(Math.random() * 800),
    ocupacion: 75 + Math.round(Math.random() * 20),
    absences: 2 + Math.round(Math.random() * 5),
  })),
}
