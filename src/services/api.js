// API services — modo DEMO (sin backend).
//
// Cada función devuelve una Promise resolviendo con datos mock locales,
// preservando exactamente la shape que devolvería el backend real.
//
// Cuando se conecte el backend Express real, basta con:
//   1. Cambiar DEMO_MODE = false
//   2. Las funciones harán fetch real con axios (las llamadas reales están en
//      la sección apiReal de abajo)
//   3. Las páginas no requieren ningún cambio.

import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import {
  USUARIOS, SEDES, CONSULTORIOS, RECURSOS, SEMANAS, ASIGNACIONES,
  AUSENCIAS, NOTIFICACIONES, TAREAS_BACKOFFICE, DASH_DIRECTIVO,
  INFORME_OCUPACION, INFORME_PRODUCTIVIDAD, INFORME_AUSENTISMO, INFORME_SUBUTILIZACION, INFORME_IMPACTO,
  FESTIVOS_2026, PARAMETROS_COSTO, PARAMETROS_SISTEMA, EJECUCIONES,
  HISTORIAL_AUSENCIAS_RECURSO, PRODUCTIVIDAD_RECURSO, ASIGNACIONES_BACKOFFICE, EJECUCION_BACKOFFICE,
  USUARIOS_LISTA, AUDITORIA, INFORME_HORAS_PROG_EJEC, COMPARATIVO_SEMANAS,
} from './mock-data'

// El modo demo sirve datos de mock-data.js en lugar de hablar con el backend.
//
// FALLO SEGURO (fix sep-2026): antes la condición era `!== 'false'`, así que
// CUALQUIER build sin la variable definida —un despliegue nuevo, un pipeline de
// CI, un .env mal copiado— arrancaba sirviendo datos inventados sin ningún aviso
// visible. En un sistema del que salen decisiones de programación clínica ese es
// el fallo por defecto más peligroso posible.
//
// Ahora hay que pedir el modo demo de forma explícita: si la variable falta, la
// app habla con el backend real. Mientras el modo demo esté activo, main.jsx
// pinta un distintivo permanente en pantalla (no se puede confundir con datos
// reales aunque alguien herede el entorno sin saberlo).
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// ============ HELPERS ============
const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))
const ok = async (data, ms = 200) => { await delay(ms); return data }
const fail = async (message, status = 400, ms = 200) => {
  await delay(ms)
  throw { message, status }
}

const uid = () => 'm-' + Math.random().toString(36).slice(2, 10)
const norm = (s) => (s ?? '').toLowerCase().trim()

// Estado mutable en memoria — sobrevive en una sesión, se pierde al recargar
let _asignaciones = [...ASIGNACIONES]
const _ausencias = [...AUSENCIAS]
const _semanas = [...SEMANAS]
let _notificaciones = [...NOTIFICACIONES]
const _ejecuciones = [...EJECUCIONES]
const _parametros_costo = [...PARAMETROS_COSTO]
let _usuarios_lista = [...USUARIOS_LISTA]   // reasignado en usuarioService.remove()
const _tareas_backoffice = [...TAREAS_BACKOFFICE]
const _auditoria = [...AUDITORIA]
const _asignaciones_backoffice = [...ASIGNACIONES_BACKOFFICE]
const _ejecucion_backoffice = [...EJECUCION_BACKOFFICE]
const _consultorios = [...CONSULTORIOS]
const _sedes = [...SEDES]
const _recursos = [...RECURSOS]
let _festivos = [...FESTIVOS_2026]
let _parametros_sistema = { ...PARAMETROS_SISTEMA }

// ============ AXIOS REAL (cuando DEMO_MODE = false) ============
// VITE_API_BASE permite apuntar a un backend en otro dominio (p.ej. en producción
// con el frontend en Vercel y el backend en Railway/Render/VPS).
// Si no se define, usa '/api' (mismo origen — útil en local con el proxy de Vite).
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const api = axios.create({ baseURL: API_BASE, timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ============ RENOVACIÓN AUTOMÁTICA DE SESIÓN ============
//
// El access token dura 8h y el refresh 7 días. Antes el refresh no se usaba: al
// primer 401 se cerraba la sesión, así que a las 8 horas exactas el coordinador
// salía despedido a mitad de programación (y el Programador no guarda borradores).
//
// Ahora, ante un 401 se intenta renovar UNA vez y se reintenta la petición
// original. Si la renovación falla, entonces sí se cierra la sesión.
//
// Las peticiones concurrentes comparten la misma renovación: si cinco llamadas
// reciben 401 a la vez, solo se pide un token nuevo y las cinco esperan a ese
// mismo resultado, en lugar de disparar cinco renovaciones en paralelo.
let renovacionEnCurso = null

// Cliente aparte, SIN interceptores: si la renovación usara `api`, un 401 en la
// propia renovación entraría otra vez por aquí y se quedaría dando vueltas.
const apiSinInterceptores = axios.create({ baseURL: API_BASE, timeout: 15000 })

async function renovarToken() {
  const { refreshToken, setToken, logout } = useAuthStore.getState()
  if (!refreshToken) {
    logout()
    return null
  }
  try {
    const { data } = await apiSinInterceptores.post('/auth/refresh', { refreshToken })
    if (!data?.token) throw new Error('respuesta de refresh sin token')
    setToken(data.token)
    return data.token
  } catch {
    // Refresh caducado o revocado: aquí sí toca volver a entrar.
    logout()
    return null
  }
}

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const original = err.config
    const es401 = err.response?.status === 401

    // No se renueva cuando: no es 401, ya se reintentó esta petición, o el 401
    // viene del propio login (ahí un 401 significa credenciales incorrectas).
    const renovable =
      es401 &&
      original &&
      !original._reintentado &&
      !String(original.url ?? '').includes('/auth/login') &&
      !String(original.url ?? '').includes('/auth/refresh')

    if (renovable) {
      // Si el token ya cambió mientras esta petición estaba en vuelo, otra la
      // renovó por nosotros: basta con reintentar con el token actual.
      //
      // Sin esta comprobación, compartir la promesa NO es suficiente: solo cubre
      // los 401 que llegan a la vez. Las peticiones que seguían en vuelo cuando
      // la renovación terminó encontraban `renovacionEnCurso` ya limpio y
      // lanzaban otra renovación cada una (con 5 peticiones simultáneas salían
      // 3 renovaciones en vez de 1).
      const tokenActual = useAuthStore.getState().token
      const enviado = original.headers?.Authorization
      if (tokenActual && enviado && enviado !== `Bearer ${tokenActual}`) {
        original._reintentado = true
        original.headers = { ...original.headers, Authorization: `Bearer ${tokenActual}` }
        return api.request(original)
      }

      renovacionEnCurso = renovacionEnCurso ?? renovarToken().finally(() => { renovacionEnCurso = null })
      const nuevoToken = await renovacionEnCurso
      if (nuevoToken) {
        original._reintentado = true
        original.headers = { ...original.headers, Authorization: `Bearer ${nuevoToken}` }
        return api.request(original)
      }
      // renovarToken() ya cerró la sesión
      return Promise.reject(err.response?.data ?? err)
    }

    if (es401) useAuthStore.getState().logout()
    return Promise.reject(err.response?.data ?? err)
  }
)

// ============ AUTH ============
export const authService = {
  login: async (email, password) => {
    if (!DEMO_MODE) return api.post('/auth/login', { email, password })
    const key = Object.keys(USUARIOS).find((rol) =>
      USUARIOS[rol].email.toLowerCase() === norm(email)
    )
    const user = key ? USUARIOS[key] : USUARIOS.coordinador
    if (!password || password.length < 3) return fail('Credenciales incorrectas', 401)
    return ok({ user, token: 'demo-token-' + user.role }, 350)
  },
  loginAs: async (rol) => {
    // Helper exclusivo de demo — entra directo como un rol
    if (!DEMO_MODE) return fail('Solo disponible en demo')
    const user = USUARIOS[rol] ?? USUARIOS.coordinador
    return ok({ user, token: 'demo-token-' + user.role }, 150)
  },
  forgotPassword: async (email) => {
    if (!DEMO_MODE) return api.post('/auth/forgot-password', { email })
    return ok({ message: 'Email enviado' }, 400)
  },
  resetPassword: async (token, password) => {
    if (!DEMO_MODE) return api.post('/auth/reset-password', { token, password })
    return ok({ message: 'Contraseña actualizada' }, 300)
  },
  /** Registro público — queda pendiente de aprobación por el supervisor */
  registro: async (data) => {
    if (!DEMO_MODE) return api.post('/auth/signup', data)
    return ok({ ok: true, message: 'Solicitud enviada (demo)' }, 300)
  },
  /** Cambia la contraseña del usuario autenticado (también limpia debeCambiarPassword) */
  cambiarPassword: async (passwordActual, passwordNueva) => {
    if (!DEMO_MODE) return api.post('/auth/change-password', { password_actual: passwordActual, password_nueva: passwordNueva })
    return ok({ ok: true })
  },
  // Supervisor: solicitudes de registro
  listSolicitudes: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/users/requests', { params })
    return ok([])
  },
  aprobarSolicitud: async (id) => {
    if (!DEMO_MODE) return api.post(`/users/requests/${id}/approve`)
    return ok({ ok: true })
  },
  rechazarSolicitud: async (id, motivo) => {
    if (!DEMO_MODE) return api.post(`/users/requests/${id}/reject`, { reason: motivo })
    return ok({ ok: true })
  },
  me: async () => {
    if (!DEMO_MODE) return api.get('/users/me')
    const token = useAuthStore.getState().token
    const rol = token?.replace('demo-token-', '') ?? 'coordinador'
    return ok(USUARIOS[rol] ?? USUARIOS.coordinador)
  },
}

// ============ SEDES ============
export const sedeService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/sites')
    return ok(_sedes)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/sites', data)
    const nueva = { ...data, id: uid(), active: data.active ?? true }
    _sedes.push(nueva)
    return ok(nueva)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/sites/${id}`, data)
    const i = _sedes.findIndex((s) => s.id === id)
    if (i === -1) return fail('Sede no encontrada', 404)
    _sedes[i] = { ..._sedes[i], ...data }
    return ok(_sedes[i])
  },
  rooms: async (sedeId) => {
    if (!DEMO_MODE) return api.get(`/sites/${sedeId}/rooms`)
    return ok(_consultorios.filter((c) => c.site_id === sedeId))
  },
}

// ============ RECURSOS ============
export const recursoService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/resources', { params })
    let list = _recursos
    if (params.type) list = list.filter((r) => r.type === params.type)
    if (params.site_id) list = list.filter((r) => !r.site_id || r.site_id === params.site_id)
    if (params.active !== undefined) list = list.filter((r) => r.active === params.active)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/resources', data)
    const nuevo = { ...data, id: uid(), active: data.active ?? true }
    _recursos.push(nuevo)
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/resources/${id}`, data)
    const i = _recursos.findIndex((r) => r.id === id)
    if (i === -1) return fail('Recurso no encontrado', 404)
    _recursos[i] = { ..._recursos[i], ...data }
    return ok(_recursos[i])
  },
  horario: async (recursoId, semanaId) => {
    if (!DEMO_MODE) return api.get(`/resources/${recursoId}/schedule`, { params: { week_id: semanaId } })
    return ok(_asignaciones.filter((a) =>
      a.week_id === semanaId &&
      (a.resource_id === recursoId || a.assistant_id === recursoId)
    ))
  },
  liberadas: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/assistants/available', { params })
    return ok(_recursos.filter((r) => r.type === 'auxiliar' && r.status_badge === 'liberada'))
  },
  /** Sugiere reemplazos disponibles para una asignación en franja específica (HU-C-12, RN-38) */
  sugerirReemplazos: async ({ type: tipo, day: dia, start_time: hora_inicio, end_time: hora_fin, city: ciudad, week_id: semana_id, room_id: consultorio_id }) => {
    if (!DEMO_MODE) return api.get('/resources/suggested', { params: { type: tipo, day: dia, start_time: hora_inicio, end_time: hora_fin, city: ciudad, week_id: semana_id, room_id: consultorio_id } })
    const sedesCiudad = _sedes.filter((s) => s.city === ciudad).map((s) => s.id)
    const candidatos = _recursos.filter((r) => r.type === tipo && r.active)
    const conflicto = (r) => _asignaciones.some((a) =>
      a.week_id === semana_id && a.weekday === dia &&
      (a.resource_id === r.id || a.assistant_id === r.id) &&
      !(hora_fin <= a.start_time || hora_inicio >= a.end_time)
    )
    return ok(candidatos.filter((r) => !conflicto(r)).map((r) => ({
      ...r,
      misma_sede: r.site_id ? sedesCiudad.includes(r.site_id) : true,
    })))
  },
  /** Productividad personal del recurso (HU-R-08) */
  productividad: async (recursoId) => {
    if (!DEMO_MODE) return api.get(`/resources/${recursoId}/productivity`)
    return ok(PRODUCTIVIDAD_RECURSO)
  },
}

// ============ SEMANAS ============
export const semanaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/weeks', { params })
    return ok(_semanas)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/weeks', data)
    const fechaInicio = new Date(data.start_date)
    const diff = (fechaInicio - new Date()) / (1000 * 60 * 60 * 24)
    if (diff < 3) return fail('La programación debe crearse con al menos 3 días de anticipación', 400)
    const fechaFin = new Date(fechaInicio); fechaFin.setDate(fechaFin.getDate() + 6)
    const nueva = {
      id: uid(),
      start_date: data.start_date,
      end_date: fechaFin.toISOString().slice(0, 10),
      status: 'abierta',
    }
    _semanas.push(nueva)
    return ok(nueva)
  },
  cerrar: async (id, sedeId) => {
    // Cierre por sede: el coord pasa sedeId. Si lo omite, el backend toma la
    // primera sede del usuario (mismo comportamiento operacional).
    if (!DEMO_MODE) return api.put(`/weeks/${id}/close`, sedeId ? { site_id: sedeId } : {})
    const i = _semanas.findIndex((s) => s.id === id)
    if (i === -1) return fail('Semana no encontrada', 404)
    _semanas[i] = { ..._semanas[i], status: 'cerrada', closed_at: new Date().toISOString() }
    return ok(_semanas[i])
  },
  estadoPorSede: async (id) => {
    if (!DEMO_MODE) return api.get(`/weeks/${id}/status-by-site`)
    return ok({ week: { id }, sites: [], consolidated: false })
  },
  copiar: async (id, nuevaFecha, { siteId: sedeId, sedeIds } = {}) => {
    // sedeId / sedeIds limitan el alcance del reemplazo a las sedes indicadas.
    // OBLIGATORIO para coordinador; opcional para supervisor/gerencia.
    if (!DEMO_MODE) return api.post(`/weeks/${id}/copy`, {
      start_date: nuevaFecha,
      ...(sedeId ? { site_id: sedeId } : {}),
      ...(sedeIds ? { sede_ids: sedeIds } : {}),
    })
    return ok({ id: uid(), start_date: nuevaFecha, status: 'abierta', copiada_de: id })
  },
}

// ============ ASIGNACIONES ============
// Implementa las 6 validaciones del Diagrama 3 (orden estricto, HTTP exact codes)
// En modo demo replicamos la lógica del backend para validar la UX desde el frontend.
// En producción la validación REAL siempre es backend (con SELECT FOR UPDATE).

const horasDeFranja = (hi, hf) => {
  const [h1, m1] = hi.split(':').map(Number)
  const [h2, m2] = hf.split(':').map(Number)
  return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60
}

const solapaFranja = (a, dia, hi, hf, semanaId) =>
  a.week_id === semanaId && a.weekday === dia &&
  !(hf <= a.start_time || hi >= a.end_time)

const validarAsignacion = (data, currentUserRol) => {
  const semana = _semanas.find((s) => s.id === data.week_id)

  // RN-08 / Validación 1: Semana abierta (o supervisor)
  if (semana?.status === 'cerrada' && currentUserRol !== 'supervisor') {
    return { status: 403, message: 'No tienes permiso para modificar esta semana — está cerrada' }
  }

  const recurso = _recursos.find((r) => r.id === data.resource_id)
  const consultorio = _consultorios.find((c) => c.id === data.room_id)
  const sedeAsign = _sedes.find((s) => s.id === consultorio?.site_id)

  // Validación 2: Recurso libre en franja ese día (cualquier consultorio)
  const conflictoRecurso = _asignaciones.find((a) =>
    solapaFranja(a, data.weekday, data.start_time, data.end_time, data.week_id) &&
    (a.resource_id === data.resource_id || a.assistant_id === data.resource_id) &&
    a.id !== data.id
  )
  if (conflictoRecurso) {
    const c = _consultorios.find((x) => x.id === conflictoRecurso.room_id)
    return { status: 409, message: `Conflicto: ${recurso?.name} ya está asignado en ${c?.name} de ${conflictoRecurso.start_time} a ${conflictoRecurso.end_time}` }
  }

  // RN-09 / Validación 3: Ciudad única ese día
  const otraAsigEseDia = _asignaciones.find((a) =>
    a.week_id === data.week_id && a.weekday === data.weekday &&
    (a.resource_id === data.resource_id || a.assistant_id === data.resource_id) &&
    a.id !== data.id
  )
  if (otraAsigEseDia) {
    const cOtra = _consultorios.find((x) => x.id === otraAsigEseDia.room_id)
    const sOtra = _sedes.find((s) => s.id === cOtra?.site_id)
    if (sOtra && sedeAsign && sOtra.city !== sedeAsign.city) {
      return { status: 409, message: `${recurso?.name} no puede estar en dos ciudades el mismo día (${sOtra.city} y ${sedeAsign.city})` }
    }
  }

  // Validación 4: Auxiliar libre (si aplica)
  if (data.assistant_id && consultorio?.requires_assistant) {
    const conflictoAux = _asignaciones.find((a) =>
      solapaFranja(a, data.weekday, data.start_time, data.end_time, data.week_id) &&
      (a.assistant_id === data.assistant_id || a.resource_id === data.assistant_id) &&
      a.id !== data.id
    )
    if (conflictoAux) {
      const aux = _recursos.find((x) => x.id === data.assistant_id)
      const c = _consultorios.find((x) => x.id === conflictoAux.room_id)
      return { status: 409, message: `Conflicto de auxiliar: ${aux?.name} ya está asignada en ${c?.name} en esa franja` }
    }
  }

  // RN-13 / Validación 5: ≤10h diarias
  const horasNueva = horasDeFranja(data.start_time, data.end_time)
  const horasDia = _asignaciones
    .filter((a) => a.week_id === data.week_id && a.weekday === data.weekday &&
      (a.resource_id === data.resource_id || a.assistant_id === data.resource_id) && a.id !== data.id)
    .reduce((acc, a) => acc + horasDeFranja(a.start_time, a.end_time), 0)
  if (horasDia + horasNueva > (recurso?.max_hours_per_day ?? 10)) {
    return { status: 400, message: `${recurso?.name} superaría el máximo de ${recurso?.max_hours_per_day ?? 10} horas diarias (lleva ${horasDia}h, suma ${horasNueva}h)` }
  }

  // RN-13 / Validación 6: >42h semanales → flag, NO bloquea
  const horasSemana = _asignaciones
    .filter((a) => a.week_id === data.week_id &&
      (a.resource_id === data.resource_id || a.assistant_id === data.resource_id) && a.id !== data.id)
    .reduce((acc, a) => acc + horasDeFranja(a.start_time, a.end_time), 0)
  const esHorasExtras = (horasSemana + horasNueva) > (recurso?.max_hours_per_week ?? 42)

  // RN-13: detectar horas nocturnas (>= 18:00)
  const tieneNocturna = data.end_time > '18:00' || data.start_time >= '18:00'

  return { ok: true, isOvertime: esHorasExtras, tieneNocturna }
}

export const asignacionService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/assignments', { params })
    let list = _asignaciones
    if (params.week_id) list = list.filter((a) => a.week_id === params.week_id)
    if (params.site_id) {
      const idsCons = _consultorios.filter((c) => c.site_id === params.site_id).map((c) => c.id)
      list = list.filter((a) => idsCons.includes(a.room_id))
    }
    if (params.resource_id) {
      list = list.filter((a) => a.resource_id === params.resource_id || a.assistant_id === params.resource_id)
    }
    return ok(list)
  },
  create: async (data, currentUserRol = 'coordinador') => {
    if (!DEMO_MODE) return api.post('/assignments', data)
    const v = validarAsignacion(data, currentUserRol)
    if (v.status) return fail(v.message, v.status)

    // HU-S-01: supervisor que modifica semana cerrada requiere motivo
    const semana = _semanas.find((s) => s.id === data.week_id)
    if (semana?.status === 'cerrada' && currentUserRol === 'supervisor') {
      if (!data.supervisor_reason || data.supervisor_reason.trim().length < 5) {
        return fail('Modificar una semana cerrada requiere un motivo (mínimo 5 caracteres)', 400)
      }
      _auditoria.unshift({
        id: uid(), user_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.name,
        action: 'modificar_semana_cerrada', entity: 'asignaciones', entity_id: '(nueva)',
        reason: data.supervisor_reason, created_at: new Date().toISOString(),
      })
    }

    // RN-11: cálculo de capacidad de pacientes
    const recurso = _recursos.find((r) => r.id === data.resource_id)
    const min = horasDeFranja(data.start_time, data.end_time) * 60
    const almuerzo = min >= 360 ? 60 : 0
    const intervalo = recurso?.slot_minutes ?? 15
    const pacientesCapacidad = Math.floor((min - almuerzo) / intervalo)

    const nueva = {
      ...data,
      id: uid(),
      patient_capacity: pacientesCapacidad,
      is_overtime: v.isOvertime,
      has_night_hours: v.tieneNocturna,
      resource: _recursos.find((r) => r.id === data.resource_id),
      recurso_principal: _recursos.find((r) => r.id === data.resource_id),
      room: _consultorios.find((c) => c.id === data.room_id),
      assistant: data.assistant_id ? _recursos.find((r) => r.id === data.assistant_id) : null,
    }
    _asignaciones.push(nueva)

    // Acciones post-inserción: actualizar acumulado de horas del recurso
    const ri = _recursos.findIndex((r) => r.id === data.resource_id)
    if (ri !== -1) {
      const total = _asignaciones
        .filter((a) => a.week_id === data.week_id &&
          (a.resource_id === data.resource_id || a.assistant_id === data.resource_id))
        .reduce((acc, a) => acc + horasDeFranja(a.start_time, a.end_time), 0)
      _recursos[ri] = { ..._recursos[ri], assigned_hours: total, is_overtime: v.isOvertime }
    }
    return ok(nueva)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/assignments/${id}`, data)
    const i = _asignaciones.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    _asignaciones[i] = { ..._asignaciones[i], ...data }
    return ok(_asignaciones[i])
  },
  /** Edición rápida solo del campo pacientes_capacidad desde /app/ejecucion. */
  updatePacientesCapacidad: async (id, pacientesCapacidad) =>
    api.patch(`/assignments/${id}/patient-capacity`, { patient_capacity: pacientesCapacidad }),
  remove: async (id) => {
    if (!DEMO_MODE) return api.delete(`/assignments/${id}`)
    // RN-17: si tiene ejecución registrada, no eliminar — marcar como cancelada
    const conEjec = _ejecuciones.some((e) => e.assignment_id === id)
    if (conEjec) {
      const i = _asignaciones.findIndex((a) => a.id === id)
      if (i !== -1) _asignaciones[i] = { ..._asignaciones[i], status: 'cancelada' }
      return ok({ ok: true, cancelled: true })
    }
    _asignaciones = _asignaciones.filter((a) => a.id !== id)
    return ok({ ok: true })
  },
  /** Copia todas las asignaciones de un día a uno o varios días destino de la misma semana */
  copiarDia: async ({ weekId: semanaId, siteId: sedeId, dayFrom: diaOrigen, targetDays: diasDestino }) => {
    if (!DEMO_MODE) return api.post('/assignments/copy-day', { weekId: semanaId, siteId: sedeId, dayFrom: diaOrigen, targetDays: diasDestino })
    return ok({ ok: true, copied: 0, skipped: 0, errors: [] })
  },
  /** Copia todas las asignaciones de un consultorio+día a uno o varios días destino. */
  copiarConsultorio: async ({ weekId: semanaId, roomId: consultorioId, dayFrom: diaOrigen, targetDays: diasDestino }) => {
    if (!DEMO_MODE) return api.post('/assignments/copy-room', { weekId: semanaId, roomId: consultorioId, dayFrom: diaOrigen, targetDays: diasDestino })
    return ok({ ok: true, copied: 0, skipped: 0, errors: [] })
  },
  /** Copia UNA asignación específica a otro(s) día(s). Opcionalmente a otra semana. */
  copiarAsignacion: async (id, diasDestino, semanaDestinoId = null) => {
    if (!DEMO_MODE) return api.post(`/assignments/${id}/copy-to-days`, { targetDays: diasDestino, targetWeekId: semanaDestinoId ?? undefined })
    return ok({ ok: true, copied: 0, skipped: 0, errors: [] })
  },
}

// ============ AUSENCIAS ============
export const ausenciaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/absences', { params })
    let list = _ausencias
    if (params.status) list = list.filter((a) => a.status === params.status)
    if (params.resource_id) list = list.filter((a) => a.resource_id === params.resource_id)
    return ok(list)
  },
  /** Descargar el formato oficial F-AA-126 en PDF para una ausencia confirmada
   *  de un recurso médico (oftalmólogo, optómetra, anestesiólogo, otorrino,
   *  fonoaudiólogo). Devuelve un Blob que se descarga desde el frontend. */
  descargarFormatoFAA126: async (id) => {
    const res = await api.get(`/absences/${id}/faa126-form.pdf`, { responseType: 'blob' })
    return res.data ?? res
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/absences', data)
    const nueva = {
      ...data,
      id: uid(),
      status: 'pendiente',
      resource: RECURSOS.find((r) => r.id === data.resource_id),
      reported_at: new Date().toISOString(),
    }
    _ausencias.unshift(nueva)
    return ok(nueva)
  },
  confirmar: async (id, data = {}) => {
    if (!DEMO_MODE) return api.put(`/absences/${id}/confirm`, data)
    const i = _ausencias.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    const ausencia = _ausencias[i]
    const recurso = _recursos.find((r) => r.id === ausencia.resource_id)

    // RN-18: calcular impacto día a día
    const fechas = []
    const fechaInicio = new Date(ausencia.start_date)
    const fechaFin = new Date(ausencia.end_date)
    const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
    for (let d = new Date(fechaInicio); d <= fechaFin; d.setDate(d.getDate() + 1)) {
      fechas.push({ date: d.toISOString().slice(0, 10), day: dias[d.getDay()] })
    }
    let pacientesImpactados = 0
    let costoOportunidad = 0
    const impactoPorDia = fechas.map(({ date: fecha, day: dia }) => {
      const asigsDia = _asignaciones.filter((a) => a.resource_id === ausencia.resource_id && a.weekday === dia)
      // RN-19: ausencia parcial — calcular impacto proporcional al tiempo de ausencia
      const factorParcial = (ausencia.is_partial && ausencia.absence_start_time && ausencia.absence_end_time)
        ? (() => {
            const [h1, m1] = ausencia.absence_start_time.split(':').map(Number)
            const [h2, m2] = ausencia.absence_end_time.split(':').map(Number)
            const minAus = (h2 * 60 + m2) - (h1 * 60 + m1)
            return minAus / 600 // proporción aprox sobre 10h
          })()
        : 1
      const pacDia = Math.round(asigsDia.reduce((acc, a) => acc + (a.patient_capacity ?? 0), 0) * factorParcial)
      pacientesImpactados += pacDia
      const costoDia = asigsDia.reduce((acc, a) => {
        const cons = _consultorios.find((c) => c.id === a.room_id)
        const param = _parametros_costo.find((p) => p.visit_type === cons?.specialty)
        return acc + Math.round((a.patient_capacity ?? 0) * (param?.visit_cost ?? 0) * factorParcial)
      }, 0)
      costoOportunidad += costoDia
      return { date: fecha, day: dia, pacientes: pacDia, cost: costoDia, cubierta: false, parcial: ausencia.is_partial }
    })

    // RN-24: liberar auxiliares de oftalmólogos/anestesiólogos ausentes
    if (recurso && (recurso.type === 'oftalmologo' || recurso.type === 'anestesiologo')) {
      _asignaciones.forEach((a, idx) => {
        if (a.resource_id === ausencia.resource_id && a.assistant_id) {
          const auxIdx = _recursos.findIndex((r) => r.id === a.assistant_id)
          if (auxIdx !== -1) {
            _recursos[auxIdx] = { ..._recursos[auxIdx], status_badge: 'liberada' }
          }
          _asignaciones[idx] = { ...a, status: 'sin_cobertura' }
        }
      })
    }

    _ausencias[i] = {
      ...ausencia,
      status: 'confirmada',
      patients_affected: pacientesImpactados,
      opportunity_cost: costoOportunidad,
      daily_impact: impactoPorDia,
      ...data,
      confirmed_at: new Date().toISOString(),
    }
    return ok(_ausencias[i])
  },
  rechazar: async (id, motivo) => {
    if (!DEMO_MODE) return api.put(`/absences/${id}/reject`, { reason: motivo })
    // RN-20: motivo obligatorio
    if (!motivo || motivo.trim().length < 5) {
      return fail('El motivo del rechazo es obligatorio (mínimo 5 caracteres)', 400)
    }
    const i = _ausencias.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    _ausencias[i] = { ..._ausencias[i], status: 'rechazada', rejection_reason: motivo, rechazado_en: new Date().toISOString() }
    return ok(_ausencias[i])
  },
}

// ============ EJECUCIÓN ============
export const ejecucionService = {
  /** Lista ejecuciones por filtros (ej. semana_id, sede_id, dia) */
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/execution', { params })
    let list = _ejecuciones.map((e) => ({
      ...e,
      assignment: _asignaciones.find((a) => a.id === e.assignment_id),
    }))
    if (params.week_id) list = list.filter((e) => e.assignment?.week_id === params.week_id)
    if (params.day) list = list.filter((e) => e.assignment?.weekday === params.day)
    if (params.site_id) {
      const idsCons = _consultorios.filter((c) => c.site_id === params.site_id).map((c) => c.id)
      list = list.filter((e) => e.assignment && idsCons.includes(e.assignment.room_id))
    }
    return ok(list)
  },
  /** Asignaciones que aún no tienen ejecución registrada para un día */
  pendientesDelDia: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/execution/pending', { params })
    const asigs = _asignaciones.filter((a) =>
      a.week_id === params.week_id && a.weekday === params.day
    )
    return ok(asigs.map((a) => ({
      ...a,
      execution: _ejecuciones.find((e) => e.assignment_id === a.id) || null,
    })))
  },
  /** Vista del auxiliar (rol recurso): sus asignaciones del día como aux1 o aux2 */
  misPendientesDelDia: async (params = {}) => {
    return api.get('/execution/my-pending', { params })
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/execution', data)
    const nueva = {
      id: uid(),
      ...data,
      recorded_at: new Date().toISOString(),
      locked: false,
    }
    // Si ya existe ejecución para esa asignación, actualizar
    const i = _ejecuciones.findIndex((e) => e.assignment_id === data.assignment_id)
    if (i !== -1) {
      _ejecuciones[i] = { ..._ejecuciones[i], ...data, recorded_at: new Date().toISOString() }
      return ok(_ejecuciones[i])
    }
    _ejecuciones.push(nueva)
    return ok(nueva)
  },
  /** Guardar batch (todas las del día) */
  saveDay: async (registros) => {
    if (!DEMO_MODE) return api.post('/execution/batch', { registros })
    registros.forEach((data) => {
      const i = _ejecuciones.findIndex((e) => e.assignment_id === data.assignment_id)
      if (i !== -1) {
        _ejecuciones[i] = { ..._ejecuciones[i], ...data, recorded_at: new Date().toISOString() }
      } else {
        _ejecuciones.push({ id: uid(), ...data, recorded_at: new Date().toISOString(), locked: false })
      }
    })
    return ok({ count: registros.length })
  },
  get: async (asignacionId) => {
    if (!DEMO_MODE) return api.get('/execution', { params: { assignment_id: asignacionId } })
    return ok(_ejecuciones.find((e) => e.assignment_id === asignacionId) ?? null)
  },
}

// ============ BACKOFFICE (RN-36, RN-37) ============
export const backofficeService = {
  /** Catálogo de tareas de backoffice activas */
  tasks: async () => {
    if (!DEMO_MODE) return api.get('/backoffice-tasks')
    return ok(_tareas_backoffice.filter((t) => t.active))
  },
  /** CRUD del catálogo — solo supervisor (HU-S-06) */
  tareasAll: async () => {
    if (!DEMO_MODE) return api.get('/backoffice-tasks', { params: { all: true } })
    return ok(_tareas_backoffice)
  },
  /** Solicitudes pendientes (supervisor las ve para aprobar/rechazar) */
  tareasPendientes: async () => {
    if (!DEMO_MODE) return api.get('/backoffice-tasks', { params: { status: 'pendiente' } })
    return ok([])
  },
  /** Supervisor aprueba una solicitud pendiente (puede ajustar campos antes) */
  aprobarSolicitudTarea: async (id, ajustes = {}) => {
    if (!DEMO_MODE) return api.post(`/backoffice-tasks/${id}/approve`, ajustes)
    return ok({ ok: true })
  },
  /** Supervisor rechaza una solicitud pendiente con motivo obligatorio */
  rechazarSolicitudTarea: async (id, motivo) => {
    if (!DEMO_MODE) return api.post(`/backoffice-tasks/${id}/reject`, { reason: motivo })
    return ok({ ok: true })
  },
  tareaCreate: async (data) => {
    if (!DEMO_MODE) return api.post('/backoffice-tasks', data)
    const nueva = { id: uid(), ...data, active: data.active ?? true, created_by: 'u4' }
    _tareas_backoffice.push(nueva)
    return ok(nueva)
  },
  tareaUpdate: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/backoffice-tasks/${id}`, data)
    const i = _tareas_backoffice.findIndex((t) => t.id === id)
    if (i === -1) return fail('Tarea no encontrada', 404)
    _tareas_backoffice[i] = { ..._tareas_backoffice[i], ...data }
    return ok(_tareas_backoffice[i])
  },
  /** El coordinador solicita al supervisor crear una tarea que no existe (notifica al supervisor) */
  solicitarTarea: async (data) => {
    if (!DEMO_MODE) return api.post('/backoffice-tasks/request', data)
    _notificaciones = [{
      id: uid(),
      type: 'solicitud_tarea_backoffice',
      title: 'Solicitud de nueva tarea de backoffice',
      message: `Se solicita crear la tarea de backoffice "${data.name}".${data.justification ? ` Justificación: ${data.justification}` : ''}`,
      read: false,
      created_at: new Date().toISOString(),
    }, ..._notificaciones]
    return ok({ ok: true, notificados: 1 })
  },
  /** Lista asignaciones backoffice */
  asignacionesList: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/backoffice-assignments', { params })
    let list = _asignaciones_backoffice
    if (params.assistant_id) list = list.filter((a) => a.assistant_id === params.assistant_id)
    if (params.site_id) list = list.filter((a) => a.site_id === params.site_id)
    if (params.day) list = list.filter((a) => a.day === params.day)
    return ok(list)
  },
  /** Asignar auxiliar liberada a tarea de backoffice (HU-C-17, RN-36) */
  asignar: async (data) => {
    if (!DEMO_MODE) return api.post('/backoffice-assignments', data)
    const aux = _recursos.find((r) => r.id === data.assistant_id)
    const tarea = _tareas_backoffice.find((t) => t.id === data.backoffice_task_id)
    const sede = _sedes.find((s) => s.id === data.site_id)
    // Validar que no supere su límite diario
    const horasDia = _asignaciones_backoffice
      .filter((a) => a.assistant_id === data.assistant_id && a.day === data.day)
      .reduce((acc, a) => acc + horasDeFranja(a.start_time, a.end_time), 0)
    const horasNueva = horasDeFranja(data.start_time, data.end_time)
    if (horasDia + horasNueva > (aux?.max_hours_per_day ?? 10)) {
      return fail(`${aux?.name} superaría su límite de ${aux?.max_hours_per_day ?? 10}h diarias`, 400)
    }
    const nueva = { ...data, id: uid(), assistant: aux, task: tarea, site: sede }
    _asignaciones_backoffice.push(nueva)
    return ok(nueva)
  },
  /** Lista ejecuciones backoffice */
  ejecucionList: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/backoffice-execution', { params })
    let list = _ejecucion_backoffice.map((e) => ({
      ...e,
      assignment: _asignaciones_backoffice.find((a) => a.id === e.backoffice_assignment_id),
    }))
    if (params.assistant_id) list = list.filter((e) => e.assignment?.assistant_id === params.assistant_id)
    return ok(list)
  },
  /** La auxiliar registra sus tareas completadas (HU-R-11, RN-37) */
  registrar: async (data) => {
    if (!DEMO_MODE) return api.post('/backoffice-execution', data)
    const nueva = { id: uid(), ...data, recorded_at: new Date().toISOString() }
    _ejecucion_backoffice.push(nueva)
    return ok(nueva)
  },
  /** Asignaciones pendientes de ejecutar para una auxiliar hoy */
  pendientesAuxiliar: async (auxiliarId) => {
    if (!DEMO_MODE) return api.get(`/backoffice-assignments/pending/${auxiliarId}`)
    const hoy = new Date().toISOString().slice(0, 10)
    const asigs = _asignaciones_backoffice.filter((a) => a.assistant_id === auxiliarId && a.day === hoy)
    return ok(asigs.map((a) => ({
      ...a,
      task: _tareas_backoffice.find((t) => t.id === a.backoffice_task_id),
      site: _sedes.find((s) => s.id === a.site_id),
      executions: _ejecucion_backoffice.filter((e) => e.backoffice_assignment_id === a.id),
    })))
  },
}

// ============ NOTIFICACIONES ============
export const notificacionService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/notifications')
    return ok(_notificaciones)
  },
  leer: async (id) => {
    if (!DEMO_MODE) return api.put(`/notifications/${id}/read`)
    const i = _notificaciones.findIndex((n) => n.id === id)
    if (i !== -1) _notificaciones[i] = { ..._notificaciones[i], read: true }
    return ok({ ok: true })
  },
  leerTodas: async () => {
    if (!DEMO_MODE) return api.put('/notifications/read-all')
    _notificaciones = _notificaciones.map((n) => ({ ...n, read: true }))
    return ok({ ok: true })
  },
}

// ============ INFORMES ============
// Devuelven array directo (el InformePage consume `data.length` y `data.map`).
// Aceptan params (desde, hasta, sede_id, tipo_recurso) que se pasan como query
// string al backend. En modo demo los mocks son fijos y los params se ignoran.
export const informeService = {
  ocupacion: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/occupancy', { params })
    return ok(INFORME_OCUPACION)
  },
  // Fase 4 (ago-2026): dashboard gerencial de reprogramaciones — endpoint
  // agregado con 4 secciones (kpis, por_mes, por_familia, top_motivos,
  // por_recurso, reposiciones, por_especialidad, cruce_familia_especialidad).
  reprogramacionesDashboard: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/reschedules-dashboard', { params })
    return ok({
      rango: { desde: '2026-05-01', hasta: '2026-08-26' },
      kpis: { total_ausencias: 0, dias_perdidos: 0, patients_affected: 0, opportunity_cost: 0, programadas: 0, imprevistas: 0, tasa_reposicion_pct: 0 },
      por_mes: [], por_familia: [], top_motivos: [], por_recurso: [],
      makeups: { solicitadas: 0, aprobadas: 0, rechazadas: 0, realizadas: 0, pct_aprobacion: 0, tiempo_medio_aprobacion_h: null, por_mes: [], top_medicos: [] },
      por_especialidad: [], cruce_familia_especialidad: [],
    })
  },
  ocupacionAsesores: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/advisor-occupancy', { params })
    return ok([])
  },
  productividad: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/productivity', { params })
    return ok(INFORME_PRODUCTIVIDAD)
  },
  ausentismo: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/absenteeism', { params })
    return ok(INFORME_AUSENTISMO)
  },
  subutilizacion: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/underuse', { params })
    return ok(INFORME_SUBUTILIZACION)
  },
  impacto: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/impact', { params })
    return ok(INFORME_IMPACTO)
  },
  /** Informe fusionado: ausentismo + ranking + impacto económico por recurso */
  ausentismoImpacto: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/absenteeism-impact', { params })
    return ok(INFORME_AUSENTISMO)
  },
  dashboard: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/dashboard', { params })
    return ok(DASH_DIRECTIVO)
  },
  /** Informe Horas programadas vs ejecutadas (HU-D-08) */
  horasProgEjec: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/hours-planned-vs-actual', { params })
    return ok(INFORME_HORAS_PROG_EJEC)
  },
  /** Cumplimiento de cierre de semanas por coordinador (quién/cuándo/a tiempo) */
  cierreSemanas: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/reports/week-closures', { params })
    return ok([])
  },
  /** Comparativo semana actual vs cualquiera de las últimas 52 (HU-D-06) */
  comparativo: async (semanaB) => {
    if (!DEMO_MODE) return api.get('/reports/comparison', { params: { semana_b: semanaB } })
    return ok(COMPARATIVO_SEMANAS)
  },
  exportar: async (tipo, formato, params = {}) => {
    if (!DEMO_MODE) return api.get(`/reports/${tipo}/export`, { params: { formato, ...params }, responseType: 'blob' })
    // RN-34: trazabilidad de exportación
    _auditoria.unshift({
      id: uid(), user_id: useAuthStore.getState().user?.id ?? '?', usuario_nombre: useAuthStore.getState().user?.name ?? '?',
      action: 'exportar_informe', entity: 'informes', entity_id: tipo,
      reason: JSON.stringify({ formato, ...params }), created_at: new Date().toISOString(),
    })
    return fail('La exportación PDF/Excel se habilita al conectar el backend.', 501)
  },
}

// ============ PARÁMETROS DE COSTO (HU-S-04) ============
export const parametroService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/cost-settings')
    return ok(_parametros_costo)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/cost-settings', data)
    const nuevo = { id: uid(), ...data, set_by: useAuthStore.getState().user?.id }
    _parametros_costo.unshift(nuevo)
    _auditoria.unshift({
      id: uid(), user_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.name,
      action: 'crear_parametro_costo', entity: 'parametros_costo', entity_id: nuevo.id,
      reason: '', created_at: new Date().toISOString(),
    })
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/cost-settings/${id}`, data)
    const i = _parametros_costo.findIndex((p) => p.id === id)
    if (i === -1) return fail('Parámetro no encontrado', 404)
    _parametros_costo[i] = { ..._parametros_costo[i], ...data }
    return ok(_parametros_costo[i])
  },
  /** Parámetros del sistema (metas, semáforo, base de horas) */
  sistema: async () => {
    if (!DEMO_MODE) return api.get('/system-settings')
    return ok(_parametros_sistema)
  },
  actualizarSistema: async (data) => {
    if (!DEMO_MODE) return api.put('/system-settings', data)
    const anterior = { ..._parametros_sistema }
    _parametros_sistema = { ..._parametros_sistema, ...data }
    _auditoria.unshift({
      id: uid(), user_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.name,
      action: 'cambiar_parametro_sistema', entity: 'parametros_sistema', entity_id: 'sistema',
      reason: data.reason ?? '', created_at: new Date().toISOString(),
    })
    return ok(_parametros_sistema)
  },
}

// ============ USUARIOS — Admin del Supervisor (HU-S-02) ============
export const usuarioService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/users', { params })
    let list = _usuarios_lista
    if (params.role) list = list.filter((u) => u.role === params.role)
    if (params.active !== undefined) list = list.filter((u) => u.active === params.active)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/users', data)
    const nuevo = { id: uid(), ...data, active: data.active ?? true, last_login_at: null }
    _usuarios_lista.push(nuevo)
    _auditoria.unshift({
      id: uid(), user_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.name,
      action: 'crear_usuario', entity: 'usuarios', entity_id: nuevo.id,
      reason: '', created_at: new Date().toISOString(),
    })
    return ok(nuevo)
  },
  /** Carga masiva — crea N usuarios en una sola request, cada uno con contraseña provisional por email */
  bulkCreate: async (usuarios) => {
    if (!DEMO_MODE) return api.post('/users/bulk', { users: usuarios })
    return ok({ totals: { ok: usuarios.length, failed: 0, total: usuarios.length }, results: usuarios.map((u) => ({ email: u.email, ok: true })) })
  },
  /** Reenvía credenciales — resetea la contraseña a SGRC2026! y dispara email de bienvenida */
  reenviarCredenciales: async (id) => {
    if (!DEMO_MODE) return api.post(`/users/${id}/resend-credentials`)
    return ok({ ok: true, email: 'demo@cofca.com', password: 'SGRC2026!', smtp_activo: false })
  },
  /** Elimina usuario. hard=true intenta borrar fila completa; soft (default) desactiva. */
  remove: async (id, hard = false) => {
    if (!DEMO_MODE) return api.delete(`/users/${id}${hard ? '?hard=true' : ''}`)
    _usuarios_lista = _usuarios_lista.filter((u) => u.id !== id)
    return ok({ ok: true, modo: hard ? 'hard' : 'soft' })
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/users/${id}`, data)
    const i = _usuarios_lista.findIndex((u) => u.id === id)
    if (i === -1) return fail('Usuario no encontrado', 404)
    _usuarios_lista[i] = { ..._usuarios_lista[i], ...data }
    _auditoria.unshift({
      id: uid(), user_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.name,
      action: data.active === false ? 'desactivar_usuario' : 'modificar_usuario',
      entity: 'usuarios', entity_id: id, reason: data.reason ?? '',
      created_at: new Date().toISOString(),
    })
    return ok(_usuarios_lista[i])
  },
  /** Actualiza el perfil del usuario logueado (HU-R-10) */
  actualizarPerfil: async (data) => {
    if (!DEMO_MODE) return api.put('/users/me', data)
    const user = useAuthStore.getState().user
    if (!user) return fail('No autenticado', 401)
    const i = _usuarios_lista.findIndex((u) => u.id === user.id)
    if (i !== -1) _usuarios_lista[i] = { ..._usuarios_lista[i], ...data }
    useAuthStore.getState().login({ ...user, ...data }, useAuthStore.getState().token)
    return ok({ ...user, ...data })
  },
}

// ============ CONSULTORIOS (HU-C-15, HU-S-03) ============
export const consultorioService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/rooms', { params })
    let list = _consultorios
    if (params.site_id) list = list.filter((c) => c.site_id === params.site_id)
    if (params.active !== undefined) list = list.filter((c) => c.active === params.active)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/rooms', data)
    const requiereAux = ['oftalmologia', 'anestesiologia'].includes(data.specialty)
    const nuevo = { id: uid(), ...data, requires_assistant: requiereAux, active: data.active ?? true }
    _consultorios.push(nuevo)
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/rooms/${id}`, data)
    const i = _consultorios.findIndex((c) => c.id === id)
    if (i === -1) return fail('Consultorio no encontrado', 404)
    _consultorios[i] = { ..._consultorios[i], ...data }
    return ok(_consultorios[i])
  },
}

// ============ FESTIVOS (RN-06) ============
export const festivoService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/holidays', { params })
    let list = _festivos
    if (params.desde) list = list.filter((f) => f.date >= params.desde)
    if (params.hasta) list = list.filter((f) => f.date <= params.hasta)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/holidays', data)
    const nuevo = { id: uid(), ...data }
    _festivos.push(nuevo)
    return ok(nuevo)
  },
  remove: async (fecha) => {
    if (!DEMO_MODE) return api.delete(`/holidays/${fecha}`)
    _festivos = _festivos.filter((f) => f.date !== fecha)
    return ok({ ok: true })
  },
  /** Sincroniza el calendario oficial de Colombia (año actual + siguiente) */
  sincronizarColombia: async (body = {}) => {
    if (!DEMO_MODE) return api.post('/holidays/sync-colombia', body)
    return ok({ ok: true, creados: 0, omitidos: 18 })
  },
}

// ============ MOTIVOS DE AUSENCIA (catálogo editable) ============
// Lectura abierta a todo autenticado (el modal de registrar ausencia lo
// consume). Edición restringida en backend a gerencia/supervisor.
export const motivoAusenciaService = {
  list: async (params = {}) => {
    return api.get('/absence-reasons', { params })
  },
  get: async (id) => api.get(`/absence-reasons/${id}`),
  crear: async (data) => api.post('/absence-reasons', data),
  actualizar: async (id, data) => api.put(`/absence-reasons/${id}`, data),
  desactivar: async (id) => api.delete(`/absence-reasons/${id}`),
}

// ============ AUDITORÍA (HU-S-05) ============
export const auditoriaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/audit', { params })
    let list = _auditoria
    if (params.action) list = list.filter((a) => a.action === params.action)
    if (params.user_id) list = list.filter((a) => a.user_id === params.user_id)
    if (params.desde) list = list.filter((a) => a.created_at >= params.desde)
    if (params.hasta) list = list.filter((a) => a.created_at <= params.hasta)
    return ok(list)
  },
}

// ============ HISTORIAL DE AUSENCIAS DEL RECURSO (HU-R-06) ============
export const historialAusenciasService = {
  list: async (recursoId) => {
    if (!DEMO_MODE) return api.get(`/resources/${recursoId}/absences`)
    const propias = _ausencias.filter((a) => a.resource_id === recursoId)
    return ok([...HISTORIAL_AUSENCIAS_RECURSO, ...propias])
  },
}

// ============ REPOSICIONES DE AUSENCIA (Fase 3 · ago-2026) ============
// El profesional propone reponer una ausencia confirmada; coord/gerencia aprueba.
export const reposicionService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/makeups', { params })
    return ok([])
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/makeups', data)
    return ok({ id: uid(), ...data, status: 'solicitada' })
  },
  aprobar: async (id, data = {}) => {
    if (!DEMO_MODE) return api.put(`/makeups/${id}/approve`, data)
    return ok({ id, status: 'aprobada' })
  },
  rechazar: async (id, motivo) => {
    if (!DEMO_MODE) return api.put(`/makeups/${id}/reject`, { reason: motivo })
    return ok({ id, status: 'rechazada' })
  },
  marcarRealizada: async (id) => {
    if (!DEMO_MODE) return api.put(`/makeups/${id}/done`)
    return ok({ id, completed_at: new Date().toISOString() })
  },
}

export const horarioDiarioService = {
  get: async (sedeId, fecha) => {
    if (!DEMO_MODE) return api.get('/daily-schedule', { params: { site_id: sedeId, date: fecha } })
    return ok({ site: { name: 'Demo' }, date: fecha, items: [], resumen: { asignaciones_total: 0 } })
  },
}

// ============ SOLICITUDES DE RECURSO (entre sedes) ============
// Coord pide un recurso a una sede que no le pertenece; supervisor aprueba o rechaza.
export const solicitudRecursoService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/resource-requests', { params })
    return ok([])
  },
  get: async (id) => {
    if (!DEMO_MODE) return api.get(`/resource-requests/${id}`)
    return ok(null)
  },
  crear: async (data) => {
    if (!DEMO_MODE) return api.post('/resource-requests', data)
    return ok(data)
  },
  aprobar: async (id, motivoDecision) => {
    if (!DEMO_MODE) return api.put(`/resource-requests/${id}/approve`, { decisionReason: motivoDecision })
    return ok({ id, status: 'aprobada' })
  },
  rechazar: async (id, motivoDecision) => {
    if (!DEMO_MODE) return api.put(`/resource-requests/${id}/reject`, { decisionReason: motivoDecision })
    return ok({ id, status: 'rechazada' })
  },
  asociarRecurso: async (id, recursoCreadoId) => {
    if (!DEMO_MODE) return api.put(`/resource-requests/${id}/link-resource`, { createdResourceId: recursoCreadoId })
    return ok({ id, status: 'ejecutada' })
  },
  cancelar: async (id) => {
    if (!DEMO_MODE) return api.delete(`/resource-requests/${id}`)
    return ok({ id, status: 'cancelada' })
  },
  countPendientes: async () => {
    if (!DEMO_MODE) return api.get('/resource-requests/count-pending')
    return ok({ count: 0 })
  },
}

export default api
