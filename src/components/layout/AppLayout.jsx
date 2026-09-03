import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Avatar, Badge } from '@/components/ui'
import NotificacionesPanel from '@/components/layout/NotificationsPanel'
import { ROLES } from '@/utils/helpers'
import { useHeartbeat } from '@/hooks/useHeartbeat'

const NAV_ITEMS = {
  recurso: [
    { to: '/app/horario',        icon: '📅', label: 'Mi horario' },
    { to: '/app/mi-ejecucion',   icon: '✅', label: 'Ejecución del día' },
    { to: '/app/ausencias',      icon: '📋', label: 'Mis ausencias' },
    { to: '/app/backoffice',     icon: '🗂️', label: 'Backoffice' },
    { to: '/app/perfil',         icon: '👤', label: 'Mi perfil' },
  ],
  coordinador: [
    { to: '/app/dashboard-coord',    icon: '🏠', label: 'Dashboard' },
    { to: '/app/programador',        icon: '📅', label: 'Programador' },
    { to: '/app/ausencias-coord',      icon: '⚠️',  label: 'Ausencias' },
    { to: '/app/ausencias-cronograma', icon: '🗓️', label: 'Cronograma ausencias' },
    { to: '/app/ejecucion',          icon: '✅', label: 'Ejecución' },
    { to: '/app/recursos-coord',     icon: '👥', label: 'Recursos' },
    { to: '/app/backoffice-coord',   icon: '🗂️', label: 'Backoffice' },
    { to: '/app/horario-diario',     icon: '📋', label: 'Resumen diario' },
    { to: '/app/solicitudes-recurso', icon: '📨', label: 'Solicitudes de recurso' },
    { to: '/app/informes/ocupacion', icon: '📊', label: 'Informe ocupación' },
    { to: '/app/perfil',             icon: '👤', label: 'Mi perfil' },
  ],
  directivo: [
    { to: '/app/dashboard',                icon: '📊', label: 'Dashboard' },
    { to: '/app/informes/ocupacion',       icon: '🏥', label: 'Ocupación' },
    { to: '/app/informes/ocupacion-asesores', icon: '👥', label: 'Ocupación asesores' },
    { to: '/app/informes/productividad',   icon: '📈', label: 'Productividad' },
    { to: '/app/productividad-recurso',    icon: '🧑‍⚕️', label: 'Productividad individual' },
    { to: '/app/informes/ausentismo-impacto', icon: '🚨', label: 'Ausentismo e impacto' },
    { to: '/app/reprogramaciones',         icon: '📊', label: 'Reprogramaciones' },
    { to: '/app/informes/subutilizacion',  icon: '⏰', label: 'Tiempos ociosos' },
    { to: '/app/informes/horas-prog-ejec', icon: '⏱️', label: 'Prog. vs ejecutado' },
    { to: '/app/informes/cierre-semanas',  icon: '🔒', label: 'Cierre de semanas' },
    { to: '/app/comparativo',              icon: '↔️',  label: 'Comparativo' },
    { to: '/app/perfil',                   icon: '👤', label: 'Mi perfil' },
  ],
  supervisor: [
    { to: '/app/admin/sedes',              icon: '🏢', label: 'Sedes y consultorios' },
    { to: '/app/admin/recursos',           icon: '🩺', label: 'Recursos (catálogo)' },
    { to: '/app/admin/usuarios',           icon: '👥', label: 'Usuarios' },
    { to: '/app/admin/solicitudes',        icon: '📨', label: 'Solicitudes de registro' },
    { to: '/app/admin/solicitudes-recurso', icon: '📥', label: 'Solicitudes de recurso' },
    { to: '/app/admin/parametros',         icon: '⚙️',  label: 'Parámetros de costo' },
    { to: '/app/admin/metas',              icon: '🎯', label: 'Metas del sistema' },
    { to: '/app/admin/motivos-ausencia',   icon: '🩹', label: 'Motivos de ausencia' },
    { to: '/app/ausencias-cronograma',     icon: '🗓️', label: 'Cronograma ausencias' },
    { to: '/app/reprogramaciones',         icon: '📊', label: 'Reprogramaciones' },
    { to: '/app/admin/tareas-backoffice',  icon: '🗂️', label: 'Tareas backoffice' },
    { to: '/app/admin/festivos',           icon: '📆', label: 'Festivos' },
    { to: '/app/admin/auditoria',          icon: '🔍', label: 'Auditoría' },
    { to: '/app/programador',              icon: '🔓', label: 'Editar semana cerrada' },
    { to: '/app/perfil',                   icon: '👤', label: 'Mi perfil' },
  ],
  gerencia: [
    // Vista ejecutiva — los dashboards e informes de los directivos
    { to: '/app/dashboard',                icon: '📊', label: 'Dashboard ejecutivo' },
    { to: '/app/informes/ocupacion',       icon: '🏥', label: 'Ocupación' },
    { to: '/app/informes/ocupacion-asesores', icon: '👥', label: 'Ocupación asesores' },
    { to: '/app/informes/productividad',   icon: '📈', label: 'Productividad' },
    { to: '/app/productividad-recurso',    icon: '🧑‍⚕️', label: 'Productividad individual' },
    { to: '/app/informes/ausentismo-impacto', icon: '🚨', label: 'Ausentismo e impacto' },
    { to: '/app/reprogramaciones',         icon: '📊', label: 'Reprogramaciones' },
    { to: '/app/informes/subutilizacion',  icon: '⏰', label: 'Tiempos ociosos' },
    { to: '/app/informes/horas-prog-ejec', icon: '⏱️', label: 'Prog. vs ejecutado' },
    { to: '/app/informes/cierre-semanas',  icon: '🔒', label: 'Cierre de semanas' },
    { to: '/app/comparativo',              icon: '↔️',  label: 'Comparativo semanal' },
    // Gestión técnica — todo lo que ve el supervisor
    { to: '/app/admin/sedes',              icon: '🏢', label: 'Sedes y consultorios' },
    { to: '/app/admin/recursos',           icon: '🩺', label: 'Recursos (catálogo)' },
    { to: '/app/admin/usuarios',           icon: '👥', label: 'Usuarios' },
    { to: '/app/admin/solicitudes',        icon: '📨', label: 'Solicitudes de registro' },
    { to: '/app/admin/solicitudes-recurso', icon: '📥', label: 'Solicitudes de recurso' },
    { to: '/app/admin/parametros',         icon: '⚙️',  label: 'Parámetros de costo' },
    { to: '/app/admin/metas',              icon: '🎯', label: 'Metas del sistema' },
    { to: '/app/admin/motivos-ausencia',   icon: '🩹', label: 'Motivos de ausencia' },
    { to: '/app/ausencias-cronograma',     icon: '🗓️', label: 'Cronograma ausencias' },
    { to: '/app/admin/tareas-backoffice',  icon: '🗂️', label: 'Tareas backoffice' },
    { to: '/app/admin/festivos',           icon: '📆', label: 'Festivos' },
    { to: '/app/admin/auditoria',          icon: '🔍', label: 'Auditoría' },
    { to: '/app/programador',              icon: '🔓', label: 'Editar semana cerrada' },
    { to: '/app/perfil',                   icon: '👤', label: 'Mi perfil' },
  ],
}

export default function AppLayout() {
  const { user, logout, refresh } = useAuthStore()
  const location = useLocation()
  const [showNotif, setShowNotif] = useState(false)
  // En desktop el sidebar puede colapsarse; en mobile/tablet es un drawer overlay
  const [sidebarOpen, setSidebarOpen] = useState(true)        // desktop: expandido / colapsado
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false) // mobile: drawer abierto
  const navItems = NAV_ITEMS[user?.role] ?? []
  const rol = ROLES[user?.role]
  useHeartbeat()

  // Cerrar el drawer al cambiar de ruta (UX típica en mobile)
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  // Refresh del user al montar el layout: garantiza que cambios de sedes,
  // rol o permisos hechos por el supervisor se reflejen sin necesidad de
  // que el usuario cierre sesión.
  useEffect(() => {
    refresh?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sidebarBody = (mobile) => (
    <>
      {/* Brand */}
      <div className="h-14 flex items-center px-3 border-b border-gray-100 gap-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">SC</span>
        </div>
        {(sidebarOpen || mobile) && (
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">SGRC</div>
            <div className="text-xs text-gray-400 truncate">Recursos clínicos</div>
          </div>
        )}
        {!mobile && (
          <button
            className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0 hidden lg:block"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        )}
        {mobile && (
          <button
            className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0 text-lg leading-none"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        )}
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
            title={!sidebarOpen && !mobile ? item.label : undefined}
          >
            <span className="text-base flex-shrink-0">{item.icon}</span>
            {(sidebarOpen || mobile) && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-2">
          <Avatar nombre={user?.name} size="sm" color="blue" />
          {(sidebarOpen || mobile) && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate">{user?.name}</div>
              <Badge variant={rol?.color ?? 'gray'} className="text-xs py-0">{rol?.label}</Badge>
            </div>
          )}
        </div>
        {(sidebarOpen || mobile) && (
          <button onClick={logout} className="mt-2 w-full text-xs text-gray-400 hover:text-red-500 text-left transition-colors">
            Cerrar sesión
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar desktop (lg+) — fijo en el flujo */}
      <aside
        className={`${sidebarOpen ? 'lg:w-52' : 'lg:w-14'} hidden lg:flex flex-shrink-0 bg-white border-r border-gray-100 flex-col transition-all duration-200`}
      >
        {sidebarBody(false)}
      </aside>

      {/* Backdrop mobile */}
      {mobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar mobile/tablet (<lg) — drawer overlay */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 w-64 max-w-[80vw] bg-white border-r border-gray-100 flex flex-col z-50 transform transition-transform duration-200
          ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebarBody(true)}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-3 sm:px-4 gap-3 flex-shrink-0">
          {/* Botón hamburguesa solo en mobile/tablet */}
          <button
            className="lg:hidden text-gray-600 hover:text-gray-900 p-1 -ml-1"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand inline solo en mobile (cuando drawer está cerrado) */}
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">SC</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 truncate">SGRC</span>
          </div>

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
