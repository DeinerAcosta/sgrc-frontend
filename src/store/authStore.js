import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => set({ user, token, isAuthenticated: true }),

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        // RequireAuth en App.jsx detecta isAuthenticated=false y redirige a /login.
        // Evitamos window.location.href = '/login' que recarga la página y
        // descarta el estado mutable en memoria de los mocks (modo demo).
      },

      hasRole: (role) => get().user?.rol === role,

      canAccessSede: (sedeId) => {
        const { user } = get()
        if (!user) return false
        if (['directivo', 'supervisor'].includes(user.rol)) return true
        return user.sedes?.includes(sedeId) ?? false
      },
    }),
    { name: 'sgrc-auth', partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }) }
  )
)
