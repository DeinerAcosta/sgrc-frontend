import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { usuarioService, sedeService } from '@/services/api'
import { Avatar, Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { ROLES } from '@/utils/helpers'

/**
 * HU-S-02: Supervisor gestiona usuarios del sistema.
 */
export default function AdminUsuariosPage() {
  const qc = useQueryClient()
  const [filtroRol, setFiltroRol] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [editing, setEditing] = useState(null)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['admin-usuarios', filtroRol],
    queryFn: () => usuarioService.list({ rol: filtroRol || undefined }),
  })

  const filtrados = usuarios.filter((u) =>
    !busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()) || u.email.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Gestión de usuarios</h1>
          <p className="text-xs text-gray-500">{usuarios.length} usuarios — {usuarios.filter((u) => u.activo).length} activos</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}>+ Nuevo usuario</button>
      </div>

      <div className="card mb-4">
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Buscar por nombre o correo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="input w-48" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtrados.length === 0 ? (
          <EmptyState icon="👥" title="Sin usuarios" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Usuario</th>
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Sedes</th>
                <th className="px-3 py-2 text-left">Último login</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => {
                const rolInfo = ROLES[u.rol]
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar nombre={u.nombre} size="sm" color={rolInfo?.color ?? 'blue'} />
                        <div>
                          <div className="text-xs font-medium text-gray-900">{u.nombre}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge variant={rolInfo?.color ?? 'gray'}>{rolInfo?.label ?? u.rol}</Badge></td>
                    <td className="px-3 py-2 text-xs text-gray-600">{(u.sedes?.length ?? 0) === 0 ? 'todas' : `${(u.sedes?.length ?? 0)} sede(s)`}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {u.ultimo_login ? format(parseISO(u.ultimo_login.replace(' ', 'T')), 'd MMM HH:mm', { locale: es }) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center"><Badge variant={u.activo ? 'green' : 'red'}>{u.activo ? 'activo' : 'desactivado'}</Badge></td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn text-xs" onClick={() => setEditing(u)}>Editar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && <UsuarioModal usuario={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries(['admin-usuarios']); setEditing(null) }} />}
    </div>
  )
}

function UsuarioModal({ usuario, onClose, onSaved }) {
  const isNew = !usuario.id
  const [form, setForm] = useState({
    nombre: usuario.nombre ?? '',
    email: usuario.email ?? '',
    celular: usuario.celular ?? '',
    rol: usuario.rol ?? 'recurso',
    activo: usuario.activo ?? true,
    sedes: usuario.sedes ?? [],
    motivo: '',
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-admin'],
    queryFn: () => sedeService.list(),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? usuarioService.create(form) : usuarioService.update(usuario.id, form),
    onSuccess: () => { toast.success(isNew ? 'Usuario creado' : 'Usuario actualizado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  const requiereMotivo = !isNew && (form.activo !== usuario.activo)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nuevo usuario' : `Editar: ${usuario.nombre}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div><label className="label">Nombre completo *</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div><label className="label">Correo *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Celular (WhatsApp)</label><input className="input" type="tel" value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} /></div>

          <div>
            <label className="label">Rol *</label>
            <select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              {form.rol === 'directivo' && 'Acceso de lectura a todas las sedes'}
              {form.rol === 'supervisor' && 'Acceso total al sistema'}
              {form.rol === 'coordinador' && 'Acceso a las sedes asignadas abajo'}
              {form.rol === 'recurso' && 'Solo ve su propia información'}
            </div>
          </div>

          {form.rol === 'coordinador' && (
            <div>
              <label className="label">Sedes asignadas</label>
              <div className="border border-gray-200 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
                {sedes.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.sedes.includes(s.id)}
                      onChange={(e) => setForm({
                        ...form,
                        sedes: e.target.checked ? [...form.sedes, s.id] : form.sedes.filter((id) => id !== s.id)
                      })}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
            </div>
          )}

          {!isNew && (
            <div>
              <label className="label">Estado</label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                Usuario activo (puede iniciar sesión)
              </label>
            </div>
          )}

          {requiereMotivo && (
            <div>
              <label className="label">Motivo del cambio de estado *</label>
              <textarea className="input resize-none" rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              <div className="text-xs text-amber-700 mt-1">Quedará en el log de auditoría</div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!form.nombre || !form.email || (requiereMotivo && !form.motivo) || isPending}
          >
            {isPending ? <Spinner size="sm" /> : (isNew ? 'Crear' : 'Guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
