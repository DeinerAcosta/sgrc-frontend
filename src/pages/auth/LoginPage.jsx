import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService, DEMO_MODE } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { rutaDeEntrada } from '@/config/nav'
import { Spinner, Badge, PasswordInput } from '@/components/ui'
import viuLogo from '@/assets/brand/viu-blanco-horizontal.png'
import focaLogo from '@/assets/brand/foca-blanco.png'

// Oct-2026 · El mapa de destinos vive en config/nav.js, junto al menú.
// Aquí había una copia con la clave `resource` en vez de `recurso` —así que
// ese rol nunca la encontraba— y sin `reprogramador`, que entraba a
// /app/horario, no podía abrirlo, y quedaba en blanco.

const DEMO_ROLES = [
  { role: 'recurso',     label: 'Recurso',     color: 'green',  desc: 'Auxiliar / médico / técnico — ve su propio horario' },
  { role: 'coordinador', label: 'Coordinador', color: 'blue',   desc: 'Programa, confirma ausencias, registra ejecución' },
  { role: 'directivo',   label: 'Directivo',   color: 'purple', desc: 'Dashboard ejecutivo + informes globales' },
  { role: 'supervisor',  label: 'Supervisor',  color: 'amber',  desc: 'Acceso total + parametrización + auditoría' },
]

/**
 * Panel izquierdo de identidad — se reutiliza en login y recuperación.
 * VIU + FOCA del mismo tamaño lado a lado sobre fondo marino institucional.
 */
function BrandPanel() {
  return (
    <div className="hidden md:flex md:flex-col md:justify-between md:items-center bg-brand-600 text-white px-8 py-10 md:w-[45%]">
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="flex items-center justify-center gap-5 w-full mb-8 px-2">
          <img src={viuLogo}  alt="VIU — Clínica Oftalmológica Internacional" className="h-20 w-auto object-contain shrink min-w-0" />
          <div className="w-px h-16 bg-white/25 shrink-0" />
          <img src={focaLogo} alt="Fundación FOCA" className="h-20 w-auto object-contain shrink min-w-0" />
        </div>
        <div className="text-center mt-4">
          <p className="text-xs uppercase tracking-[0.2em] text-iris-blue/90">Sistema de gestión</p>
          <p className="text-2xl font-semibold mt-1">Recursos Clínicos</p>
          <p className="text-xs text-iris-blue/80 mt-3 max-w-xs mx-auto leading-relaxed">
            Programación, ejecución y reportería para todas las sedes
          </p>
        </div>
      </div>
      <p className="text-[10px] text-white/40 tracking-wider uppercase mt-6">
        © {new Date().getFullYear()} VIU · Clínica Oftalmológica Internacional
      </p>
    </div>
  )
}

/**
 * Layout marco — split en pantallas medianas, panel azul oculto en móvil
 * y reemplazado por una barra superior compacta para no perder identidad.
 */
function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col md:flex-row">
        {/* Header mobile (solo en sm) — versión compacta del brand */}
        <div className="md:hidden bg-brand-600 px-6 py-4 flex items-center justify-center gap-4">
          <img src={viuLogo}  alt="VIU"  className="h-10 w-auto object-contain" />
          <div className="w-px h-8 bg-white/20" />
          <img src={focaLogo} alt="FOCA" className="h-10 w-auto object-contain" />
        </div>
        <BrandPanel />
        <div className="flex-1 px-6 py-8 md:px-10 md:py-12 flex flex-col justify-center">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [forgot, setForgot]     = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const goAfterLogin = ({ user, token, refreshToken }) => {
    login(user, token, refreshToken)
    if (user.must_change_password) {
      navigate('/cambiar-password', { replace: true })
      return
    }
    navigate(rutaDeEntrada(user.role), { replace: true })
  }

  const { mutate: doLogin, isPending } = useMutation({
    mutationFn: () => authService.login(email, password),
    onSuccess: goAfterLogin,
    onError: (err) => toast.error(err?.message ?? 'Credenciales incorrectas'),
  })

  const { mutate: doLoginAs, isPending: pendingAs } = useMutation({
    mutationFn: (rol) => authService.loginAs(rol),
    onSuccess: goAfterLogin,
  })

  const { mutate: doForgot, isPending: sendingForgot } = useMutation({
    mutationFn: () => authService.forgotPassword(email),
    onSuccess: () => { toast.success('Le enviamos un enlace de recuperación'); setForgot(false) },
    onError: () => toast.error('No encontramos ese correo'),
  })

  if (forgot) {
    return (
      <AuthLayout>
        <p className="text-[11px] tracking-[0.18em] text-brand-600 font-medium">RECUPERAR ACCESO</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">¿Olvidó su contraseña?</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Ingrese su correo y le enviaremos un enlace para restablecerla.
        </p>
        <div className="space-y-4">
          <div>
            <label className="label">Correo electrónico <span className="text-red-600">*</span></label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@correo.com"
              onKeyDown={(e) => e.key === 'Enter' && doForgot()}
            />
          </div>
          <button className="btn-primary w-full justify-center py-2.5" onClick={() => doForgot()} disabled={!email || sendingForgot}>
            {sendingForgot ? <Spinner size="sm" /> : 'Enviar enlace'}
          </button>
          <button className="btn w-full justify-center" onClick={() => setForgot(false)}>Volver al inicio de sesión</button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <p className="text-[11px] tracking-[0.18em] text-brand-600 font-medium">BIENVENIDO</p>
      <h1 className="text-2xl font-semibold text-gray-900 mt-1">Inicie sesión</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Acceda al panel de gestión de recursos clínicos.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Correo electrónico <span className="text-red-600">*</span></label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@correo.com"
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Contraseña <span className="text-red-600">*</span></label>
            <button onClick={() => setForgot(true)} className="text-xs text-brand-600 hover:underline">
              ¿Olvidó su contraseña?
            </button>
          </div>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
        </div>

        <button
          className="btn-primary w-full justify-center py-2.5"
          onClick={() => doLogin()}
          disabled={!email || !password || isPending}
        >
          {isPending ? <Spinner size="sm" /> : 'Ingresar'}
        </button>

        {/* Sep-2026: enlace visible al autoregistro. Antes vivia solo como
            ruta directa /registro sin puerta de entrada desde el login. */}
        <div className="text-center text-xs text-gray-500 pt-1">
          ¿No tiene cuenta?{' '}
          <button
            type="button"
            onClick={() => navigate('/registro')}
            className="text-brand-600 hover:underline font-medium"
          >
            Solicite su registro
          </button>
        </div>
      </div>

      {DEMO_MODE && (
        <>
          <div className="flex items-center gap-2 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">o entre como</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ROLES.map((r) => (
              <button
                key={r.role}
                className="btn justify-start text-left py-2.5 px-3"
                onClick={() => doLoginAs(r.role)}
                disabled={pendingAs}
                title={r.desc}
              >
                <Badge variant={r.color} className="text-xs">{r.label}</Badge>
              </button>
            ))}
          </div>
          <p className="text-xs text-center text-gray-400 mt-4">
            Modo demo — sin backend. Cualquier botón lo lleva al dashboard del rol.
          </p>
        </>
      )}

      {!DEMO_MODE && (
        <p className="text-xs text-center text-gray-400 mt-6">
          ¿Problemas para acceder? Comuníquese con el supervisor del sistema.
        </p>
      )}
    </AuthLayout>
  )
}
