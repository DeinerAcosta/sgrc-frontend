import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { usuarioService, sedeService } from '@/services/api'
import { Avatar, Badge, Spinner, EmptyState } from '@/components/ui'
import { ROLES, TIPOS_RECURSO } from '@/utils/helpers'
import BulkUsuariosModal from '@/pages/admin/BulkUsersModal'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useConfirm } from '@/contexts/ConfirmContext'

/**
 * HU-S-02: Supervisor gestiona usuarios del sistema.
 */
export default function AdminUsuariosPage() {
  const qc = useQueryClient()
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroLogin, setFiltroLogin] = useState('')  // '', 'ingresado', 'nunca'
  const [busqueda, setBusqueda] = useState('')
  const [editing, setEditing] = useState(null)
  const [verDetalle, setVerDetalle] = useState(null)
  const [showBulk, setShowBulk] = useState(false)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['admin-usuarios', filtroRol],
    queryFn: () => usuarioService.list({ role: filtroRol || undefined }),
  })

  // KPIs sobre TODOS los usuarios activos (no afectado por filtros UI)
  const activos = usuarios.filter((u) => u.active)
  const hanIngresado = activos.filter((u) => !!u.last_login_at).length
  const nuncaIngresado = activos.filter((u) => !u.last_login_at).length
  const pctIngresado = activos.length ? Math.round((hanIngresado / activos.length) * 100) : 0
  // Cuántos tienen reenvío registrado (y no han ingresado todavía)
  const credReenviadas = activos.filter((u) => !!u.credentials_resent_at).length
  const credReenviadasSinLogin = activos.filter((u) => !!u.credentials_resent_at && !u.last_login_at).length

  // Orden jerárquico: supervisor → directivo → coordinador → recurso (alfabético dentro de cada uno)
  const ROL_ORDEN = { supervisor: 0, directivo: 1, coordinador: 2, resource: 3 }
  const filtrados = usuarios
    .filter((u) =>
      !busqueda || u.name.toLowerCase().includes(busqueda.toLowerCase()) || u.email.toLowerCase().includes(busqueda.toLowerCase())
    )
    .filter((u) => {
      if (filtroLogin === 'ingresado')    return !!u.last_login_at && u.active !== false
      if (filtroLogin === 'nunca')        return !u.last_login_at && u.active !== false
      if (filtroLogin === 'reenviadas')   return !!u.credentials_resent_at && u.active !== false
      if (filtroLogin === 'sin_reenvio')  return !u.credentials_resent_at && !u.last_login_at && u.active !== false
      if (filtroLogin === 'inactivos')    return u.active === false
      return true
    })
    .slice()
    .sort((a, b) => {
      const ra = ROL_ORDEN[a.role] ?? 99
      const rb = ROL_ORDEN[b.role] ?? 99
      if (ra !== rb) return ra - rb
      return (a.name ?? '').localeCompare(b.name ?? '', 'es')
    })

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Gestión de usuarios</h1>
          <p className="text-xs text-gray-500">{usuarios.length} usuarios — {usuarios.filter((u) => u.active).length} activos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn whitespace-nowrap" onClick={() => setShowBulk(true)} title="Cargar múltiples usuarios en una sola operación; cada uno recibe contraseña provisional por email">
            📥 Crear en lote
          </button>
          <button className="btn-primary" onClick={() => setEditing({})}>+ Nuevo usuario</button>
        </div>
      </div>

      {/* KPI cards de estado de ingreso */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <button
          className={`kpi-card text-left transition-all ${filtroLogin === '' ? 'ring-2 ring-brand-500' : 'hover:bg-gray-50'}`}
          onClick={() => setFiltroLogin('')}
        >
          <div className="text-2xl font-semibold text-gray-900">{activos.length}</div>
          <div className="text-xs text-gray-500">Total activos</div>
        </button>
        <button
          className={`kpi-card text-left transition-all ${filtroLogin === 'ingresado' ? 'ring-2 ring-green-500' : 'hover:bg-gray-50'}`}
          onClick={() => setFiltroLogin(filtroLogin === 'ingresado' ? '' : 'ingresado')}
        >
          <div className="text-2xl font-semibold text-green-600">{hanIngresado}</div>
          <div className="text-xs text-gray-500">Han ingresado ({pctIngresado}%)</div>
        </button>
        <button
          className={`kpi-card text-left transition-all ${filtroLogin === 'nunca' ? 'ring-2 ring-amber-500' : 'hover:bg-gray-50'}`}
          onClick={() => setFiltroLogin(filtroLogin === 'nunca' ? '' : 'nunca')}
        >
          <div className="text-2xl font-semibold text-amber-600">{nuncaIngresado}</div>
          <div className="text-xs text-gray-500">Nunca han ingresado</div>
        </button>
        <button
          type="button"
          className={`kpi-card text-left transition-all ${filtroLogin === 'inactivos' ? 'ring-2 ring-red-500' : 'hover:bg-gray-50'}`}
          onClick={() => setFiltroLogin(filtroLogin === 'inactivos' ? '' : 'inactivos')}
        >
          <div className="text-2xl font-semibold text-red-600">{usuarios.length - activos.length}</div>
          <div className="text-xs text-gray-500">Inactivos</div>
        </button>
      </div>

      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Buscar por nombre o correo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="input w-full sm:w-48" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-full sm:w-56" value={filtroLogin} onChange={(e) => setFiltroLogin(e.target.value)}>
            <option value="">Estado: todos</option>
            <option value="ingresado">✓ Han ingresado</option>
            <option value="nunca">⏳ Nunca han ingresado</option>
            <option value="reenviadas">📤 Credenciales reenviadas</option>
            <option value="sin_reenvio">❗ Sin reenvío ni login</option>
            <option value="inactivos">❌ Solo inactivos</option>
          </select>
        </div>
        {(busqueda || filtroRol || filtroLogin) && (
          <div className="mt-2 text-xs text-gray-500">
            Mostrando <strong>{filtrados.length}</strong> de {usuarios.length}
            {filtroLogin === 'nunca' && ' · 💡 estos pueden necesitar reenvío de credenciales'}
            {filtroLogin === 'sin_reenvio' && ' · 💡 estos NO han recibido reenvío y NO han entrado — empezar por aquí'}
            {filtroLogin === 'reenviadas' && ' · 📤 ya les enviaste credenciales recientemente'}
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtrados.length === 0 ? (
          <EmptyState icon="👥" title="Sin usuarios" />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[720px]">
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
                const rolInfo = ROLES[u.role]
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Avatar nombre={u.name} size="sm" color={rolInfo?.color ?? 'blue'} />
                          {/* Indicador de presencia (long-polling): verde si activo <60s, ámbar <5min, gris luego */}
                          {(() => {
                            if (!u.last_seen_at) return null
                            const ms = Date.now() - new Date(u.last_seen_at).getTime()
                            const cls = ms < 60_000 ? 'bg-green-500' : ms < 300_000 ? 'bg-amber-400' : 'bg-gray-300'
                            return <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${cls}`} title={ms < 60_000 ? 'En línea' : ms < 300_000 ? 'Hace poco' : 'Desconectado'} />
                          })()}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-900">{u.name}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge variant={rolInfo?.color ?? 'gray'}>{rolInfo?.label ?? u.role}</Badge></td>
                    <td className="px-3 py-2 text-xs text-gray-600">{(u.sites?.length ?? 0) === 0 ? 'todas' : `${(u.sites?.length ?? 0)} sede(s)`}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {u.last_login_at ? (
                        format(parseISO(u.last_login_at.replace(' ', 'T')), 'd MMM HH:mm', { locale: es })
                      ) : u.credentials_resent_at ? (
                        <span className="text-blue-600" title={`Credenciales reenviadas el ${format(parseISO(u.credentials_resent_at.replace(' ', 'T')), "d MMM 'a las' HH:mm", { locale: es })}`}>
                          📤 Reenviadas {format(parseISO(u.credentials_resent_at.replace(' ', 'T')), 'd MMM', { locale: es })}
                        </span>
                      ) : (
                        <span className="text-gray-400">— sin actividad</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={u.active ? 'green' : 'red'}>{u.active ? 'activo' : 'desactivado'}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="btn text-xs px-2"
                          onClick={() => setVerDetalle(u)}
                          title="Ver detalle del usuario"
                          aria-label="Ver detalle"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-5M12 8h.01" />
                          </svg>
                        </button>
                        <button className="btn text-xs" onClick={() => setEditing(u)}>Editar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {editing !== null && <UsuarioModal usuario={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-usuarios'] }); setEditing(null) }} />}
      {verDetalle && <DetalleUsuarioModal usuario={verDetalle} onClose={() => setVerDetalle(null)} onEdit={() => { setEditing(verDetalle); setVerDetalle(null) }} onReenviado={() => qc.invalidateQueries({ queryKey: ['admin-usuarios'] })} />}
      {showBulk && <BulkUsuariosModal onClose={() => setShowBulk(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-usuarios'] }); setShowBulk(false) }} />}
    </div>
  )
}

function DetalleUsuarioModal({ usuario, onClose, onEdit, onReenviado }) {
  const rolInfo = ROLES[usuario.role]
  const sedes = usuario.site_names ?? []
  const confirm = useConfirm()
  const [reenviando, setReenviando] = useState(false)

  const reenviarCredenciales = async () => {
    const ok = await confirm({
      title: '¿Reenviar credenciales?',
      message: `Se reseteará la contraseña de ${usuario.name.split(' ')[0]} a la contraseña provisional común (SGRC2026!) y se le enviará el email de bienvenida nuevamente. El usuario tendrá que cambiarla en su próximo ingreso.`,
      confirmLabel: 'Sí, reenviar',
      cancelLabel: 'Cancelar',
      variant: 'info',
    })
    if (!ok) return
    setReenviando(true)
    try {
      const resp = await usuarioService.reenviarCredenciales(usuario.id)
      const dest = resp?.email ?? usuario.email
      const smtpMsg = resp?.smtp_activo
        ? `Email enviado a ${dest}`
        : `Credenciales reseteadas. SMTP no está activo — comunícale manualmente: ${dest} / SGRC2026!`
      toast.success(smtpMsg, { duration: 6000 })
      onReenviado?.()
    } catch (err) {
      toast.error(err?.message ?? 'Error al reenviar credenciales')
    } finally {
      setReenviando(false)
    }
  }
  const formatFecha = (iso) => {
    if (!iso) return '—'
    try { return format(parseISO(iso.replace(' ', 'T')), "d 'de' MMMM yyyy, HH:mm", { locale: es }) }
    catch { return iso }
  }
  // Estado online aproximado
  let presenciaLabel = 'Desconectado', presenciaColor = 'gray'
  if (usuario.last_seen_at) {
    const ms = Date.now() - new Date(usuario.last_seen_at).getTime()
    if (ms < 60_000) { presenciaLabel = 'En línea ahora'; presenciaColor = 'green' }
    else if (ms < 300_000) { presenciaLabel = 'Hace poco'; presenciaColor = 'amber' }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="relative">
              <Avatar nombre={usuario.name} size="md" color={rolInfo?.color ?? 'blue'} />
              {usuario.last_seen_at && (
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                  presenciaColor === 'green' ? 'bg-green-500' : presenciaColor === 'amber' ? 'bg-amber-400' : 'bg-gray-300'
                }`} />
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{usuario.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={rolInfo?.color ?? 'gray'}>{rolInfo?.label ?? usuario.role}</Badge>
                <Badge variant={usuario.active ? 'green' : 'red'}>{usuario.active ? 'activo' : 'desactivado'}</Badge>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto text-sm">
          <Section title="Contacto">
            <Row label="Correo electrónico" value={usuario.email} mono />
            <Row label="Celular (WhatsApp)" value={usuario.phone || '—'} mono />
          </Section>

          {usuario.role === 'recurso' && (
            <Section title="Datos del recurso">
              <Row label="Tipo" value={usuario.type ?? '—'} capitalize />
              <Row label="Especialidad" value={usuario.specialty || '—'} />
              <Row label="Horas máx. semana" value={usuario.max_hours_per_week == null ? 'Sin tope (por paciente)' : `${usuario.max_hours_per_week} h`} />
              <Row label="Horas máx. día" value={usuario.max_hours_per_day ?? '—'} suffix="h" />
              <Row label="Intervalo entre pacientes" value={usuario.slot_minutes ?? '—'} suffix="min" />
              <Row label="Esquema de pago" value={usuario.pay_scheme ?? '—'} capitalize />
              <Row label="Multi-consultorio" value={usuario.multi_room ? 'Sí (rota entre salas)' : 'No'} />
              <Row
                label="Coordinador-líder"
                value={usuario.coordinador_lider_nombre || <span className="text-amber-700 italic">sin líder asignado</span>}
              />
            </Section>
          )}

          <Section title={
            sedes.length === 0
              ? (['directivo', 'supervisor', 'gerencia'].includes(usuario.role) ? 'Sedes (todas)' : 'Sedes')
              : `Sedes (${sedes.length})`
          }>
            {sedes.length === 0 ? (
              (['directivo', 'supervisor', 'gerencia'].includes(usuario.role)) ? (
                <div className="text-xs text-gray-500 italic">Vista global — acceso a todas las sedes del sistema</div>
              ) : (
                <div className="text-xs text-amber-700 italic">⚠️ Sin sedes asignadas — el usuario no podrá ver datos</div>
              )
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sedes.map((s) => <Badge key={s} variant="blue">{s}</Badge>)}
              </div>
            )}
          </Section>

          <Section title="Actividad">
            <Row label="Último login" value={formatFecha(usuario.last_login_at)} />
            <Row label="Última actividad" value={formatFecha(usuario.last_seen_at)} />
            <Row label="Presencia" value={presenciaLabel} />
            <Row label="Debe cambiar contraseña" value={usuario.must_change_password ? 'Sí — en próximo login' : 'No'} />
          </Section>

          <Section title="Metadata">
            <Row label="ID interno" value={usuario.id} mono small />
            <Row label="Fecha de creación" value={formatFecha(usuario.created_at)} />
          </Section>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cerrar</button>
          <button
            className="btn flex-1 justify-center"
            onClick={reenviarCredenciales}
            disabled={reenviando}
            title="Resetear contraseña a SGRC2026! y reenviar email de bienvenida"
          >
            {reenviando ? <Spinner size="sm" /> : '🔁 Reenviar credenciales'}
          </button>
          <button className="btn-primary flex-1 justify-center" onClick={onEdit}>✏️ Editar</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, mono = false, capitalize = false, suffix = '', small = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-right ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''} ${small ? 'text-xs text-gray-500' : 'text-sm text-gray-800'}`}>
        {value}{suffix && value !== '—' ? ` ${suffix}` : ''}
      </span>
    </div>
  )
}

function UsuarioModal({ usuario, onClose, onSaved }) {
  const isNew = !usuario.id
  const [form, setForm] = useState({
    name: usuario.name ?? '',
    email: usuario.email ?? '',
    phone: usuario.phone ?? '',
    role: usuario.role ?? 'recurso',
    active: usuario.active ?? true,
    sites: usuario.sites ?? [],
    leadCoordinatorId: usuario.lead_coordinator_id ?? null,
    // Tipo de recurso (auxiliar/tecnico/etc.) — solo aplica si rol=recurso
    resourceType: usuario.type ?? '',
    reason: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-admin'],
    queryFn: () => sedeService.list(),
  })

  // Para el dropdown de líder: traer todos los coordinadores activos
  const { data: coordinadores = [] } = useQuery({
    queryKey: ['coordinadores-para-lider'],
    queryFn: () => usuarioService.list({ role: 'coordinador' }),
    enabled: form.role === 'recurso',
  })

  const confirm = useConfirm()

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? usuarioService.create(form) : usuarioService.update(usuario.id, form),
    onSuccess: () => { toast.success(isNew ? 'Usuario creado' : 'Usuario actualizado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  const { mutate: doRemove, isPending: removing } = useMutation({
    mutationFn: (hard) => usuarioService.remove(usuario.id, hard),
    onSuccess: (res) => {
      toast.success(res?.modo === 'hard' ? 'Usuario eliminado completamente' : 'Usuario desactivado')
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al eliminar'),
  })

  const confirmarEliminar = async () => {
    const ok = await confirm({
      title: '¿Eliminar usuario?',
      message: (
        <div className="space-y-2 text-sm">
          <p>Vas a eliminar a <strong>{usuario.name}</strong> ({usuario.email}).</p>
          <p className="text-xs text-gray-600">
            <strong>Por seguridad</strong>, se desactivará en el sistema (no podrá iniciar sesión)
            pero se conservará el historial de asignaciones y reportes. Esto es lo recomendado.
          </p>
        </div>
      ),
      confirmLabel: '🚫 Desactivar usuario',
      tono: 'danger',
    })
    if (ok) doRemove(false)
  }

  const requiereMotivo = !isNew && (form.active !== usuario.active)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nuevo usuario' : `Editar: ${usuario.name}`}</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {isNew && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              🔐 La contraseña inicial será <strong>SGRC2026!</strong>. El usuario podrá cambiarla después desde su perfil.
            </div>
          )}
          <div><label className="label">Nombre completo *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Correo *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Celular (WhatsApp)</label><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>

          <div>
            <label className="label">Rol *</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              {form.role === 'directivo' && 'Acceso de lectura a todas las sedes'}
              {form.role === 'supervisor' && 'Acceso total al sistema'}
              {form.role === 'gerencia' && 'Super-usuario: acceso total + dashboards ejecutivos'}
              {form.role === 'coordinador' && 'Acceso a las sedes asignadas abajo'}
              {form.role === 'recurso' && 'Solo ve su propia información'}
            </div>
          </div>

          {form.role === 'recurso' && (
            <div>
              <label className="label">Tipo de recurso *</label>
              <select
                className="input"
                value={form.resourceType}
                onChange={(e) => setForm({ ...form, resourceType: e.target.value })}
              >
                <option value="">— Seleccionar tipo —</option>
                {TIPOS_RECURSO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">
                {isNew
                  ? 'Define qué hace esta persona — auxiliar, técnico, optómetra, oftalmólogo, anestesiólogo o asesor.'
                  : 'Corrige el tipo si la persona se equivocó al registrarse (ej: puso "Auxiliar" pero realmente es "Técnico").'}
              </div>
              {!isNew && form.resourceType && form.resourceType !== usuario.type && (
                <div className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ Vas a cambiar de <strong>{TIPOS_RECURSO.find(t => t.value === usuario.type)?.label ?? usuario.type ?? '(sin tipo)'}</strong> a <strong>{TIPOS_RECURSO.find(t => t.value === form.resourceType)?.label}</strong>. El cambio queda en auditoría.
                </div>
              )}
            </div>
          )}

          {(form.role === 'coordinador' || form.role === 'recurso') && (
            <div>
              <label className="label">
                Sedes asignadas
                <span className="text-xs text-gray-400 font-normal ml-1">
                  ({form.sites.length} seleccionada{form.sites.length === 1 ? '' : 's'})
                </span>
              </label>
              <div className="border border-gray-200 rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
                {sedes.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs hover:bg-gray-50 px-1 py-0.5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.sites.includes(s.id)}
                      onChange={(e) => setForm({
                        ...form,
                        sites: e.target.checked ? [...form.sites, s.id] : form.sites.filter((id) => id !== s.id)
                      })}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {form.role === 'coordinador'
                  ? 'El coordinador podrá programar y gestionar las sedes marcadas.'
                  : 'Los recursos rotan entre estas sedes. Selecciónalas todas en las que puede trabajar.'}
              </div>
              {form.sites.length === 0 && (
                <div className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ Sin sedes el {form.role === 'coordinador' ? 'coordinador' : 'recurso'} no podrá {form.role === 'coordinador' ? 'gestionar nada' : 'ser programado'} en ningún consultorio.
                </div>
              )}
            </div>
          )}

          {form.role === 'recurso' && !isNew && (
            <div>
              <label className="label">Coordinador-líder</label>
              <select
                className="input"
                value={form.leadCoordinatorId ?? ''}
                onChange={(e) => setForm({ ...form, leadCoordinatorId: e.target.value || null })}
              >
                <option value="">— Sin líder asignado —</option>
                {coordinadores
                  .slice()
                  .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">
                Coordinador responsable de medir KPIs (productividad, ausencias) de este recurso. Aunque trabaje en otras sedes, los KPIs se miden con su líder.
              </div>
            </div>
          )}

          {!isNew && (
            <div>
              <label className="label">Estado</label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Usuario activo (puede iniciar sesión)
              </label>
            </div>
          )}

          {requiereMotivo && (
            <div>
              <label className="label">Motivo del cambio de estado *</label>
              <textarea className="input resize-none" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <div className="text-xs text-amber-700 mt-1">Quedará en el log de auditoría</div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 flex-shrink-0">
          {!isNew && (
            <button
              className="btn-danger sm:mr-auto justify-center whitespace-nowrap"
              onClick={confirmarEliminar}
              disabled={removing || isPending}
              title="Desactivar usuario (conserva historial)"
            >
              {removing ? <Spinner size="sm" /> : '🗑️ Eliminar'}
            </button>
          )}
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!form.name || !form.email || (isNew && form.role === 'recurso' && !form.resourceType) || (requiereMotivo && !form.reason) || isPending || removing}
          >
            {isPending ? <Spinner size="sm" /> : (isNew ? 'Crear' : 'Guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
