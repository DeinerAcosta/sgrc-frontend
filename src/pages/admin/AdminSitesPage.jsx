import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { sedeService, consultorioService, usuarioService } from '@/services/api'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { ESPECIALIDADES as ESPECIALIDADES_GLOBAL } from '@/utils/helpers'

// Catálogo único — incluye "asesoria" (área de asesores) para que el modal
// pueda crear/editar correctamente AREA ASESORES en cualquier sede. Antes
// faltaba esa opción y el select caía a "oftalmologia" como primera opción,
// sobreescribiendo el valor real al guardar.
const ESPECIALIDADES = ESPECIALIDADES_GLOBAL

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
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Sedes y consultorios</h1>
          <p className="text-xs text-gray-500">Gestiona la red física de la organización</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" onClick={() => setShowSede({})}>+ Nueva sede</button>
        </div>
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
              onAddCons={() => setShowCons({ site_id: s.id })}
              onEditCons={(c) => setShowCons(c)}
            />
          ))}
        </div>
      )}

      {showSede !== null && <SedeModal sede={showSede} onClose={() => setShowSede(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-sedes'] }); setShowSede(null) }} />}
      {showCons !== null && <ConsultorioModal cons={showCons} onClose={() => setShowCons(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-sedes'] }); qc.invalidateQueries({ queryKey: ['consultorios'] }); setShowCons(null) }} />}
    </div>
  )
}

function SedeCard({ sede, expanded, onExpand, onEdit, onAddCons, onEditCons }) {
  const { data: consultorios = [] } = useQuery({
    queryKey: ['consultorios', sede.id],
    queryFn: () => consultorioService.list({ site_id: sede.id }),
    enabled: expanded,
  })

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <button className="text-gray-400" onClick={onExpand}>{expanded ? '▼' : '▶'}</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{sede.name}</span>
            <Badge variant={sede.active ? 'green' : 'gray'}>{sede.active ? 'activa' : 'inactiva'}</Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{sede.city} · {sede.address}</div>
        </div>
        <button className="btn text-xs" onClick={onEdit}>Editar</button>
      </div>

      {expanded && (() => {
        // Ordena: activos arriba (Asesores primero + natural numérico), luego inactivos (igual).
        // Al cambiar estado desde el modal, invalidateQueries refresca y se re-ordena solo.
        const orden = (a, b) => {
          const ae = a.specialty === 'asesoria' ? 0 : 1
          const be = b.specialty === 'asesoria' ? 0 : 1
          if (ae !== be) return ae - be
          return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
        }
        const activos = consultorios.filter((c) => c.active).sort(orden)
        const inactivos = consultorios.filter((c) => !c.active).sort(orden)
        const ordenados = [...activos, ...inactivos]
        const idxPrimerInactivo = activos.length

        return (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-700">
                Consultorios ({consultorios.length})
                {consultorios.length > 0 && (
                  <span className="text-gray-400 font-normal ml-1">
                    · <span className="text-green-700">{activos.length} activos</span> · <span className="text-gray-500">{inactivos.length} inactivos</span>
                  </span>
                )}
              </span>
              <button className="btn text-xs" onClick={onAddCons}>+ Agregar consultorio</button>
            </div>
            <div className="space-y-1">
              {ordenados.map((c, idx) => (
                <div key={c.id}>
                  {idx === idxPrimerInactivo && inactivos.length > 0 && activos.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 mb-1 text-xs text-gray-400">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span>Inactivos ({inactivos.length})</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  <div className={`flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0 ${c.active ? '' : 'opacity-60'}`}>
                    <span className="text-xs text-gray-800 flex-1">{c.name}</span>
                    <Badge variant="blue">{c.specialty}</Badge>
                    {c.requires_assistant && <Badge variant="purple">requiere aux</Badge>}
                    <Badge variant={c.active ? 'green' : 'gray'}>{c.active ? 'activo' : 'inactivo'}</Badge>
                    <button className="btn text-xs" onClick={() => onEditCons(c)}>Editar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function SedeModal({ sede, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: sede.name ?? '',
    city: sede.city ?? '',
    address: sede.address ?? '',
    active: sede.active ?? true,
    manager_id: sede.manager_id ?? sede.manager?.id ?? '',
  })
  const { tryClose } = useDirtyClose(form, onClose)
  const isNew = !sede.id

  // Solo coordinadores y supervisores pueden ser responsables de sede
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-para-responsable'],
    queryFn: () => usuarioService.list({ role: 'coordinador' }),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? sedeService.create(form) : sedeService.update(sede.id, form),
    onSuccess: () => { toast.success(isNew ? 'Sede creada' : 'Sede actualizada'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <Modal title={isNew ? 'Nueva sede' : `Editar sede: ${sede.name}`} onClose={tryClose}>
      <Field label="Nombre *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Ciudad *"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ej: Barranquilla" /></Field>
      <Field label="Dirección"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="Responsable de la sede">
        <select className="input" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value || null })}>
          <option value="">— Sin responsable —</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
        </select>
        <div className="text-xs text-gray-500 mt-1">Coordinador que responde por esta sede (aparece en informes y notificaciones).</div>
      </Field>
      {!isNew && (
        <Field label="Estado">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Sede activa (visible en programador)
          </label>
        </Field>
      )}
      <ModalFooter onCancel={tryClose} onSave={() => mutate()} saving={isPending} disabled={!form.name || !form.city} />
    </Modal>
  )
}

function ConsultorioModal({ cons, onClose, onSaved }) {
  const [form, setForm] = useState({
    site_id: cons.site_id,
    name: cons.name ?? '',
    specialty: cons.specialty ?? 'oftalmologia',
    alt_specialty: cons.alt_specialty ?? '',
    active: cons.active ?? true,
  })
  const { tryClose } = useDirtyClose(form, onClose)
  const isNew = !cons.id

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? consultorioService.create(form) : consultorioService.update(cons.id, form),
    onSuccess: () => { toast.success(isNew ? 'Consultorio creado' : 'Consultorio actualizado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  // Opciones para la especialidad alternativa: todas menos la principal y "asesoria" (esa es área).
  const altOpciones = ESPECIALIDADES.filter((e) => e.value !== form.specialty && e.value !== 'asesoria')

  return (
    <Modal title={isNew ? 'Nuevo consultorio' : `Editar: ${cons.name}`} onClose={tryClose}>
      <Field label="Nombre *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Cons. 6" /></Field>
      <Field label="Especialidad principal *">
        <select className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value, alt_specialty: form.alt_specialty === e.target.value ? '' : form.alt_specialty })}>
          {ESPECIALIDADES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <div className="text-xs text-gray-500 mt-1">
          Requiere auxiliar: {['oftalmologia', 'anestesiologia'].includes(form.specialty) ? 'Sí' : 'No'}
        </div>
      </Field>
      <Field label="Servicio alternativo (opcional)">
        <select
          className="input"
          value={form.alt_specialty}
          onChange={(e) => setForm({ ...form, alt_specialty: e.target.value })}
        >
          <option value="">— Sin servicio alternativo —</option>
          {altOpciones.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <div className="text-xs text-gray-500 mt-1">
          Para consultorios compartidos. Ej: Cons. 5 Quirúrgica = Anestesiología + Diagnóstico (electrocardiograma hecho por auxiliar).
          {form.alt_specialty && <span className="block mt-1 text-blue-700">⚙️ Al programar, el coordinador escogerá qué servicio cubrir. El alternativo solo permite auxiliares.</span>}
        </div>
      </Field>
      {!isNew && (
        <Field label="Estado">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Consultorio activo
          </label>
        </Field>
      )}
      <ModalFooter onCancel={tryClose} onSave={() => mutate()} saving={isPending} disabled={!form.name} />
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
