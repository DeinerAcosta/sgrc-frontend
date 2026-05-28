import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { sedeService, consultorioService, usuarioService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'

const ESPECIALIDADES = [
  { value: 'oftalmologia',  label: 'Oftalmología' },
  { value: 'optometria',    label: 'Optometría' },
  { value: 'anestesiologia', label: 'Anestesiología' },
  { value: 'diagnostico',   label: 'Métodos diagnósticos' },
]

/**
 * HU-S-03: Supervisor agrega/edita sedes y consultorios.
 * Solo desactivación, nunca eliminación (mantiene historial).
 */
export default function AdminSedesPage() {
  const qc = useQueryClient()
  const [showSede, setShowSede] = useState(null)
  const [showCons, setShowCons] = useState(null)
  const [expandedSede, setExpandedSede] = useState(null)

  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ['admin-sedes'],
    queryFn: () => sedeService.list(),
  })

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Sedes y consultorios</h1>
          <p className="text-xs text-gray-500">Gestiona la red física de la organización</p>
        </div>
        <button className="btn-primary" onClick={() => setShowSede({})}>+ Nueva sede</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : sedes.length === 0 ? (
        <EmptyState icon="🏢" title="Sin sedes registradas" />
      ) : (
        <div className="space-y-2">
          {sedes.map((s) => (
            <SedeCard
              key={s.id}
              sede={s}
              expanded={expandedSede === s.id}
              onExpand={() => setExpandedSede(expandedSede === s.id ? null : s.id)}
              onEdit={() => setShowSede(s)}
              onAddCons={() => setShowCons({ sede_id: s.id })}
              onEditCons={(c) => setShowCons(c)}
            />
          ))}
        </div>
      )}

      {showSede !== null && <SedeModal sede={showSede} onClose={() => setShowSede(null)} onSaved={() => { qc.invalidateQueries(['admin-sedes']); setShowSede(null) }} />}
      {showCons !== null && <ConsultorioModal cons={showCons} onClose={() => setShowCons(null)} onSaved={() => { qc.invalidateQueries(['admin-sedes']); qc.invalidateQueries(['consultorios']); setShowCons(null) }} />}
    </div>
  )
}

function SedeCard({ sede, expanded, onExpand, onEdit, onAddCons, onEditCons }) {
  const { data: consultorios = [] } = useQuery({
    queryKey: ['consultorios', sede.id],
    queryFn: () => consultorioService.list({ sede_id: sede.id }),
    enabled: expanded,
  })

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <button className="text-gray-400" onClick={onExpand}>{expanded ? '▼' : '▶'}</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{sede.nombre}</span>
            <Badge variant={sede.activa ? 'green' : 'gray'}>{sede.activa ? 'activa' : 'inactiva'}</Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{sede.ciudad} · {sede.direccion}</div>
        </div>
        <button className="btn text-xs" onClick={onEdit}>Editar</button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-700">Consultorios ({consultorios.length})</span>
            <button className="btn text-xs" onClick={onAddCons}>+ Agregar consultorio</button>
          </div>
          <div className="space-y-1">
            {consultorios.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-800 flex-1">{c.nombre}</span>
                <Badge variant="blue">{c.especialidad}</Badge>
                {c.requiere_auxiliar && <Badge variant="purple">requiere aux</Badge>}
                <Badge variant={c.activo ? 'green' : 'gray'}>{c.activo ? 'activo' : 'inactivo'}</Badge>
                <button className="btn text-xs" onClick={() => onEditCons(c)}>Editar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SedeModal({ sede, onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre: sede.nombre ?? '',
    ciudad: sede.ciudad ?? '',
    direccion: sede.direccion ?? '',
    activa: sede.activa ?? true,
    responsable_id: sede.responsable_id ?? sede.responsable?.id ?? '',
  })
  const isNew = !sede.id

  // Solo coordinadores y supervisores pueden ser responsables de sede
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-para-responsable'],
    queryFn: () => usuarioService.list({ rol: 'coordinador' }),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? sedeService.create(form) : sedeService.update(sede.id, form),
    onSuccess: () => { toast.success(isNew ? 'Sede creada' : 'Sede actualizada'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <Modal title={isNew ? 'Nueva sede' : `Editar sede: ${sede.nombre}`} onClose={onClose}>
      <Field label="Nombre *"><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
      <Field label="Ciudad *"><input className="input" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ej: Barranquilla" /></Field>
      <Field label="Dirección"><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></Field>
      <Field label="Responsable de la sede">
        <select className="input" value={form.responsable_id} onChange={(e) => setForm({ ...form, responsable_id: e.target.value || null })}>
          <option value="">— Sin responsable —</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
        </select>
        <div className="text-xs text-gray-500 mt-1">Coordinador que responde por esta sede (aparece en informes y notificaciones).</div>
      </Field>
      {!isNew && (
        <Field label="Estado">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
            Sede activa (visible en programador)
          </label>
        </Field>
      )}
      <ModalFooter onCancel={onClose} onSave={() => mutate()} saving={isPending} disabled={!form.nombre || !form.ciudad} />
    </Modal>
  )
}

function ConsultorioModal({ cons, onClose, onSaved }) {
  const [form, setForm] = useState({
    sede_id: cons.sede_id,
    nombre: cons.nombre ?? '',
    especialidad: cons.especialidad ?? 'oftalmologia',
    activo: cons.activo ?? true,
  })
  const isNew = !cons.id

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? consultorioService.create(form) : consultorioService.update(cons.id, form),
    onSuccess: () => { toast.success(isNew ? 'Consultorio creado' : 'Consultorio actualizado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <Modal title={isNew ? 'Nuevo consultorio' : `Editar: ${cons.nombre}`} onClose={onClose}>
      <Field label="Nombre *"><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Cons. 6" /></Field>
      <Field label="Especialidad *">
        <select className="input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })}>
          {ESPECIALIDADES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <div className="text-xs text-gray-500 mt-1">
          Requiere auxiliar: {['oftalmologia', 'anestesiologia'].includes(form.especialidad) ? 'Sí' : 'No'}
        </div>
      </Field>
      {!isNew && (
        <Field label="Estado">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Consultorio activo
          </label>
        </Field>
      )}
      <ModalFooter onCancel={onClose} onSave={() => mutate()} saving={isPending} disabled={!form.nombre} />
    </Modal>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) { return <div><label className="label">{label}</label>{children}</div> }

function ModalFooter({ onCancel, onSave, saving, disabled }) {
  return (
    <div className="px-5 py-4 border-t border-gray-100 flex gap-2 -mx-5 -mb-4 mt-4">
      <button className="btn flex-1 justify-center" onClick={onCancel}>Cancelar</button>
      <button className="btn-primary flex-1 justify-center" onClick={onSave} disabled={disabled || saving}>
        {saving ? <Spinner size="sm" /> : 'Guardar'}
      </button>
    </div>
  )
}
