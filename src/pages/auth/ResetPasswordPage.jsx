import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService } from '@/services/api'
import { Spinner, PasswordInput } from '@/components/ui'

/**
 * Página a la que llega el usuario cuando hace click en el enlace del email
 * de "Olvidé mi contraseña". El token viene en el query string (?token=...)
 * y es válido 1 hora. Tras setear la nueva contraseña, redirige al login.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [nueva, setNueva] = useState('')
  const [confirm, setConfirm] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => authService.resetPassword(token, nueva),
    onSuccess: () => {
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.')
      navigate('/login', { replace: true })
    },
    onError: (err) => toast.error(err?.message ?? 'El enlace expiró o no es válido. Solicita uno nuevo.'),
  })

  const longitudOk = nueva.length >= 8
  const coincide = nueva === confirm
  const valid = !!token && longitudOk && coincide

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="card text-center">
            <div className="text-4xl mb-3">🔗</div>
            <h1 className="text-base font-semibold text-gray-900">Enlace no válido</h1>
            <p className="text-xs text-gray-500 mt-2 mb-4">
              Este enlace no tiene token. Si llegaste aquí por error, vuelve al login
              y solicita un nuevo enlace de recuperación.
            </p>
            <button className="btn-primary w-full justify-center" onClick={() => navigate('/login')}>
              Volver al login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card">
          <div className="text-center mb-5">
            <div className="w-10 h-10 bg-brand-600 rounded-xl mx-auto mb-3 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SC</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900">Restablecer contraseña</h1>
            <p className="text-xs text-gray-500 mt-1">
              Escribe tu nueva contraseña. Tiene que tener al menos 8 caracteres.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Nueva contraseña *</label>
              <PasswordInput
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoFocus
              />
              {nueva && !longitudOk && (
                <div className="text-xs text-red-600 mt-1">Debe tener al menos 8 caracteres.</div>
              )}
            </div>
            <div>
              <label className="label">Confirmar nueva contraseña *</label>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repítela"
                onKeyDown={(e) => e.key === 'Enter' && valid && mutate()}
              />
              {confirm && !coincide && (
                <div className="text-xs text-red-600 mt-1">Las contraseñas no coinciden.</div>
              )}
            </div>

            <button
              className="btn-primary w-full justify-center py-2.5"
              onClick={() => mutate()}
              disabled={!valid || isPending}
            >
              {isPending ? <Spinner size="sm" /> : 'Guardar nueva contraseña'}
            </button>

            <button className="btn w-full justify-center" onClick={() => navigate('/login')}>
              Volver al login
            </button>
          </div>

          <p className="text-xs text-center text-gray-400 mt-5">
            El enlace es válido por 1 hora desde que lo solicitaste.
          </p>
        </div>
      </div>
    </div>
  )
}
