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

// Cambiar a false (o setear VITE_API_BASE en .env) cuando el backend esté corriendo.
// El frontend funciona idéntico — solo cambia la fuente de datos.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false'

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
const _usuarios_lista = [...USUARIOS_LISTA]
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

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) useAuthStore.getState().logout()
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
    return ok({ user, token: 'demo-token-' + user.rol }, 350)
  },
  loginAs: async (rol) => {
    // Helper exclusivo de demo — entra directo como un rol
    if (!DEMO_MODE) return fail('Solo disponible en demo')
    const user = USUARIOS[rol] ?? USUARIOS.coordinador
    return ok({ user, token: 'demo-token-' + user.rol }, 150)
  },
  forgotPassword: async (email) => {
    if (!DEMO_MODE) return api.post('/auth/forgot-password', { email })
    return ok({ message: 'Email enviado' }, 400)
  },
  me: async () => {
    if (!DEMO_MODE) return api.get('/usuarios/me')
    const token = useAuthStore.getState().token
    const rol = token?.replace('demo-token-', '') ?? 'coordinador'
    return ok(USUARIOS[rol] ?? USUARIOS.coordinador)
  },
}

// ============ SEDES ============
export const sedeService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/sedes')
    return ok(_sedes)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/sedes', data)
    const nueva = { ...data, id: uid(), activa: data.activa ?? true }
    _sedes.push(nueva)
    return ok(nueva)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/sedes/${id}`, data)
    const i = _sedes.findIndex((s) => s.id === id)
    if (i === -1) return fail('Sede no encontrada', 404)
    _sedes[i] = { ..._sedes[i], ...data }
    return ok(_sedes[i])
  },
  consultorios: async (sedeId) => {
    if (!DEMO_MODE) return api.get(`/sedes/${sedeId}/consultorios`)
    return ok(_consultorios.filter((c) => c.sede_id === sedeId))
  },
}

// ============ RECURSOS ============
export const recursoService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/recursos', { params })
    let list = _recursos
    if (params.tipo) list = list.filter((r) => r.tipo === params.tipo)
    if (params.sede_id) list = list.filter((r) => !r.sede_id || r.sede_id === params.sede_id)
    if (params.activo !== undefined) list = list.filter((r) => r.activo === params.activo)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/recursos', data)
    const nuevo = { ...data, id: uid(), activo: data.activo ?? true }
    _recursos.push(nuevo)
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/recursos/${id}`, data)
    const i = _recursos.findIndex((r) => r.id === id)
    if (i === -1) return fail('Recurso no encontrado', 404)
    _recursos[i] = { ..._recursos[i], ...data }
    return ok(_recursos[i])
  },
  horario: async (recursoId, semanaId) => {
    if (!DEMO_MODE) return api.get(`/recursos/${recursoId}/horario`, { params: { semana_id: semanaId } })
    return ok(_asignaciones.filter((a) =>
      a.semana_id === semanaId &&
      (a.recurso_id === recursoId || a.auxiliar_id === recursoId)
    ))
  },
  liberadas: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/auxiliares/liberadas', { params })
    return ok(_recursos.filter((r) => r.tipo === 'auxiliar' && r.estado_badge === 'liberada'))
  },
  /** Sugiere reemplazos disponibles para una asignación en franja específica (HU-C-12, RN-38) */
  sugerirReemplazos: async ({ tipo, dia, hora_inicio, hora_fin, ciudad, semana_id }) => {
    if (!DEMO_MODE) return api.get('/recursos/sugeridos', { params: { tipo, dia, hora_inicio, hora_fin, ciudad, semana_id } })
    const sedesCiudad = _sedes.filter((s) => s.ciudad === ciudad).map((s) => s.id)
    const candidatos = _recursos.filter((r) => r.tipo === tipo && r.activo)
    const conflicto = (r) => _asignaciones.some((a) =>
      a.semana_id === semana_id && a.dia_semana === dia &&
      (a.recurso_id === r.id || a.auxiliar_id === r.id) &&
      !(hora_fin <= a.hora_inicio || hora_inicio >= a.hora_fin)
    )
    return ok(candidatos.filter((r) => !conflicto(r)).map((r) => ({
      ...r,
      misma_sede: r.sede_id ? sedesCiudad.includes(r.sede_id) : true,
    })))
  },
  /** Productividad personal del recurso (HU-R-08) */
  productividad: async (recursoId) => {
    if (!DEMO_MODE) return api.get(`/recursos/${recursoId}/productividad`)
    return ok(PRODUCTIVIDAD_RECURSO)
  },
}

// ============ SEMANAS ============
export const semanaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/semanas', { params })
    return ok(_semanas)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/semanas', data)
    const fechaInicio = new Date(data.fecha_inicio)
    const diff = (fechaInicio - new Date()) / (1000 * 60 * 60 * 24)
    if (diff < 3) return fail('La programación debe crearse con al menos 3 días de anticipación', 400)
    const fechaFin = new Date(fechaInicio); fechaFin.setDate(fechaFin.getDate() + 6)
    const nueva = {
      id: uid(),
      fecha_inicio: data.fecha_inicio,
      fecha_fin: fechaFin.toISOString().slice(0, 10),
      estado: 'abierta',
    }
    _semanas.push(nueva)
    return ok(nueva)
  },
  cerrar: async (id) => {
    if (!DEMO_MODE) return api.put(`/semanas/${id}/cerrar`)
    const i = _semanas.findIndex((s) => s.id === id)
    if (i === -1) return fail('Semana no encontrada', 404)
    _semanas[i] = { ..._semanas[i], estado: 'cerrada', cerrada_en: new Date().toISOString() }
    return ok(_semanas[i])
  },
  copiar: async (id, nuevaFecha) => {
    if (!DEMO_MODE) return api.post(`/semanas/${id}/copiar`, { fecha_inicio: nuevaFecha })
    return ok({ id: uid(), fecha_inicio: nuevaFecha, estado: 'abierta', copiada_de: id })
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
  a.semana_id === semanaId && a.dia_semana === dia &&
  !(hf <= a.hora_inicio || hi >= a.hora_fin)

const validarAsignacion = (data, currentUserRol) => {
  const semana = _semanas.find((s) => s.id === data.semana_id)

  // RN-08 / Validación 1: Semana abierta (o supervisor)
  if (semana?.estado === 'cerrada' && currentUserRol !== 'supervisor') {
    return { status: 403, message: 'No tienes permiso para modificar esta semana — está cerrada' }
  }

  const recurso = _recursos.find((r) => r.id === data.recurso_id)
  const consultorio = _consultorios.find((c) => c.id === data.consultorio_id)
  const sedeAsign = _sedes.find((s) => s.id === consultorio?.sede_id)

  // Validación 2: Recurso libre en franja ese día (cualquier consultorio)
  const conflictoRecurso = _asignaciones.find((a) =>
    solapaFranja(a, data.dia_semana, data.hora_inicio, data.hora_fin, data.semana_id) &&
    (a.recurso_id === data.recurso_id || a.auxiliar_id === data.recurso_id) &&
    a.id !== data.id
  )
  if (conflictoRecurso) {
    const c = _consultorios.find((x) => x.id === conflictoRecurso.consultorio_id)
    return { status: 409, message: `Conflicto: ${recurso?.nombre} ya está asignado en ${c?.nombre} de ${conflictoRecurso.hora_inicio} a ${conflictoRecurso.hora_fin}` }
  }

  // RN-09 / Validación 3: Ciudad única ese día
  const otraAsigEseDia = _asignaciones.find((a) =>
    a.semana_id === data.semana_id && a.dia_semana === data.dia_semana &&
    (a.recurso_id === data.recurso_id || a.auxiliar_id === data.recurso_id) &&
    a.id !== data.id
  )
  if (otraAsigEseDia) {
    const cOtra = _consultorios.find((x) => x.id === otraAsigEseDia.consultorio_id)
    const sOtra = _sedes.find((s) => s.id === cOtra?.sede_id)
    if (sOtra && sedeAsign && sOtra.ciudad !== sedeAsign.ciudad) {
      return { status: 409, message: `${recurso?.nombre} no puede estar en dos ciudades el mismo día (${sOtra.ciudad} y ${sedeAsign.ciudad})` }
    }
  }

  // Validación 4: Auxiliar libre (si aplica)
  if (data.auxiliar_id && consultorio?.requiere_auxiliar) {
    const conflictoAux = _asignaciones.find((a) =>
      solapaFranja(a, data.dia_semana, data.hora_inicio, data.hora_fin, data.semana_id) &&
      (a.auxiliar_id === data.auxiliar_id || a.recurso_id === data.auxiliar_id) &&
      a.id !== data.id
    )
    if (conflictoAux) {
      const aux = _recursos.find((x) => x.id === data.auxiliar_id)
      const c = _consultorios.find((x) => x.id === conflictoAux.consultorio_id)
      return { status: 409, message: `Conflicto de auxiliar: ${aux?.nombre} ya está asignada en ${c?.nombre} en esa franja` }
    }
  }

  // RN-13 / Validación 5: ≤10h diarias
  const horasNueva = horasDeFranja(data.hora_inicio, data.hora_fin)
  const horasDia = _asignaciones
    .filter((a) => a.semana_id === data.semana_id && a.dia_semana === data.dia_semana &&
      (a.recurso_id === data.recurso_id || a.auxiliar_id === data.recurso_id) && a.id !== data.id)
    .reduce((acc, a) => acc + horasDeFranja(a.hora_inicio, a.hora_fin), 0)
  if (horasDia + horasNueva > (recurso?.horas_max_dia ?? 10)) {
    return { status: 400, message: `${recurso?.nombre} superaría el máximo de ${recurso?.horas_max_dia ?? 10} horas diarias (lleva ${horasDia}h, suma ${horasNueva}h)` }
  }

  // RN-13 / Validación 6: >42h semanales → flag, NO bloquea
  const horasSemana = _asignaciones
    .filter((a) => a.semana_id === data.semana_id &&
      (a.recurso_id === data.recurso_id || a.auxiliar_id === data.recurso_id) && a.id !== data.id)
    .reduce((acc, a) => acc + horasDeFranja(a.hora_inicio, a.hora_fin), 0)
  const esHorasExtras = (horasSemana + horasNueva) > (recurso?.horas_max_semana ?? 42)

  // RN-13: detectar horas nocturnas (>= 18:00)
  const tieneNocturna = data.hora_fin > '18:00' || data.hora_inicio >= '18:00'

  return { ok: true, esHorasExtras, tieneNocturna }
}

export const asignacionService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/asignaciones', { params })
    let list = _asignaciones
    if (params.semana_id) list = list.filter((a) => a.semana_id === params.semana_id)
    if (params.sede_id) {
      const idsCons = _consultorios.filter((c) => c.sede_id === params.sede_id).map((c) => c.id)
      list = list.filter((a) => idsCons.includes(a.consultorio_id))
    }
    if (params.recurso_id) {
      list = list.filter((a) => a.recurso_id === params.recurso_id || a.auxiliar_id === params.recurso_id)
    }
    return ok(list)
  },
  create: async (data, currentUserRol = 'coordinador') => {
    if (!DEMO_MODE) return api.post('/asignaciones', data)
    const v = validarAsignacion(data, currentUserRol)
    if (v.status) return fail(v.message, v.status)

    // HU-S-01: supervisor que modifica semana cerrada requiere motivo
    const semana = _semanas.find((s) => s.id === data.semana_id)
    if (semana?.estado === 'cerrada' && currentUserRol === 'supervisor') {
      if (!data.motivo_supervisor || data.motivo_supervisor.trim().length < 5) {
        return fail('Modificar una semana cerrada requiere un motivo (mínimo 5 caracteres)', 400)
      }
      _auditoria.unshift({
        id: uid(), usuario_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.nombre,
        accion: 'modificar_semana_cerrada', entidad: 'asignaciones', entidad_id: '(nueva)',
        motivo: data.motivo_supervisor, creada_en: new Date().toISOString(),
      })
    }

    // RN-11: cálculo de capacidad de pacientes
    const recurso = _recursos.find((r) => r.id === data.recurso_id)
    const min = horasDeFranja(data.hora_inicio, data.hora_fin) * 60
    const almuerzo = min >= 360 ? 60 : 0
    const intervalo = recurso?.intervalo_minutos ?? 15
    const pacientesCapacidad = Math.floor((min - almuerzo) / intervalo)

    const nueva = {
      ...data,
      id: uid(),
      pacientes_capacidad: pacientesCapacidad,
      es_horas_extras: v.esHorasExtras,
      tiene_horas_nocturnas: v.tieneNocturna,
      recurso: _recursos.find((r) => r.id === data.recurso_id),
      recurso_principal: _recursos.find((r) => r.id === data.recurso_id),
      consultorio: _consultorios.find((c) => c.id === data.consultorio_id),
      auxiliar: data.auxiliar_id ? _recursos.find((r) => r.id === data.auxiliar_id) : null,
    }
    _asignaciones.push(nueva)

    // Acciones post-inserción: actualizar acumulado de horas del recurso
    const ri = _recursos.findIndex((r) => r.id === data.recurso_id)
    if (ri !== -1) {
      const total = _asignaciones
        .filter((a) => a.semana_id === data.semana_id &&
          (a.recurso_id === data.recurso_id || a.auxiliar_id === data.recurso_id))
        .reduce((acc, a) => acc + horasDeFranja(a.hora_inicio, a.hora_fin), 0)
      _recursos[ri] = { ..._recursos[ri], horas_asignadas: total, es_horas_extras: v.esHorasExtras }
    }
    return ok(nueva)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/asignaciones/${id}`, data)
    const i = _asignaciones.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    _asignaciones[i] = { ..._asignaciones[i], ...data }
    return ok(_asignaciones[i])
  },
  remove: async (id) => {
    if (!DEMO_MODE) return api.delete(`/asignaciones/${id}`)
    // RN-17: si tiene ejecución registrada, no eliminar — marcar como cancelada
    const conEjec = _ejecuciones.some((e) => e.asignacion_id === id)
    if (conEjec) {
      const i = _asignaciones.findIndex((a) => a.id === id)
      if (i !== -1) _asignaciones[i] = { ..._asignaciones[i], estado: 'cancelada' }
      return ok({ ok: true, cancelada: true })
    }
    _asignaciones = _asignaciones.filter((a) => a.id !== id)
    return ok({ ok: true })
  },
}

// ============ AUSENCIAS ============
export const ausenciaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/ausencias', { params })
    let list = _ausencias
    if (params.estado) list = list.filter((a) => a.estado === params.estado)
    if (params.recurso_id) list = list.filter((a) => a.recurso_id === params.recurso_id)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/ausencias', data)
    const nueva = {
      ...data,
      id: uid(),
      estado: 'pendiente',
      recurso: RECURSOS.find((r) => r.id === data.recurso_id),
      reportado_en: new Date().toISOString(),
    }
    _ausencias.unshift(nueva)
    return ok(nueva)
  },
  confirmar: async (id, data = {}) => {
    if (!DEMO_MODE) return api.put(`/ausencias/${id}/confirmar`, data)
    const i = _ausencias.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    const ausencia = _ausencias[i]
    const recurso = _recursos.find((r) => r.id === ausencia.recurso_id)

    // RN-18: calcular impacto día a día
    const fechas = []
    const fechaInicio = new Date(ausencia.fecha_inicio)
    const fechaFin = new Date(ausencia.fecha_fin)
    const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
    for (let d = new Date(fechaInicio); d <= fechaFin; d.setDate(d.getDate() + 1)) {
      fechas.push({ fecha: d.toISOString().slice(0, 10), dia: dias[d.getDay()] })
    }
    let pacientesImpactados = 0
    let costoOportunidad = 0
    const impactoPorDia = fechas.map(({ fecha, dia }) => {
      const asigsDia = _asignaciones.filter((a) => a.recurso_id === ausencia.recurso_id && a.dia_semana === dia)
      // RN-19: ausencia parcial — calcular impacto proporcional al tiempo de ausencia
      const factorParcial = (ausencia.es_parcial && ausencia.hora_inicio_ausencia && ausencia.hora_fin_ausencia)
        ? (() => {
            const [h1, m1] = ausencia.hora_inicio_ausencia.split(':').map(Number)
            const [h2, m2] = ausencia.hora_fin_ausencia.split(':').map(Number)
            const minAus = (h2 * 60 + m2) - (h1 * 60 + m1)
            return minAus / 600 // proporción aprox sobre 10h
          })()
        : 1
      const pacDia = Math.round(asigsDia.reduce((acc, a) => acc + (a.pacientes_capacidad ?? 0), 0) * factorParcial)
      pacientesImpactados += pacDia
      const costoDia = asigsDia.reduce((acc, a) => {
        const cons = _consultorios.find((c) => c.id === a.consultorio_id)
        const param = _parametros_costo.find((p) => p.tipo_consulta === cons?.especialidad)
        return acc + Math.round((a.pacientes_capacidad ?? 0) * (param?.costo_cita ?? 0) * factorParcial)
      }, 0)
      costoOportunidad += costoDia
      return { fecha, dia, pacientes: pacDia, costo: costoDia, cubierta: false, parcial: ausencia.es_parcial }
    })

    // RN-24: liberar auxiliares de oftalmólogos/anestesiólogos ausentes
    if (recurso && (recurso.tipo === 'oftalmologo' || recurso.tipo === 'anestesiologo')) {
      _asignaciones.forEach((a, idx) => {
        if (a.recurso_id === ausencia.recurso_id && a.auxiliar_id) {
          const auxIdx = _recursos.findIndex((r) => r.id === a.auxiliar_id)
          if (auxIdx !== -1) {
            _recursos[auxIdx] = { ..._recursos[auxIdx], estado_badge: 'liberada' }
          }
          _asignaciones[idx] = { ...a, estado: 'sin_cobertura' }
        }
      })
    }

    _ausencias[i] = {
      ...ausencia,
      estado: 'confirmada',
      pacientes_impactados: pacientesImpactados,
      costo_oportunidad: costoOportunidad,
      impacto_por_dia: impactoPorDia,
      ...data,
      confirmado_en: new Date().toISOString(),
    }
    return ok(_ausencias[i])
  },
  rechazar: async (id, motivo) => {
    if (!DEMO_MODE) return api.put(`/ausencias/${id}/rechazar`, { motivo })
    // RN-20: motivo obligatorio
    if (!motivo || motivo.trim().length < 5) {
      return fail('El motivo del rechazo es obligatorio (mínimo 5 caracteres)', 400)
    }
    const i = _ausencias.findIndex((a) => a.id === id)
    if (i === -1) return fail('No encontrada', 404)
    _ausencias[i] = { ..._ausencias[i], estado: 'rechazada', motivo_rechazo: motivo, rechazado_en: new Date().toISOString() }
    return ok(_ausencias[i])
  },
}

// ============ EJECUCIÓN ============
export const ejecucionService = {
  /** Lista ejecuciones por filtros (ej. semana_id, sede_id, dia) */
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/ejecucion', { params })
    let list = _ejecuciones.map((e) => ({
      ...e,
      asignacion: _asignaciones.find((a) => a.id === e.asignacion_id),
    }))
    if (params.semana_id) list = list.filter((e) => e.asignacion?.semana_id === params.semana_id)
    if (params.dia) list = list.filter((e) => e.asignacion?.dia_semana === params.dia)
    if (params.sede_id) {
      const idsCons = _consultorios.filter((c) => c.sede_id === params.sede_id).map((c) => c.id)
      list = list.filter((e) => e.asignacion && idsCons.includes(e.asignacion.consultorio_id))
    }
    return ok(list)
  },
  /** Asignaciones que aún no tienen ejecución registrada para un día */
  pendientesDelDia: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/ejecucion/pendientes', { params })
    const asigs = _asignaciones.filter((a) =>
      a.semana_id === params.semana_id && a.dia_semana === params.dia
    )
    return ok(asigs.map((a) => ({
      ...a,
      ejecucion: _ejecuciones.find((e) => e.asignacion_id === a.id) || null,
    })))
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/ejecucion', data)
    const nueva = {
      id: uid(),
      ...data,
      registrado_en: new Date().toISOString(),
      bloqueado: false,
    }
    // Si ya existe ejecución para esa asignación, actualizar
    const i = _ejecuciones.findIndex((e) => e.asignacion_id === data.asignacion_id)
    if (i !== -1) {
      _ejecuciones[i] = { ..._ejecuciones[i], ...data, registrado_en: new Date().toISOString() }
      return ok(_ejecuciones[i])
    }
    _ejecuciones.push(nueva)
    return ok(nueva)
  },
  /** Guardar batch (todas las del día) */
  saveDay: async (registros) => {
    if (!DEMO_MODE) return api.post('/ejecucion/batch', { registros })
    registros.forEach((data) => {
      const i = _ejecuciones.findIndex((e) => e.asignacion_id === data.asignacion_id)
      if (i !== -1) {
        _ejecuciones[i] = { ..._ejecuciones[i], ...data, registrado_en: new Date().toISOString() }
      } else {
        _ejecuciones.push({ id: uid(), ...data, registrado_en: new Date().toISOString(), bloqueado: false })
      }
    })
    return ok({ count: registros.length })
  },
  get: async (asignacionId) => {
    if (!DEMO_MODE) return api.get('/ejecucion', { params: { asignacion_id: asignacionId } })
    return ok(_ejecuciones.find((e) => e.asignacion_id === asignacionId) ?? null)
  },
}

// ============ BACKOFFICE (RN-36, RN-37) ============
export const backofficeService = {
  /** Catálogo de tareas de backoffice activas */
  tareas: async () => {
    if (!DEMO_MODE) return api.get('/tareas-backoffice')
    return ok(_tareas_backoffice.filter((t) => t.activa))
  },
  /** CRUD del catálogo — solo supervisor (HU-S-06) */
  tareasAll: async () => {
    if (!DEMO_MODE) return api.get('/tareas-backoffice', { params: { all: true } })
    return ok(_tareas_backoffice)
  },
  tareaCreate: async (data) => {
    if (!DEMO_MODE) return api.post('/tareas-backoffice', data)
    const nueva = { id: uid(), ...data, activa: data.activa ?? true, creada_por: 'u4' }
    _tareas_backoffice.push(nueva)
    return ok(nueva)
  },
  tareaUpdate: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/tareas-backoffice/${id}`, data)
    const i = _tareas_backoffice.findIndex((t) => t.id === id)
    if (i === -1) return fail('Tarea no encontrada', 404)
    _tareas_backoffice[i] = { ..._tareas_backoffice[i], ...data }
    return ok(_tareas_backoffice[i])
  },
  /** Lista asignaciones backoffice */
  asignacionesList: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/asignaciones-backoffice', { params })
    let list = _asignaciones_backoffice
    if (params.auxiliar_id) list = list.filter((a) => a.auxiliar_id === params.auxiliar_id)
    if (params.sede_id) list = list.filter((a) => a.sede_id === params.sede_id)
    if (params.dia) list = list.filter((a) => a.dia === params.dia)
    return ok(list)
  },
  /** Asignar auxiliar liberada a tarea de backoffice (HU-C-17, RN-36) */
  asignar: async (data) => {
    if (!DEMO_MODE) return api.post('/asignaciones-backoffice', data)
    const aux = _recursos.find((r) => r.id === data.auxiliar_id)
    const tarea = _tareas_backoffice.find((t) => t.id === data.tarea_backoffice_id)
    const sede = _sedes.find((s) => s.id === data.sede_id)
    // Validar que no supere su límite diario
    const horasDia = _asignaciones_backoffice
      .filter((a) => a.auxiliar_id === data.auxiliar_id && a.dia === data.dia)
      .reduce((acc, a) => acc + horasDeFranja(a.hora_inicio, a.hora_fin), 0)
    const horasNueva = horasDeFranja(data.hora_inicio, data.hora_fin)
    if (horasDia + horasNueva > (aux?.horas_max_dia ?? 10)) {
      return fail(`${aux?.nombre} superaría su límite de ${aux?.horas_max_dia ?? 10}h diarias`, 400)
    }
    const nueva = { ...data, id: uid(), auxiliar: aux, tarea, sede }
    _asignaciones_backoffice.push(nueva)
    return ok(nueva)
  },
  /** Lista ejecuciones backoffice */
  ejecucionList: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/ejecucion-backoffice', { params })
    let list = _ejecucion_backoffice.map((e) => ({
      ...e,
      asignacion: _asignaciones_backoffice.find((a) => a.id === e.asignacion_backoffice_id),
    }))
    if (params.auxiliar_id) list = list.filter((e) => e.asignacion?.auxiliar_id === params.auxiliar_id)
    return ok(list)
  },
  /** La auxiliar registra sus tareas completadas (HU-R-11, RN-37) */
  registrar: async (data) => {
    if (!DEMO_MODE) return api.post('/ejecucion-backoffice', data)
    const nueva = { id: uid(), ...data, registrado_en: new Date().toISOString() }
    _ejecucion_backoffice.push(nueva)
    return ok(nueva)
  },
  /** Asignaciones pendientes de ejecutar para una auxiliar hoy */
  pendientesAuxiliar: async (auxiliarId) => {
    if (!DEMO_MODE) return api.get(`/asignaciones-backoffice/pendientes/${auxiliarId}`)
    const hoy = new Date().toISOString().slice(0, 10)
    const asigs = _asignaciones_backoffice.filter((a) => a.auxiliar_id === auxiliarId && a.dia === hoy)
    return ok(asigs.map((a) => ({
      ...a,
      tarea: _tareas_backoffice.find((t) => t.id === a.tarea_backoffice_id),
      sede: _sedes.find((s) => s.id === a.sede_id),
      ejecuciones: _ejecucion_backoffice.filter((e) => e.asignacion_backoffice_id === a.id),
    })))
  },
}

// ============ NOTIFICACIONES ============
export const notificacionService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/notificaciones')
    return ok(_notificaciones)
  },
  leer: async (id) => {
    if (!DEMO_MODE) return api.put(`/notificaciones/${id}/leer`)
    const i = _notificaciones.findIndex((n) => n.id === id)
    if (i !== -1) _notificaciones[i] = { ..._notificaciones[i], leida: true }
    return ok({ ok: true })
  },
  leerTodas: async () => {
    if (!DEMO_MODE) return api.put('/notificaciones/leer-todas')
    _notificaciones = _notificaciones.map((n) => ({ ...n, leida: true }))
    return ok({ ok: true })
  },
}

// ============ INFORMES ============
// Devuelven array directo (el InformePage consume `data.length` y `data.map`).
// Aceptan params (desde, hasta, sede_id, tipo_recurso) que se pasan como query
// string al backend. En modo demo los mocks son fijos y los params se ignoran.
export const informeService = {
  ocupacion: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/ocupacion', { params })
    return ok(INFORME_OCUPACION)
  },
  productividad: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/productividad', { params })
    return ok(INFORME_PRODUCTIVIDAD)
  },
  ausentismo: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/ausentismo', { params })
    return ok(INFORME_AUSENTISMO)
  },
  subutilizacion: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/subutilizacion', { params })
    return ok(INFORME_SUBUTILIZACION)
  },
  impacto: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/impacto', { params })
    return ok(INFORME_IMPACTO)
  },
  /** Informe fusionado: ausentismo + ranking + impacto económico por recurso */
  ausentismoImpacto: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/ausentismo-impacto', { params })
    return ok(INFORME_AUSENTISMO)
  },
  dashboard: async () => {
    if (!DEMO_MODE) return api.get('/informes/dashboard')
    return ok(DASH_DIRECTIVO)
  },
  /** Informe Horas programadas vs ejecutadas (HU-D-08) */
  horasProgEjec: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/horas-prog-ejec', { params })
    return ok(INFORME_HORAS_PROG_EJEC)
  },
  /** Cumplimiento de cierre de semanas por coordinador (quién/cuándo/a tiempo) */
  cierreSemanas: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/informes/cierre-semanas', { params })
    return ok([])
  },
  /** Comparativo semana actual vs cualquiera de las últimas 52 (HU-D-06) */
  comparativo: async (semanaB) => {
    if (!DEMO_MODE) return api.get('/informes/comparativo', { params: { semana_b: semanaB } })
    return ok(COMPARATIVO_SEMANAS)
  },
  exportar: async (tipo, formato, params = {}) => {
    if (!DEMO_MODE) return api.get(`/informes/${tipo}/export`, { params: { formato, ...params }, responseType: 'blob' })
    // RN-34: trazabilidad de exportación
    _auditoria.unshift({
      id: uid(), usuario_id: useAuthStore.getState().user?.id ?? '?', usuario_nombre: useAuthStore.getState().user?.nombre ?? '?',
      accion: 'exportar_informe', entidad: 'informes', entidad_id: tipo,
      motivo: JSON.stringify({ formato, ...params }), creada_en: new Date().toISOString(),
    })
    return fail('La exportación PDF/Excel se habilita al conectar el backend.', 501)
  },
}

// ============ PARÁMETROS DE COSTO (HU-S-04) ============
export const parametroService = {
  list: async () => {
    if (!DEMO_MODE) return api.get('/parametros-costo')
    return ok(_parametros_costo)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/parametros-costo', data)
    const nuevo = { id: uid(), ...data, configurado_por: useAuthStore.getState().user?.id }
    _parametros_costo.unshift(nuevo)
    _auditoria.unshift({
      id: uid(), usuario_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.nombre,
      accion: 'crear_parametro_costo', entidad: 'parametros_costo', entidad_id: nuevo.id,
      motivo: '', creada_en: new Date().toISOString(),
    })
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/parametros-costo/${id}`, data)
    const i = _parametros_costo.findIndex((p) => p.id === id)
    if (i === -1) return fail('Parámetro no encontrado', 404)
    _parametros_costo[i] = { ..._parametros_costo[i], ...data }
    return ok(_parametros_costo[i])
  },
  /** Parámetros del sistema (metas, semáforo, base de horas) */
  sistema: async () => {
    if (!DEMO_MODE) return api.get('/parametros-sistema')
    return ok(_parametros_sistema)
  },
  actualizarSistema: async (data) => {
    if (!DEMO_MODE) return api.put('/parametros-sistema', data)
    const anterior = { ..._parametros_sistema }
    _parametros_sistema = { ..._parametros_sistema, ...data }
    _auditoria.unshift({
      id: uid(), usuario_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.nombre,
      accion: 'cambiar_parametro_sistema', entidad: 'parametros_sistema', entidad_id: 'sistema',
      motivo: data.motivo ?? '', creada_en: new Date().toISOString(),
    })
    return ok(_parametros_sistema)
  },
}

// ============ USUARIOS — Admin del Supervisor (HU-S-02) ============
export const usuarioService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/usuarios', { params })
    let list = _usuarios_lista
    if (params.rol) list = list.filter((u) => u.rol === params.rol)
    if (params.activo !== undefined) list = list.filter((u) => u.activo === params.activo)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/usuarios', data)
    const nuevo = { id: uid(), ...data, activo: data.activo ?? true, ultimo_login: null }
    _usuarios_lista.push(nuevo)
    _auditoria.unshift({
      id: uid(), usuario_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.nombre,
      accion: 'crear_usuario', entidad: 'usuarios', entidad_id: nuevo.id,
      motivo: '', creada_en: new Date().toISOString(),
    })
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/usuarios/${id}`, data)
    const i = _usuarios_lista.findIndex((u) => u.id === id)
    if (i === -1) return fail('Usuario no encontrado', 404)
    _usuarios_lista[i] = { ..._usuarios_lista[i], ...data }
    _auditoria.unshift({
      id: uid(), usuario_id: useAuthStore.getState().user?.id, usuario_nombre: useAuthStore.getState().user?.nombre,
      accion: data.activo === false ? 'desactivar_usuario' : 'modificar_usuario',
      entidad: 'usuarios', entidad_id: id, motivo: data.motivo ?? '',
      creada_en: new Date().toISOString(),
    })
    return ok(_usuarios_lista[i])
  },
  /** Actualiza el perfil del usuario logueado (HU-R-10) */
  actualizarPerfil: async (data) => {
    if (!DEMO_MODE) return api.put('/usuarios/me', data)
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
    if (!DEMO_MODE) return api.get('/consultorios', { params })
    let list = _consultorios
    if (params.sede_id) list = list.filter((c) => c.sede_id === params.sede_id)
    if (params.activo !== undefined) list = list.filter((c) => c.activo === params.activo)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/consultorios', data)
    const requiereAux = ['oftalmologia', 'anestesiologia'].includes(data.especialidad)
    const nuevo = { id: uid(), ...data, requiere_auxiliar: requiereAux, activo: data.activo ?? true }
    _consultorios.push(nuevo)
    return ok(nuevo)
  },
  update: async (id, data) => {
    if (!DEMO_MODE) return api.put(`/consultorios/${id}`, data)
    const i = _consultorios.findIndex((c) => c.id === id)
    if (i === -1) return fail('Consultorio no encontrado', 404)
    _consultorios[i] = { ..._consultorios[i], ...data }
    return ok(_consultorios[i])
  },
}

// ============ FESTIVOS (RN-06) ============
export const festivoService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/festivos', { params })
    let list = _festivos
    if (params.desde) list = list.filter((f) => f.fecha >= params.desde)
    if (params.hasta) list = list.filter((f) => f.fecha <= params.hasta)
    return ok(list)
  },
  create: async (data) => {
    if (!DEMO_MODE) return api.post('/festivos', data)
    const nuevo = { id: uid(), ...data }
    _festivos.push(nuevo)
    return ok(nuevo)
  },
  remove: async (fecha) => {
    if (!DEMO_MODE) return api.delete(`/festivos/${fecha}`)
    _festivos = _festivos.filter((f) => f.fecha !== fecha)
    return ok({ ok: true })
  },
}

// ============ AUDITORÍA (HU-S-05) ============
export const auditoriaService = {
  list: async (params = {}) => {
    if (!DEMO_MODE) return api.get('/auditoria', { params })
    let list = _auditoria
    if (params.accion) list = list.filter((a) => a.accion === params.accion)
    if (params.usuario_id) list = list.filter((a) => a.usuario_id === params.usuario_id)
    if (params.desde) list = list.filter((a) => a.creada_en >= params.desde)
    if (params.hasta) list = list.filter((a) => a.creada_en <= params.hasta)
    return ok(list)
  },
}

// ============ HISTORIAL DE AUSENCIAS DEL RECURSO (HU-R-06) ============
export const historialAusenciasService = {
  list: async (recursoId) => {
    if (!DEMO_MODE) return api.get(`/recursos/${recursoId}/ausencias`)
    const propias = _ausencias.filter((a) => a.recurso_id === recursoId)
    return ok([...HISTORIAL_AUSENCIAS_RECURSO, ...propias])
  },
}

export default api
