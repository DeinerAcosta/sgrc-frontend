import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Avatar, Badge } from '@/components/ui'
import NotificacionesPanel from '@/components/layout/NotificationsPanel'
import { ROLES } from '@/utils/helpers'
import { NAV_ITEMS, rutaModulo } from '@/config/nav'
import { useHeartbeat } from '@/hooks/useHeartbeat'


/**
 * Item de menú que se despliega, al estilo del menú de Biowel.
 *
 * Al pulsar el NOMBRE pasan dos cosas a la vez: se navega a la pantalla del
 * módulo (las tarjetas, donde se ve todo) y se abren sus opciones debajo. No
 * hay una opción "ver todo" en el submenú — el propio nombre es esa opción.
 *
 * La FLECHA es aparte: solo pliega o despliega, sin moverte de donde estés.
 *
 * Este es el patrón a repetir en los demás módulos cuando se reorganicen.
 *
 * El resaltado de "activo" se calcula a mano y no con el `NavLink` de siempre:
 * los hijos se distinguen por la CADENA DE CONSULTA (?grupo=auxiliares), y
 * NavLink solo mira la ruta. Sin esto, las cuatro opciones saldrían marcadas a
 * la vez y el padre nunca se apagaría.
 */
function GrupoDesplegable({ item, expandido }) {
  const location = useLocation()
  const navigate = useNavigate()
  const rutaDe = (to) => to.split('?')[0]
  const paramDe = (to) => new URLSearchParams(to.split('?')[1] ?? '').get('grupo')
  const grupoActual = new URLSearchParams(location.search).get('grupo')

  // Sep-2026 · El padre lleva a la PÁGINA DEL MÓDULO, que lista sus opciones —
  // no a la primera de ellas. Entrar a "Vista ejecutiva" y aterrizar en el
  // Dashboard sin ver qué más hay dentro confunde; el menú de Biowel abre una
  // página con sus tablas maestras y es lo que se replica.
  // `item.raiz` deja que un módulo tenga pantalla propia: Gestión de ausencias
  // la usa, porque ya tiene sus tarjetas por grupo de personal.
  const raiz = item.raiz ?? rutaModulo(item.clave)
  // Se considera "dentro" tanto la página del módulo como cualquiera de sus
  // opciones: si no, al abrir una opción el padre se apagaría.
  const enAlgunHijo = item.children.some((h) => rutaDe(h.to) === location.pathname)
  const dentroDelGrupo = location.pathname === raiz || enAlgunHijo
  const enLaRaiz = location.pathname === raiz && !grupoActual
  const [abierto, setAbierto] = useState(dentroDelGrupo)

  // DOS ZONAS EN LA MISMA FILA, como en el menú de Biowel:
  //
  //   · el NOMBRE  → entra al módulo y despliega sus opciones
  //   · la FLECHA  → solo pliega o despliega, sin moverte de donde estés
  //
  // El primer intento fue un único clic que hacía las dos cosas y alternaba.
  // Eso permitía quedar en la pantalla del módulo con su menú plegado, sin
  // pista de qué opciones hay. El segundo intento lo dejó fijo abierto mientras
  // estuvieras dentro, pero eso quita el control: no podías cerrarlo ni aunque
  // quisieras. Separar las dos zonas resuelve ambas cosas y es el patrón que
  // se va a repetir en los demás módulos.
  const alternar = () => setAbierto((v) => !v)

  // El sidebar NO se vuelve a montar al navegar, así que el estado inicial se
  // calcula con la ruta del login. Este efecto abre el grupo cuando entras en
  // él desde fuera (un enlace de notificación, por ejemplo).
  useEffect(() => {
    if (dentroDelGrupo) setAbierto(true)
  }, [dentroDelGrupo])

  const esHijoActivo = (h) =>
    rutaDe(h.to) === location.pathname && (paramDe(h.to) ?? null) === (grupoActual ?? null)

  const pulsarPadre = () => {
    navigate(raiz)
    setAbierto(true)
  }

  // Sidebar colapsado: no hay espacio para el submenú, así que el padre lleva
  // directo a la pantalla del módulo.
  if (!expandido) {
    return (
      <NavLink
        to={raiz}
        end
        title={item.label}
        className={({ isActive }) =>
          `flex items-center justify-center py-2 rounded-lg text-[13px] transition-colors
           ${isActive ? 'bg-blue-50 text-brand-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`
        }
      >
        <span className="text-base flex-shrink-0">{item.icon}</span>
      </NavLink>
    )
  }

  return (
    <div>
      {/* La fila lleva DOS botones hermanos, no uno dentro de otro (eso es HTML
          inválido y React lo advierte): el nombre entra al módulo, la flecha
          solo pliega. */}
      <div
        className={`flex items-start rounded-lg transition-colors
          ${enLaRaiz
            ? 'bg-blue-50 text-brand-800 font-semibold'
            : dentroDelGrupo
              ? 'text-brand-800 font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
      >
        <button
          type="button"
          onClick={pulsarPadre}
          className="flex-1 min-w-0 flex items-start gap-2.5 pl-2.5 py-[7px] text-[13px] text-left"
        >
          <span className="text-base flex-shrink-0 leading-5">{item.icon}</span>
          <span className="leading-5">{item.label}</span>
        </button>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-label={abierto ? `Plegar ${item.label}` : `Desplegar ${item.label}`}
          className="px-2 py-[7px] text-[9px] text-gray-400 hover:text-gray-800 rounded-r-lg"
        >
          <span className={`block leading-5 transition-transform ${abierto ? 'rotate-90' : ''}`}>▶</span>
        </button>
      </div>

      {abierto && (
        <div className="ml-[18px] pl-3 border-l border-gray-200 mt-0.5 space-y-px">
          {item.children.map((h) => (
            <NavLink
              key={h.to}
              to={h.to}
              className={`block px-2.5 py-1.5 rounded-md text-[13px] leading-5 transition-colors
                ${esHijoActivo(h)
                  ? 'bg-blue-50 text-brand-800 font-semibold'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              {h.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
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

  // Oct-2026 · Dos opciones con la MISMA ruta y distinta consulta (Mis
  // reprogramaciones y su ?vista=cronograma): NavLink solo mira la ruta y las
  // marcaba a las dos. La que pide una consulta se marca si coincide; la otra,
  // si ninguna hermana la reclama.
  const coincideConsulta = (to) => {
    const qs = to?.split('?')[1]
    if (!qs) return false
    const actual = new URLSearchParams(location.search)
    return [...new URLSearchParams(qs)].every(([k, v]) => actual.get(k) === v)
  }
  const estaActivo = (to, isActive) => {
    if (!isActive) return false
    if (to.includes('?')) return coincideConsulta(to)
    return !navItems.some((o) => o.to && o.to !== to && o.to.split('?')[0] === to && coincideConsulta(o.to))
  }

  const sidebarBody = (mobile) => (
    <>
      {/* Brand — colapsado va centrado, igual que los iconos de abajo. Con
          `px-3` fijo el cuadro quedaba descuadrado respecto a ellos. */}
      <div className={`h-14 flex items-center border-b border-gray-100 gap-2
        ${(sidebarOpen || mobile) ? 'px-3' : 'justify-center px-0'}`}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">SC</span>
        </div>
        {(sidebarOpen || mobile) && (
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">SGRC</div>
            <div className="text-xs text-gray-400 truncate">Recursos clínicos</div>
          </div>
        )}
        {/* Colapsado, este botón no cabe: quedaban el logo de 32 px y la flecha
            peleando por los 56 px de ancho, cortados contra el borde. Ahí se
            muestra en su propia fila debajo, centrado. */}
        {!mobile && sidebarOpen && (
          <button
            className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0 hidden lg:block"
            onClick={() => setSidebarOpen(false)}
            aria-label="Plegar menú"
          >
            ◀
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

      {/* Nav — soporta dos tipos de item: {to,icon,label} (link) y
          {divider:true,label} (header de grupo). En sidebar colapsado los
          dividers se pintan como una linea horizontal fina sin texto. */}
      {/* Botón de desplegar, solo cuando el panel está colapsado. Ocupa su
          propia fila para no pelear con el logo por los 56 px de ancho. */}
      {!mobile && !sidebarOpen && (
        <button
          className="hidden lg:flex items-center justify-center h-8 mx-2 mt-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          onClick={() => setSidebarOpen(true)}
          aria-label="Desplegar menú"
          title="Desplegar menú"
        >
          ▶
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item, idx) => {
          if (item.divider) {
            return (sidebarOpen || mobile) ? (
              <div
                key={`div-${idx}`}
                className={`text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-2.5 pb-1 ${idx > 0 ? 'pt-3' : 'pt-1'}`}
              >
                {item.label}
              </div>
            ) : (
              <div key={`div-${idx}`} className={`border-t border-gray-100 mx-2 ${idx > 0 ? 'my-2' : 'mb-1'}`} />
            )
          }
          // Grupo desplegable: al pulsarlo abre sus opciones debajo en vez de
          // navegar. Con el sidebar colapsado no hay sitio para el submenú, así
          // que se comporta como un enlace directo al primer hijo.
          if (item.children) {
            return (
              <GrupoDesplegable
                key={`grp-${item.label}`}
                item={item}
                expandido={!!(sidebarOpen || mobile)}
              />
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                // Colapsado: el icono va CENTRADO y sin hueco para texto. Con
                // `items-start gap-2.5 px-2.5` —que es lo que necesita el modo
                // abierto para que la segunda línea alinee con el icono— los
                // iconos quedaban pegados a la izquierda de una columna de
                // 56 px, descuadrados respecto al logo de arriba.
                `flex rounded-lg text-[13px] transition-colors cursor-pointer
                 ${(sidebarOpen || mobile)
                   ? 'items-start gap-2.5 px-2.5 py-[7px]'
                   : 'items-center justify-center px-0 py-2'}
                 ${estaActivo(item.to, isActive) ? 'bg-blue-50 text-brand-800 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
              }
              title={!sidebarOpen && !mobile ? item.label : undefined}
            >
              {/* Sep-2026 · El nombre va COMPLETO. Antes llevaba `truncate`
                  sobre un panel de 208 px y media app quedaba en "Programado
                  vs ej…" o "Dashboard ejecuti…": había que adivinar o pasar el
                  ratón por encima. Ahora el panel es más ancho y lo que no
                  quepa baja a una segunda línea, alineada con el icono. */}
              <span className="text-base flex-shrink-0 leading-5">{item.icon}</span>
              {(sidebarOpen || mobile) && <span className="leading-5">{item.label}</span>}
            </NavLink>
          )
        })}
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
        className={`${sidebarOpen ? 'lg:w-64' : 'lg:w-14'} hidden lg:flex flex-shrink-0 bg-white border-r border-gray-100 flex-col transition-all duration-200`}
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