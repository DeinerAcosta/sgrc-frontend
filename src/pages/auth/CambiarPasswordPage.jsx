import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui'

const ROUTES = {
  recurso:     '/app/horario',
  coordinador: '/app/dashboard-coord',
  directivo:   '/app/dashboard',
  supervisor:  '/app/admin/sedes',
}

/**
 * Cambio obligatorio al primer ingreso (cuando el usuario fue creado por
 * aprobación del supervisor con una contraseña provisional, debeCambiarPassword=true).
 * También sirve como cambio voluntario.
 */
export default function CambiarPasswordPage() {
  const navigate = useNavigate()
  const { user, refresh } = useAuthStore()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirm, setConfirm] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => authService.cambiarPassword(actual, nueva),
    onSuccess: async () => {
      toast.success('Contraseña actualizada. ¡Bienvenido!')
      // Refrescar el user para limpiar debe_cambiar_password
      await refresh?.()
      navigate(ROUTES[user?.rol] ?? '/app/horario', { replace: true })
    },
    onError: (err) => toast.error(err?.message ?? 'Error al cambiar la contraseña'),
  })

  const longitudOk = nueva.length >= 8
  const coincide = nueva === confirm
  const distinta = nueva !== actual
  const valid = actual.length > 0 && longitudOk && coincide && distinta

  const obligatorio = user?.debe_cambiar_password

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card">
          <div className="text-center mb-5">
            <div className="w-10 h-10 bg-brand-600 rounded-xl mx-auto mb-3 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SC</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900">
              {obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {obligatorio
                ? 'Antes de ingresar al sistema necesitas reemplazar la contraseña provisional por una propia.'
                : 'Tu nueva contraseña debe tener al menos 8 caracteres.'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">{obligatorio ? 'Contraseña provisional (la que llegó por email)' : 'Contraseña actual'} *</label>
              <input className="input" type="password" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <label className="label">Nueva contraseña *</label>
              <input className="input" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 8 caracteres" />
              {nueva && !longitudOk && <div className="text-xs text-red-600 mt-1">Debe tener al menos 8 caracteres.</div>}
            </div>
            <div>
              <label className="label">Confirmar nueva contraseña *</label>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repítela" />
              {confirm && !coincide && <div className="text-xs text-red-600 mt-1">Las contraseñas no coinciden.</div>}
            </div>
            {actual && nueva && !distinta && (
              <div className="text-xs text-red-600">La nueva contraseña debe ser distinta a la actual.</div>
            )}

            <button className="btn-primary w-full justify-center py-2.5" onClick={() => mutate()} disabled={!valid || isPending}>
              {isPending ? <Spinner size="sm" /> : (obligatorio ? 'Crear y entrar' : 'Guardar y volver')}
            </button>

            {!obligatorio && (
              <button className="btn w-full justify-center" onClick={() => navigate(-1)}>Cancelar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
