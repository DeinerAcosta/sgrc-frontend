import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usuarioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar, Spinner, SectionHeader, Badge } from '@/components/ui'
import { ROLES } from '@/utils/helpers'

export default function PerfilPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState(user?.email ?? '')
  const [celular, setCelular] = useState(user?.phone ?? '')
  const [editando, setEditando] = useState(false)

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => usuarioService.actualizarPerfil({ email, phone: celular }),
    onSuccess: () => {
      toast.success('Datos actualizados. Si cambiaste el correo, te llegará un email de verificación.')
      setEditando(false)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const rolInfo = ROLES[user?.role]

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Mi perfil</h1>
        <p className="text-xs text-gray-500">Actualiza tus datos de contacto para recibir notificaciones</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
          <Avatar nombre={user?.name} size="lg" color="blue" />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{user?.name}</div>
            <Badge variant={rolInfo?.color ?? 'gray'} className="mt-1">{rolInfo?.label ?? user?.role}</Badge>
          </div>
          {!editando && (
            <button className="btn" onClick={() => setEditando(true)}>Editar</button>
          )}
        </div>

        <SectionHeader title="Datos de contacto" />
        <div className="space-y-4">
          <div>
            <label className="label">Correo electrónico</label>
            {editando ? (
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <div className="text-sm text-gray-700">{user?.email}</div>
            )}
            {editando && (
              <div className="text-xs text-amber-700 mt-1">
                ⚠️ Cambiar el correo requiere verificación al nuevo correo antes de ser efectivo.
              </div>
            )}
          </div>

          <div>
            <label className="label">Celular (WhatsApp)</label>
            {editando ? (
              <input className="input" type="tel" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="300 555 1234" />
            ) : (
              <div className="text-sm text-gray-700">{user?.phone ?? <span className="text-gray-300">Sin registrar</span>}</div>
            )}
            {editando && (
              <div className="text-xs text-gray-500 mt-1">
                Este número recibirá las alertas de cambios en tu horario y confirmaciones.
              </div>
            )}
          </div>
        </div>

        {editando && (
          <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
            <button className="btn flex-1 justify-center" onClick={() => { setEditando(false); setEmail(user?.email); setCelular(user?.phone) }}>
              Cancelar
            </button>
            <button className="btn-primary flex-1 justify-center" onClick={() => guardar()} disabled={isPending}>
              {isPending ? <Spinner size="sm" /> : 'Guardar cambios'}
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <SectionHeader title="Información de cuenta" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-gray-400">Tipo de recurso</div>
              <div className="text-gray-700 capitalize">{user?.type ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Especialidad</div>
              <div className="text-gray-700">{user?.specialty ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Sede(s) asignada(s)</div>
              <div className="text-gray-700">{user?.site_names?.join(', ') ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Horas máx. semana</div>
              <div className="text-gray-700">{user?.max_hours_per_week ?? '—'}h</div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <SectionHeader title="Seguridad" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm text-gray-700">Contraseña</div>
              <div className="text-xs text-gray-400 mt-0.5">Cámbiala periódicamente para mantener tu cuenta segura.</div>
            </div>
            <button
              className="btn"
              onClick={() => navigate('/cambiar-password')}
            >
              🔑 Cambiar contraseña
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            Todos los cambios quedan registrados en el log de auditoría con tu usuario y fecha.
          </div>
        </div>
      </div>
    </div>
  )
}
