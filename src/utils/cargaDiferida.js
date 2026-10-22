import { lazy } from 'react'

// ============================================================================
// PANTALLA EN BLANCO TRAS UN DESPLIEGUE (22-oct)
// ============================================================================
// Cada página es un archivo aparte con hash en el nombre (SchedulerPage-2Jeg…js).
// Al desplegar, el servidor deja solo los de la versión nueva. Quien tenía la
// app abierta sigue con la versión vieja en memoria: al entrar a otro módulo
// pide un archivo que ya no existe (404), el import falla y, sin nada que lo
// atrape, React desmonta todo y queda la pantalla en blanco. Recargando, sí
// carga — que es justo lo que reportaron.
//
// Arreglo: si el fallo es de ese tipo, recargar UNA vez para tomar la versión
// nueva. El candado en sessionStorage evita un bucle de recargas si el archivo
// faltara de verdad (ahí lo atrapa PantallaConError y muestra "Recargar").

const CLAVE = 'sgrc:recarga-por-version'
const VENTANA_MS = 30_000

export function esErrorDeVersion(err) {
  const msg = String(err?.message ?? err ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk/i.test(msg)
}

/** Recarga la página si no se recargó por lo mismo hace menos de 30 s. Devuelve si recargó. */
export function recargarUnaVez() {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) || 0)
    if (Date.now() - ultima < VENTANA_MS) return false
    sessionStorage.setItem(CLAVE, String(Date.now()))
  } catch {
    // Sin sessionStorage (modo privado estricto) no hay candado: mejor no recargar.
    return false
  }
  window.location.reload()
  return true
}

/** Igual que React.lazy, pero si el archivo es de una versión que ya no existe, recarga. */
export function lazyConReintento(cargar) {
  return lazy(() =>
    cargar().catch((err) => {
      // Promesa que no resuelve: el Suspense sigue mostrando "Cargando…" mientras recarga.
      if (esErrorDeVersion(err) && recargarUnaVez()) return new Promise(() => {})
      throw err
    }),
  )
}
