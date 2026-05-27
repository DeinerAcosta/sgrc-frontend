import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Avatar, Badge } from '@/components/ui'
import NotificacionesPanel from '@/components/layout/NotificacionesPanel'
import { ROLES } from '@/utils/helpers'

const NAV_ITEMS = {
  recurso: [
    { to: '/app/horario',        icon: '📅', label: 'Mi horario' },
    { to: '/app/ausencias',      icon: '📋', label: 'Mis ausencias' },
    { to: '/app/backoffice',     icon: '🗂️', label: 'Backoffice' },
    { to: '/app/perfil',         icon: '👤', label: 'Mi perfil' },
  ],
  coordinador: [
    { to: '/app/dashboard-coord',    icon: '🏠', label: 'Dashboard' },
    { to: '/app/programador',        icon: '📅', label: 'Programador' },
    { to: '/app/ausencias-coord',    icon: '⚠️',  label: 'Ausencias' },
    { to: '/app/ejecucion',          icon: '✅', label: 'Ejecución' },
    { to: '/app/recursos-coord',     icon: '👥', label: 'Recursos' },
    { to: '/app/informes/ocupacion', icon: '📊', label: 'Informe ocupación' },
    { to: '/app/perfil',             icon: '👤', label: 'Mi perfil' },
  ],
  directivo: [
    { to: '/app/dashboard',                icon: '📊', label: 'Dashboard' },
    { to: '/app/informes/ocupacion',       icon: '🏥', label: 'Ocupación' },
    { to: '/app/informes/productividad',   icon: '📈', label: 'Productividad' },
    { to: '/app/productividad-recurso',    icon: '🧑‍⚕️', label: 'Productividad individual' },
    { to: '/app/informes/ausentismo-impacto', icon: '🚨', label: 'Ausentismo e impacto' },
    { to: '/app/informes/subutilizacion',  icon: '⏰', label: 'Tiempos ociosos' },
    { to: '/app/informes/horas-prog-ejec', icon: '⏱️', label: 'Prog. vs ejecutado' },
    { to: '/app/comparativo',              icon: '↔️',  label: 'Comparativo' },
    { to: '/app/perfil',                   icon: '👤', label: 'Mi perfil' },
  ],
  supervisor: [
    { to: '/app/dashboard',                icon: '📊', label: 'Dashboard' },
    { to: '/app/programador',              icon: '📅', label: 'Programador' },
    { to: '/app/ausencias-coord',          icon: '⚠️',  label: 'Ausencias' },
    { to: '/app/comparativo',              icon: '↔️',  label: 'Comparativo' },
    { to: '/app/productividad-recurso',    icon: '🧑‍⚕️', label: 'Productividad individual' },
    { to: '/app/admin/sedes',              icon: '🏢', label: 'Sedes y consultorios' },
    { to: '/app/admin/recursos',           icon: '🩺', label: 'Recursos (catálogo)' },
    { to: '/app/admin/usuarios',           icon: '👥', label: 'Usuarios' },
    { to: '/app/admin/parametros',         icon: '⚙️',  label: 'Parámetros de costo' },
    { to: '/app/admin/metas',              icon: '🎯', label: 'Metas del sistema' },
    { to: '/app/admin/tareas-backoffice',  icon: '🗂️', label: 'Tareas backoffice' },
    { to: '/app/admin/festivos',           icon: '📆', label: 'Festivos' },
    { to: '/app/admin/auditoria',          icon: '🔍', label: 'Auditoría' },
    { to: '/app/perfil',                   icon: '👤', label: 'Mi perfil' },
  ],
}

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const [showNotif, setShowNotif] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const navItems = NAV_ITEMS[user?.rol] ?? []
  const rol = ROLES[user?.rol]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-52' : 'w-14'} flex-shrink-0 bg-white border-r border-gray-100 flex flex-col transition-all duration-200`}>
        {/* Brand */}
        <div className="h-14 flex items-center px-3 border-b border-gray-100 gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">SC</span>
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-900 truncate">SGRC</div>
              <div className="text-xs text-gray-400 truncate">Recursos clínicos</div>
            </div>
          )}
          <button
            className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer
                 ${isActive ? 'bg-blue-50 text-brand-800 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <Avatar nombre={user?.nombre} size="sm" color="blue" />
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{user?.nombre}</div>
                <Badge variant={rol?.color ?? 'gray'} className="text-xs py-0">{rol?.label}</Badge>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button onClick={logout} className="mt-2 w-full text-xs text-gray-400 hover:text-red-500 text-left transition-colors">
              Cerrar sesión
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 flex-shrink-0">
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Notificaciones"
            >
              <span className="text-xl">🔔</span>
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            {showNotif && <NotificacionesPanel onClose={() => setShowNotif(false)} />}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
