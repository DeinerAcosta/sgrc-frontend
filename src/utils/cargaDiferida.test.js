import { describe, it, expect, vi, beforeEach } from 'vitest'
import { esErrorDeVersion, recargarUnaVez } from './cargaDiferida'

// 22-oct · pantalla en blanco al entrar a un módulo después de un despliegue.
describe('esErrorDeVersion', () => {
  it('reconoce el fallo de un archivo que ya no existe en el servidor (Chrome, Firefox y Safari)', () => {
    expect(esErrorDeVersion(new TypeError('Failed to fetch dynamically imported module: https://x/assets/SchedulerPage-2Jeg.js'))).toBe(true)
    expect(esErrorDeVersion(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(esErrorDeVersion(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(esErrorDeVersion(new Error('Unable to preload CSS for /assets/index-abc.css'))).toBe(true)
  })

  it('un error normal de la pantalla NO se confunde con eso', () => {
    expect(esErrorDeVersion(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(esErrorDeVersion(null)).toBe(false)
  })
})

describe('recargarUnaVez — nunca en bucle', () => {
  let guardado
  beforeEach(() => {
    guardado = {}
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => guardado[k] ?? null,
      setItem: (k, v) => { guardado[k] = v },
    })
    vi.stubGlobal('window', { location: { reload: vi.fn() } })
  })

  it('la primera vez recarga', () => {
    expect(recargarUnaVez()).toBe(true)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('si ya recargó hace un momento y sigue fallando, no recarga otra vez', () => {
    recargarUnaVez()
    expect(recargarUnaVez()).toBe(false)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('pasados 30 segundos, otro despliegue sí puede recargar', () => {
    guardado['sgrc:recarga-por-version'] = String(Date.now() - 31_000)
    expect(recargarUnaVez()).toBe(true)
  })

  it('sin sessionStorage no recarga (sin candado podría entrar en bucle)', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => {} })
    expect(recargarUnaVez()).toBe(false)
  })
})
