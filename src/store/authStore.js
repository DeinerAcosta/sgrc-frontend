import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Sesión del usuario, persistida en localStorage por zustand/persist.
 *
 * DECISIÓN ASUMIDA (B-5): el token vive en localStorage, así que es accesible a
 * cualquier XSS. La alternativa correcta es una cookie httpOnly + SameSite, pero
 * eso obliga a rehacer CORS, el login y el flujo de renovación entero.
 *
 * Mitigaciones en pie mientras se mantenga esta decisión:
 *   - CSP restrictiva en producción (backend/src/index.js), que es lo que impide
 *     que un script inyectado se ejecute.
 *   - El access token dura 8h y el backend revalida al usuario contra la base
 *     cada 60s (middleware/auth.js): un token robado deja de servir en cuanto
 *     se desactiva la cuenta.
 *
 * Si algún día se cambia a cookie httpOnly, el refreshToken de aquí desaparece.
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      // El backend emite un refresh token de 7 días junto al access de 8h, pero
      // hasta ahora se descartaba: al expirar el access, el interceptor cerraba
      // la sesión de golpe y el coordinador perdía la programación a medias.
      // Guardándolo, api.js puede renovar la sesión sin sacar a nadie.
      refreshToken: null,
      isAuthenticated: false,

      login: (user, token, refreshToken = null) =>
        set({ user, token, refreshToken, isAuthenticated: true }),

      /** Sustituye solo el access token (lo usa la renovación automática). */
      setToken: (token) => set({ token }),

      // Recarga el user actual desde el backend (GET /usuarios/me).
      // Útil tras cambiar contraseña, actualizar perfil, etc.
      refresh: async () => {
        try {
          const { authService } = await import('@/services/api')
          const user = await authService.me()
          set((s) => ({ user: { ...s.user, ...user } }))
        } catch { /* no romper si falla */ }
      },

      logout: () => {
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false })
        // RequireAuth en App.jsx detecta isAuthenticated=false y redirige a /login.
        // Evitamos window.location.href = '/login' que recarga la página y
        // descarta el estado mutable en memoria de los mocks (modo demo).
      },

      hasRole: (role) => get().user?.role === role,

      canAccessSede: (sedeId) => {
        const { user } = get()
        if (!user) return false
        // Gerencia, directivo y supervisor ven todas las sedes
        if (['gerencia', 'directivo', 'supervisor'].includes(user.role)) return true
        return user.sites?.includes(sedeId) ?? false
      },
    }),
    { name: 'sgrc-auth', partialize: (s) => ({ user: s.user, token: s.token, refreshToken: s.refreshToken, isAuthenticated: s.isAuthenticated }) }
  )
)
