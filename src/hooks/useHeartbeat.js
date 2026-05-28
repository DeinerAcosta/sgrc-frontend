import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

const INTERVAL_MS = 30_000 // 30 segundos

/**
 * Long-polling de presencia. Mientras el usuario está autenticado y la pestaña
 * está activa, hace ping cada 30s al endpoint /usuarios/me/heartbeat para que
 * el backend marque ultima_actividad. Cualquier usuario con ultima_actividad
 * dentro de los últimos 60s aparece como "en línea" en los listados.
 *
 * Se monta una sola vez en AppLayout y se desmonta al cerrar sesión.
 */
export function useHeartbeat() {
  const { isAuthenticated, token } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !token) return

    let timer = null
    let cancelled = false

    const enviar = async () => {
      try {
        const base = import.meta.env.VITE_API_BASE || '/api'
        await fetch(`${base}/usuarios/me/heartbeat`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch { /* sin internet o backend caído — silencioso, retry el próximo tick */ }
    }

    // Ping inicial inmediato y luego cada INTERVAL_MS
    enviar()
    timer = setInterval(() => {
      if (!cancelled && document.visibilityState === 'visible') enviar()
    }, INTERVAL_MS)

    // Cuando vuelve el foco a la pestaña, ping inmediato (para no esperar 30s)
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) enviar()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isAuthenticated, token])
}
