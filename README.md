# SGRC Frontend — Sistema de Gestión de Recursos Clínicos

React 18 + Vite + TailwindCSS

## Requisitos
- Node.js 20+
- Backend corriendo en `http://localhost:3001`

## Instalación

```bash
npm install
npm run dev       # desarrollo en http://localhost:5173
npm run build     # build de producción
npm run preview   # previsualizar el build
```

## Estructura del proyecto

```
src/
├── components/
│   ├── ui/           # Badge, Avatar, Semaforo, KpiCard, Spinner, etc.
│   └── layout/       # AppLayout (sidebar + topbar), NotificacionesPanel
├── pages/
│   ├── auth/         # LoginPage
│   ├── recurso/      # HorarioPage, AusenciaFormModal
│   ├── coordinador/  # DashboardCoordPage, ProgramadorPage,
│   │                   AsignacionModal, AusenciasCoordPage
│   ├── directivo/    # DashboardDirectivoPage, InformePage
│   └── supervisor/   # (extender según necesidad)
├── hooks/            # custom hooks (agregar según necesidad)
├── services/
│   └── api.js        # todos los servicios REST por módulo
├── store/
│   └── authStore.js  # estado global de autenticación (Zustand)
└── utils/
    └── helpers.js    # constantes, formateadores, calculadores
```

## Roles y rutas

| Rol         | Ruta inicial           | Acceso                        |
|-------------|------------------------|-------------------------------|
| recurso     | /app/horario           | Horario propio + ausencias    |
| coordinador | /app/dashboard-coord   | Programador + ausencias + ejec|
| directivo   | /app/dashboard         | Dashboard + todos los informes|
| supervisor  | /app/dashboard         | Todo lo anterior + admin      |

## Variables de entorno

Copiar `.env.example` a `.env`:
```
VITE_DEMO_MODE=false
VITE_API_BASE=/api
```
- **VITE_DEMO_MODE**: `true` = datos de demostración locales (sin backend); `false` = habla con el backend real.
- **VITE_API_BASE**: URL base del backend. En local con el proxy de Vite déjalo en `/api`. En producción apunta al dominio público del backend, p.ej. `https://sgrc-backend.up.railway.app/api`.

El proxy de Vite redirige `/api/*` → `http://localhost:3001` en desarrollo (ver `vite.config.js`).

## Despliegue en Vercel

1. Sube **este** repositorio (solo el frontend) a GitHub/GitLab.
2. En Vercel: **New Project → Import** el repo. Detecta Vite automáticamente (no hay que configurar build).
3. En **Settings → Environment Variables** del proyecto, agrega:
   - `VITE_DEMO_MODE` = `false`
   - `VITE_API_BASE` = `https://TU-BACKEND/api` (el dominio público de tu backend desplegado)
4. **Deploy**. El archivo `vercel.json` ya incluye el rewrite SPA para que las rutas funcionen al recargar una URL profunda.

> Importante: en el backend, agrega el dominio que te da Vercel (p.ej. `https://sgrc.vercel.app`) a la variable `FRONTEND_ORIGIN` para que CORS permita las peticiones.

## Estado de las páginas

Todas las páginas principales están implementadas y conectadas al backend real:
horario y ausencias del recurso, perfil, programador y ejecución del coordinador,
recursos de sede, dashboard e informes del directivo (incluido el comparativo), y
el módulo de administración del supervisor (sedes, usuarios, parámetros, auditoría).

## Convenciones de código

- Componentes: PascalCase, un componente por archivo
- Servicios: camelCase, agrupados por entidad en api.js
- Queries: clave siempre como array `['entidad', ...filtros]`
- Mutaciones: siempre con onSuccess (invalidate) y onError (toast)
- Validaciones críticas: siempre en el backend, el frontend solo muestra el error

## Integración con el backend

Todos los errores del backend deben tener este formato:
```json
{
  "message": "Descripción legible para el usuario",
  "code": "CONFLICTO_HORARIO",
  "detalle": "Recurso ya asignado en Consultorio 6 de 07:00 a 13:00"
}
```

El frontend muestra `message` en toast y `detalle` en el modal de asignación.
