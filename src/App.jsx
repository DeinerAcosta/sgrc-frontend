import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

import LoginPage              from '@/pages/auth/LoginPage'
import AppLayout              from '@/components/layout/AppLayout'

// Recurso
import HorarioPage            from '@/pages/recurso/HorarioPage'
import AusenciasRecursoPage   from '@/pages/recurso/AusenciasRecursoPage'
import PerfilPage             from '@/pages/recurso/PerfilPage'
import BackofficeRecursoPage  from '@/pages/recurso/BackofficeRecursoPage'

// Coordinador
import DashboardCoordPage     from '@/pages/coordinador/DashboardCoordPage'
import ProgramadorPage        from '@/pages/coordinador/ProgramadorPage'
import AusenciasCoordPage     from '@/pages/coordinador/AusenciasCoordPage'
import EjecucionPage          from '@/pages/coordinador/EjecucionPage'
import RecursosCoordPage      from '@/pages/coordinador/RecursosCoordPage'

// Directivo
import DashboardDirectivoPage from '@/pages/directivo/DashboardDirectivoPage'
import InformePage            from '@/pages/directivo/InformePage'
import ComparativoPage        from '@/pages/directivo/ComparativoPage'
import ProductividadRecursoPage from '@/pages/directivo/ProductividadRecursoPage'

// Admin / Supervisor
import AdminSedesPage         from '@/pages/admin/AdminSedesPage'
import AdminUsuariosPage      from '@/pages/admin/AdminUsuariosPage'
import AdminParametrosPage    from '@/pages/admin/AdminParametrosPage'
import AdminTareasBackofficePage from '@/pages/admin/AdminTareasBackofficePage'
import AdminAuditoriaPage     from '@/pages/admin/AdminAuditoriaPage'
import AdminRecursosPage      from '@/pages/admin/AdminRecursosPage'
import AdminFestivosPage      from '@/pages/admin/AdminFestivosPage'
import AdminMetasPage         from '@/pages/admin/AdminMetasPage'

function RequireAuth({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.rol)) return <Navigate to="/app/horario" replace />
  return children
}

function RoleRedirect() {
  const { user } = useAuthStore()
  const routes = {
    recurso:     '/app/horario',
    coordinador: '/app/dashboard-coord',
    directivo:   '/app/dashboard',
    supervisor:  '/app/dashboard',
  }
  return <Navigate to={routes[user?.rol] ?? '/app/horario'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/app" replace />} />

      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />

        {/* RECURSO */}
        <Route path="horario" element={<RequireAuth roles={['recurso', 'coordinador', 'supervisor']}><HorarioPage /></RequireAuth>} />
        <Route path="ausencias" element={<RequireAuth roles={['recurso']}><AusenciasRecursoPage /></RequireAuth>} />
        <Route path="perfil" element={<RequireAuth><PerfilPage /></RequireAuth>} />
        <Route path="backoffice" element={<RequireAuth roles={['recurso']}><BackofficeRecursoPage /></RequireAuth>} />

        {/* COORDINADOR */}
        <Route path="dashboard-coord" element={<RequireAuth roles={['coordinador', 'supervisor']}><DashboardCoordPage /></RequireAuth>} />
        <Route path="programador" element={<RequireAuth roles={['coordinador', 'supervisor']}><ProgramadorPage /></RequireAuth>} />
        <Route path="ausencias-coord" element={<RequireAuth roles={['coordinador', 'supervisor']}><AusenciasCoordPage /></RequireAuth>} />
        <Route path="ejecucion" element={<RequireAuth roles={['coordinador', 'supervisor']}><EjecucionPage /></RequireAuth>} />
        <Route path="recursos-coord" element={<RequireAuth roles={['coordinador', 'supervisor']}><RecursosCoordPage /></RequireAuth>} />

        {/* DIRECTIVO */}
        <Route path="dashboard" element={<RequireAuth roles={['directivo', 'supervisor']}><DashboardDirectivoPage /></RequireAuth>} />
        <Route path="informes/:tipo" element={<RequireAuth roles={['coordinador', 'directivo', 'supervisor']}><InformePage /></RequireAuth>} />
        <Route path="comparativo" element={<RequireAuth roles={['directivo', 'supervisor']}><ComparativoPage /></RequireAuth>} />
        <Route path="productividad-recurso" element={<RequireAuth roles={['directivo', 'supervisor']}><ProductividadRecursoPage /></RequireAuth>} />

        {/* SUPERVISOR */}
        <Route path="admin/sedes" element={<RequireAuth roles={['supervisor']}><AdminSedesPage /></RequireAuth>} />
        <Route path="admin/usuarios" element={<RequireAuth roles={['supervisor']}><AdminUsuariosPage /></RequireAuth>} />
        <Route path="admin/parametros" element={<RequireAuth roles={['supervisor']}><AdminParametrosPage /></RequireAuth>} />
        <Route path="admin/tareas-backoffice" element={<RequireAuth roles={['supervisor']}><AdminTareasBackofficePage /></RequireAuth>} />
        <Route path="admin/auditoria" element={<RequireAuth roles={['supervisor']}><AdminAuditoriaPage /></RequireAuth>} />
        <Route path="admin/recursos" element={<RequireAuth roles={['supervisor']}><AdminRecursosPage /></RequireAuth>} />
        <Route path="admin/festivos" element={<RequireAuth roles={['supervisor']}><AdminFestivosPage /></RequireAuth>} />
        <Route path="admin/metas" element={<RequireAuth roles={['supervisor']}><AdminMetasPage /></RequireAuth>} />

        <Route path="*" element={<RoleRedirect />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
