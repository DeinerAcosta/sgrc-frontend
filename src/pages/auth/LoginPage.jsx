import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService, DEMO_MODE } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner, Badge } from '@/components/ui'

const ROUTES = {
  recurso:     '/app/horario',
  coordinador: '/app/dashboard-coord',
  directivo:   '/app/dashboard',
  supervisor:  '/app/dashboard',
}

const DEMO_ROLES = [
  { rol: 'recurso',     label: 'Recurso',     color: 'green',  desc: 'Auxiliar / médico / técnico — ve su propio horario' },
  { rol: 'coordinador', label: 'Coordinador', color: 'blue',   desc: 'Programa, confirma ausencias, registra ejecución' },
  { rol: 'directivo',   label: 'Directivo',   color: 'purple', desc: 'Dashboard ejecutivo + informes globales' },
  { rol: 'supervisor',  label: 'Supervisor',  color: 'amber',  desc: 'Acceso total + parametrización + auditoría' },
]

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [forgot, setForgot]     = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const goAfterLogin = ({ user, token }) => {
    login(user, token)
    // Cambio obligatorio al primer ingreso (HU-S-XX): si el usuario fue creado
    // con contraseña provisional, lo enviamos a cambiarla antes de su panel.
    if (user.debe_cambiar_password) {
      navigate('/cambiar-password', { replace: true })
      return
    }
    navigate(ROUTES[user.rol] ?? '/app/horario', { replace: true })
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
    onSuccess: () => { toast.success('Te enviamos un enlace de recuperación'); setForgot(false) },
    onError: () => toast.error('No encontramos ese correo'),
  })

  if (forgot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="card">
            <div className="text-center mb-6">
              <div className="w-10 h-10 bg-brand-600 rounded-xl mx-auto mb-3 flex items-center justify-center">
                <span className="text-white font-bold text-sm">SC</span>
              </div>
              <h1 className="text-base font-semibold text-gray-900">Recuperar contraseña</h1>
              <p className="text-xs text-gray-500 mt-1">Te enviaremos un enlace a tu correo</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Correo electrónico</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
              </div>
              <button className="btn-primary w-full justify-center" onClick={() => doForgot()} disabled={!email || sendingForgot}>
                {sendingForgot ? <Spinner size="sm" /> : 'Enviar enlace'}
              </button>
              <button className="btn w-full justify-center" onClick={() => setForgot(false)}>Volver al login</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-brand-600 rounded-2xl mx-auto mb-3 flex items-center justify-center">
              <span className="text-white font-bold">SC</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">SGRC</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gestión de Recursos Clínicos</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Contraseña</label>
                <button onClick={() => setForgot(true)} className="text-xs text-brand-600 hover:underline">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <input
                className="input"
                type="password"
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
          </div>

          {DEMO_MODE && (
            <>
              <div className="flex items-center gap-2 my-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">o entra como</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ROLES.map((r) => (
                  <button
                    key={r.rol}
                    className="btn justify-start text-left py-2.5 px-3"
                    onClick={() => doLoginAs(r.rol)}
                    disabled={pendingAs}
                    title={r.desc}
                  >
                    <Badge variant={r.color} className="text-xs">{r.label}</Badge>
                  </button>
                ))}
              </div>
              <p className="text-xs text-center text-gray-400 mt-4">
                Modo demo — sin backend. Cualquier botón te lleva al dashboard del rol.
              </p>
            </>
          )}

          {!DEMO_MODE && (
            <>
              <div className="text-center text-xs text-gray-500 mt-5">
                ¿Aún no tienes cuenta?{' '}
                <button onClick={() => navigate('/registro')} className="text-brand-600 hover:underline font-medium">
                  Regístrate aquí
                </button>
              </div>
              <p className="text-xs text-center text-gray-400 mt-3">
                ¿Problemas para acceder? Contacta al supervisor del sistema.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
