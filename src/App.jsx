import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui'

// ============================================================================
// CARGA POR RUTA (code-splitting)
// ============================================================================
// Antes las 40 páginas se importaban de forma estática, así que un auxiliar que
// solo entra a marcar su ejecución descargaba también todo el módulo de
// administración, el de dirección y recharts: 1,13 MB en una sola pieza.
//
// Ahora cada grupo de rol se carga cuando se visita. Se mantienen ESTÁTICAS solo
// las que hacen falta sí o sí en el primer pintado:
//   - LoginPage: es lo primero que ve quien no ha entrado. Cargarla en diferido
//     produciría un parpadeo del spinner en cada arranque de sesión.
//   - AppLayout: envuelve TODAS las rutas de /app, así que siempre se necesita.
import LoginPage  from '@/pages/auth/LoginPage'
import AppLayout  from '@/components/layout/AppLayout'

// Auth (secundarias)
const RegistroPage        = lazy(() => import('@/pages/auth/SignupPage'))
const CambiarPasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage'))
const ResetPasswordPage   = lazy(() => import('@/pages/auth/ResetPasswordPage'))

// Recurso
const HorarioPage           = lazy(() => import('@/pages/resource/SchedulePage'))
const AusenciasRecursoPage  = lazy(() => import('@/pages/resource/ResourceAbsencesPage'))
const PerfilPage            = lazy(() => import('@/pages/resource/ProfilePage'))
const BackofficeRecursoPage = lazy(() => import('@/pages/resource/ResourceBackofficePage'))
const MiEjecucionPage       = lazy(() => import('@/pages/resource/MyExecutionPage'))

// Coordinador
const DashboardCoordPage      = lazy(() => import('@/pages/coordinator/CoordDashboardPage'))
const ProgramadorPage         = lazy(() => import('@/pages/coordinator/SchedulerPage'))
const AusenciasCoordPage      = lazy(() => import('@/pages/coordinator/CoordAbsencesPage'))
const AusenciasCronogramaPage = lazy(() => import('@/pages/coordinator/AbsencesTimelinePage'))
const EjecucionPage           = lazy(() => import('@/pages/coordinator/ExecutionPage'))
const RecursosCoordPage       = lazy(() => import('@/pages/coordinator/CoordResourcesPage'))
const BackofficeCoordPage     = lazy(() => import('@/pages/coordinator/CoordBackofficePage'))
const HorarioDiarioPage       = lazy(() => import('@/pages/coordinator/DailySchedulePage'))
const SolicitudesRecursoCoordPage = lazy(() => import('@/pages/coordinator/CoordResourceRequestsPage'))

// Directivo
const DashboardDirectivoPage    = lazy(() => import('@/pages/executive/ExecutiveDashboardPage'))
const InformePage               = lazy(() => import('@/pages/executive/ReportPage'))
const ComparativoPage           = lazy(() => import('@/pages/executive/ComparisonPage'))
const ProductividadRecursoPage  = lazy(() => import('@/pages/executive/ResourceProductivityPage'))
const ReprogramacionesPage      = lazy(() => import('@/pages/executive/ReschedulesPage'))

// Admin / Supervisor
const AdminSedesPage            = lazy(() => import('@/pages/admin/AdminSitesPage'))
const AdminUsuariosPage         = lazy(() => import('@/pages/admin/AdminUsersPage'))
const AdminParametrosPage       = lazy(() => import('@/pages/admin/AdminSettingsPage'))
const AdminTareasBackofficePage = lazy(() => import('@/pages/admin/AdminBackofficeTasksPage'))
const AdminAuditoriaPage        = lazy(() => import('@/pages/admin/AdminAuditPage'))
const AdminRecursosPage         = lazy(() => import('@/pages/admin/AdminResourcesPage'))
const AdminFestivosPage         = lazy(() => import('@/pages/admin/AdminHolidaysPage'))
const AdminMetasPage            = lazy(() => import('@/pages/admin/AdminTargetsPage'))
const AdminSolicitudesPage      = lazy(() => import('@/pages/admin/AdminRequestsPage'))
const AdminSolicitudesRecursoPage = lazy(() => import('@/pages/admin/AdminResourceRequestsPage'))
const AdminMotivosAusenciaPage  = lazy(() => import('@/pages/admin/AdminAbsenceReasonsPage'))

/** Se muestra mientras se descarga el trozo de la página pedida. */
function CargandoPagina() {
  return (
    <div className="flex justify-center items-center py-16" role="status" aria-label="Cargando">
      <Spinner />
    </div>
  )
}

function RequireAuth({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Gerencia es super-usuario — bypasea cualquier check de roles
  if (user?.role === 'gerencia') return children
  if (roles && !roles.includes(user?.role)) return <Navigate to="/app/horario" replace />
  return children
}

function RoleRedirect() {
  const { user } = useAuthStore()
  const routes = {
    resource:     '/app/horario',
    coordinador: '/app/dashboard-coord',
    directivo:   '/app/dashboard',
    supervisor:  '/app/admin/sedes',
    gerencia:    '/app/dashboard',  // gerencia aterriza en el dashboard ejecutivo
  }
  return <Navigate to={routes[user?.role] ?? '/app/horario'} replace />
}

export default function App() {
  return (
    // Un solo Suspense envolviendo todas las rutas: cualquier página en diferido
    // muestra el mismo indicador mientras baja su trozo.
    <Suspense fallback={<CargandoPagina />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegistroPage />} />
        <Route path="/cambiar-password" element={<RequireAuth><CambiarPasswordPage /></RequireAuth>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<RoleRedirect />} />

          {/* RECURSO */}
          <Route path="horario" element={<RequireAuth roles={['recurso', 'coordinador', 'supervisor']}><HorarioPage /></RequireAuth>} />
          <Route path="mi-ejecucion" element={<RequireAuth roles={['recurso']}><MiEjecucionPage /></RequireAuth>} />
          <Route path="ausencias" element={<RequireAuth roles={['recurso']}><AusenciasRecursoPage /></RequireAuth>} />
          <Route path="perfil" element={<RequireAuth><PerfilPage /></RequireAuth>} />
          <Route path="backoffice" element={<RequireAuth roles={['recurso']}><BackofficeRecursoPage /></RequireAuth>} />

          {/* COORDINADOR */}
          <Route path="dashboard-coord" element={<RequireAuth roles={['coordinador', 'supervisor']}><DashboardCoordPage /></RequireAuth>} />
          <Route path="programador" element={<RequireAuth roles={['coordinador', 'supervisor']}><ProgramadorPage /></RequireAuth>} />
          <Route path="ausencias-coord" element={<RequireAuth roles={['coordinador']}><AusenciasCoordPage /></RequireAuth>} />
          <Route path="ausencias-cronograma" element={<RequireAuth roles={['coordinador', 'supervisor']}><AusenciasCronogramaPage /></RequireAuth>} />
          <Route path="ejecucion" element={<RequireAuth roles={['coordinador', 'supervisor']}><EjecucionPage /></RequireAuth>} />
          <Route path="recursos-coord" element={<RequireAuth roles={['coordinador', 'supervisor']}><RecursosCoordPage /></RequireAuth>} />
          <Route path="backoffice-coord" element={<RequireAuth roles={['coordinador']}><BackofficeCoordPage /></RequireAuth>} />
          <Route path="horario-diario" element={<RequireAuth roles={['coordinador', 'supervisor']}><HorarioDiarioPage /></RequireAuth>} />
          <Route path="solicitudes-recurso" element={<RequireAuth roles={['coordinador']}><SolicitudesRecursoCoordPage /></RequireAuth>} />

          {/* DIRECTIVO */}
          <Route path="dashboard" element={<RequireAuth roles={['directivo']}><DashboardDirectivoPage /></RequireAuth>} />
          <Route path="informes/:tipo" element={<RequireAuth roles={['coordinador', 'directivo', 'supervisor']}><InformePage /></RequireAuth>} />
          <Route path="comparativo" element={<RequireAuth roles={['directivo']}><ComparativoPage /></RequireAuth>} />
          <Route path="productividad-recurso" element={<RequireAuth roles={['directivo']}><ProductividadRecursoPage /></RequireAuth>} />
          <Route path="reprogramaciones" element={<RequireAuth roles={['directivo', 'supervisor']}><ReprogramacionesPage /></RequireAuth>} />

          {/* SUPERVISOR */}
          <Route path="admin/sedes" element={<RequireAuth roles={['supervisor']}><AdminSedesPage /></RequireAuth>} />
          <Route path="admin/usuarios" element={<RequireAuth roles={['supervisor']}><AdminUsuariosPage /></RequireAuth>} />
          <Route path="admin/parametros" element={<RequireAuth roles={['supervisor']}><AdminParametrosPage /></RequireAuth>} />
          <Route path="admin/tareas-backoffice" element={<RequireAuth roles={['supervisor']}><AdminTareasBackofficePage /></RequireAuth>} />
          <Route path="admin/auditoria" element={<RequireAuth roles={['supervisor']}><AdminAuditoriaPage /></RequireAuth>} />
          <Route path="admin/recursos" element={<RequireAuth roles={['supervisor']}><AdminRecursosPage /></RequireAuth>} />
          <Route path="admin/festivos" element={<RequireAuth roles={['supervisor']}><AdminFestivosPage /></RequireAuth>} />
          <Route path="admin/metas" element={<RequireAuth roles={['supervisor']}><AdminMetasPage /></RequireAuth>} />
          <Route path="admin/solicitudes" element={<RequireAuth roles={['supervisor']}><AdminSolicitudesPage /></RequireAuth>} />
          <Route path="admin/solicitudes-recurso" element={<RequireAuth roles={['supervisor']}><AdminSolicitudesRecursoPage /></RequireAuth>} />
          <Route path="admin/motivos-ausencia" element={<RequireAuth roles={['supervisor']}><AdminMotivosAusenciaPage /></RequireAuth>} />

          <Route path="*" element={<RoleRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
