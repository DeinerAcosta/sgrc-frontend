import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createServer } from 'node:http'
import axios from 'axios'

/**
 * Prueba de la renovación automática de sesión contra un servidor HTTP real
 * (node:http, sin dependencias nuevas en el frontend).
 *
 * No se importa api.js porque arrastra mock-data y el store de zustand; lo que
 * se verifica aquí es el ALGORITMO del interceptor, replicado tal cual, que es
 * donde están los riesgos: bucles infinitos, tormenta de renovaciones cuando
 * varias peticiones fallan a la vez, y no reintentar dos veces la misma.
 *
 * El tercer test ya encontró un fallo real: compartir la promesa de renovación
 * no basta, porque las peticiones que siguen en vuelo cuando esa renovación
 * termina lanzan otra cada una. De ahí la comprobación de "el token ya cambió".
 */

let servidor
let base
let tokenValido = 'access-1'
let refreshValido = 'refresh-ok'
const contador = { refresh: 0, protegido: 0 }
let rechazarTodo = false

beforeEach(() => {
  contador.refresh = 0
  contador.protegido = 0
  tokenValido = 'access-1'
  refreshValido = 'refresh-ok'
  rechazarTodo = false
})

afterAll(() => servidor?.close())

const leerCuerpo = (req) =>
  new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) } })
  })

const responder = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(cuerpo))
}

servidor = createServer(async (req, res) => {
  const ruta = req.url.split('?')[0]

  if (ruta === '/api/auth/login') {
    const body = await leerCuerpo(req)
    if (body.password !== 'buena') return responder(res, 401, { message: 'Credenciales incorrectas' })
    return responder(res, 200, { token: tokenValido, refreshToken: refreshValido, user: { id: 'u1' } })
  }

  if (ruta === '/api/auth/refresh') {
    const body = await leerCuerpo(req)
    contador.refresh++
    if (body.refreshToken !== refreshValido) return responder(res, 401, { message: 'Refresh inválido' })
    tokenValido = 'access-2'
    return responder(res, 200, { token: tokenValido })
  }

  if (ruta === '/api/protegido') {
    contador.protegido++
    if (rechazarTodo || req.headers.authorization !== `Bearer ${tokenValido}`) {
      return responder(res, 401, { message: 'Token inválido' })
    }
    return responder(res, 200, { ok: true, visto: req.headers.authorization })
  }

  return responder(res, 404, { message: 'no encontrado' })
})

await new Promise((resolve) => {
  servidor.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}/api`; resolve() })
})

/** Réplica del store de auth, con lo mínimo que toca el interceptor. */
function crearStore(estado) {
  return {
    ...estado,
    logouts: 0,
    setToken(t) { this.token = t },
    logout() { this.token = null; this.refreshToken = null; this.logouts++ },
  }
}

/** Réplica exacta del cableado de api.js. */
function crearCliente(store) {
  const api = axios.create({ baseURL: base, timeout: 5000 })
  const apiSinInterceptores = axios.create({ baseURL: base, timeout: 5000 })
  let renovacionEnCurso = null

  api.interceptors.request.use((config) => {
    if (store.token) config.headers.Authorization = `Bearer ${store.token}`
    return config
  })

  async function renovarToken() {
    if (!store.refreshToken) { store.logout(); return null }
    try {
      const { data } = await apiSinInterceptores.post('/auth/refresh', { refreshToken: store.refreshToken })
      if (!data?.token) throw new Error('sin token')
      store.setToken(data.token)
      return data.token
    } catch { store.logout(); return null }
  }

  api.interceptors.response.use(
    (res) => res.data,
    async (err) => {
      const original = err.config
      const es401 = err.response?.status === 401
      const renovable = es401 && original && !original._reintentado &&
        !String(original.url ?? '').includes('/auth/login') &&
        !String(original.url ?? '').includes('/auth/refresh')

      if (renovable) {
        const tokenActual = store.token
        const enviado = original.headers?.Authorization
        if (tokenActual && enviado && enviado !== `Bearer ${tokenActual}`) {
          original._reintentado = true
          original.headers = { ...original.headers, Authorization: `Bearer ${tokenActual}` }
          return api.request(original)
        }

        renovacionEnCurso = renovacionEnCurso ?? renovarToken().finally(() => { renovacionEnCurso = null })
        const nuevo = await renovacionEnCurso
        if (nuevo) {
          original._reintentado = true
          original.headers = { ...original.headers, Authorization: `Bearer ${nuevo}` }
          return api.request(original)
        }
        return Promise.reject(err.response?.data ?? err)
      }
      if (es401) store.logout()
      return Promise.reject(err.response?.data ?? err)
    }
  )
  return api
}

describe('renovación automática de sesión', () => {
  it('renueva y reintenta cuando el access token ha caducado', async () => {
    const store = crearStore({ token: 'caducado', refreshToken: 'refresh-ok' })
    const api = crearCliente(store)

    const r = await api.get('/protegido')

    expect(r.ok).toBe(true)
    expect(contador.refresh).toBe(1)
    expect(store.token).toBe('access-2')     // el store se quedó con el token nuevo
    expect(store.logouts).toBe(0)            // nadie fue expulsado
    expect(r.visto).toBe('Bearer access-2')  // el reintento llevó el token NUEVO
  })

  it('no renueva si la petición va bien a la primera', async () => {
    const store = crearStore({ token: 'access-1', refreshToken: 'refresh-ok' })
    const api = crearCliente(store)

    await api.get('/protegido')

    expect(contador.refresh).toBe(0)
    expect(contador.protegido).toBe(1)
  })

  it('cinco peticiones simultáneas comparten UNA sola renovación', async () => {
    // Este es el fallo clásico: sin compartir la promesa, cinco 401 a la vez
    // disparan cinco renovaciones y cuatro tokens quedan huérfanos.
    const store = crearStore({ token: 'caducado', refreshToken: 'refresh-ok' })
    const api = crearCliente(store)

    const rs = await Promise.all(Array.from({ length: 5 }, () => api.get('/protegido')))

    expect(rs.every((r) => r.ok)).toBe(true)
    expect(contador.refresh).toBe(1)
    expect(store.logouts).toBe(0)
  })

  it('cierra la sesión si el refresh token ya no vale', async () => {
    const store = crearStore({ token: 'caducado', refreshToken: 'refresh-caducado' })
    const api = crearCliente(store)

    await expect(api.get('/protegido')).rejects.toBeDefined()
    expect(contador.refresh).toBe(1)
    expect(store.logouts).toBe(1)
    expect(store.token).toBe(null)
  })

  it('cierra la sesión si no hay refresh token guardado (sesión antigua)', async () => {
    // Quien ya tuviera sesión abierta antes de este cambio no tiene refreshToken
    // en localStorage. Debe salir limpiamente, no quedarse colgado.
    const store = crearStore({ token: 'caducado', refreshToken: null })
    const api = crearCliente(store)

    await expect(api.get('/protegido')).rejects.toBeDefined()
    expect(contador.refresh).toBe(0)
    expect(store.logouts).toBe(1)
  })

  it('no intenta renovar ante un 401 del login: son credenciales incorrectas', async () => {
    const store = crearStore({ token: null, refreshToken: 'refresh-ok' })
    const api = crearCliente(store)

    await expect(api.post('/auth/login', { password: 'mala' })).rejects.toBeDefined()
    expect(contador.refresh).toBe(0)
  })

  it('no entra en bucle aunque el token renovado tampoco sirva', async () => {
    // Peor caso: el refresh responde 200, pero /protegido sigue devolviendo 401.
    // Sin el guardia _reintentado esto sería un bucle infinito de
    // 401 → refresh → 401 → refresh… hasta agotar el navegador.
    rechazarTodo = true
    const store = crearStore({ token: 'caducado', refreshToken: 'refresh-ok' })
    const api = crearCliente(store)

    await expect(api.get('/protegido')).rejects.toBeDefined()

    expect(contador.refresh).toBe(1)        // una sola renovación
    expect(contador.protegido).toBe(2)      // original + un único reintento
    rechazarTodo = false
  })
})
