import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { backofficeService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

/**
 * HU-S-06: Supervisor mantiene el catálogo de tareas de backoffice.
 * Incluye flujo de aprobación cuando un coordinador solicita una tarea nueva.
 * Solo se desactivan, no se eliminan (mantiene historial).
 */
export default function AdminTareasBackofficePage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [aprobando, setAprobando] = useState(null) // tarea a aprobar
  const [rechazando, setRechazando] = useState(null) // tarea a rechazar

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['admin-tareas-backoffice'],
    queryFn: () => backofficeService.tareasAll(),
  })

  const pendientes = tareas.filter((t) => t.status === 'pendiente')
  const aprobadas  = tareas.filter((t) => t.status === 'aprobada' || !t.status)
  const rechazadas = tareas.filter((t) => t.status === 'rechazada')
  const activas    = aprobadas.filter((t) => t.active).length

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Tareas de backoffice</h1>
          <p className="text-xs text-gray-500">
            {pendientes.length > 0 && <span className="text-amber-700 font-medium">{pendientes.length} pendiente{pendientes.length !== 1 && 's'} · </span>}
            {aprobadas.length} aprobadas · {activas} activas{rechazadas.length > 0 && ` · ${rechazadas.length} rechazadas`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" onClick={() => setEditing({})}>+ Nueva tarea</button>
        </div>
      </div>

      {/* Solicitudes pendientes — sección destacada en amarillo */}
      {pendientes.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50/40">
          <SectionHeader title={`📨 Solicitudes pendientes de aprobación (${pendientes.length})`} />
          <div className="space-y-2 mt-2">
            {pendientes.map((t) => (
              <div key={t.id} className="bg-white border border-amber-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Tiempo estimado sugerido: <strong>{t.estimated_minutes} min/unidad</strong>
                    </div>
                    {t.justification && (
                      <div className="text-xs text-gray-700 mt-2 italic bg-gray-50 px-2 py-1.5 rounded">
                        💬 {t.justification}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-2">
                      Solicitado el {format(parseISO(t.created_at), "d MMM 'a las' HH:mm", { locale: es })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button className="btn-success text-xs whitespace-nowrap" onClick={() => setAprobando(t)}>
                      ✓ Aprobar
                    </button>
                    <button className="btn-danger text-xs whitespace-nowrap" onClick={() => setRechazando(t)}>
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activas === 0 && pendientes.length === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 mb-4">
          ⚠️ No hay tareas activas. Los coordinadores no podrán asignar auxiliares liberadas a backoffice.
        </div>
      )}

      <div className="card">
        <SectionHeader title="Catálogo del sistema" />
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : aprobadas.length === 0 ? (
          <EmptyState icon="📋" title="Sin tareas configuradas" />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-right">Tiempo estimado</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {aprobadas.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs font-medium text-gray-900">{t.name}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{t.description || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right">{t.estimated_minutes} min</td>
                  <td className="px-3 py-2 text-center"><Badge variant={t.active ? 'green' : 'gray'}>{t.active ? 'activa' : 'inactiva'}</Badge></td>
                  <td className="px-3 py-2 text-right"><button className="btn text-xs" onClick={() => setEditing(t)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Rechazadas (colapsable / pequeña sección) */}
      {rechazadas.length > 0 && (
        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">
            Ver {rechazadas.length} solicitud{rechazadas.length !== 1 && 'es'} rechazada{rechazadas.length !== 1 && 's'}
          </summary>
          <div className="mt-2 space-y-1.5">
            {rechazadas.map((t) => (
              <div key={t.id} className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="font-medium text-gray-700">{t.name}</div>
                {t.rejection_reason && <div className="italic">Motivo: {t.rejection_reason}</div>}
                <div className="text-gray-400">{format(parseISO(t.processed_at ?? t.created_at), "d MMM yyyy", { locale: es })}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {editing !== null && <TareaModal tarea={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-tareas-backoffice'] }); setEditing(null) }} />}
      {aprobando && <AprobarModal tarea={aprobando} onClose={() => setAprobando(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-tareas-backoffice'] }); setAprobando(null) }} />}
      {rechazando && <RechazarModal tarea={rechazando} onClose={() => setRechazando(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-tareas-backoffice'] }); setRechazando(null) }} />}
    </div>
  )
}

function TareaModal({ task: tarea, onClose, onSaved }) {
  const isNew = !tarea.id
  const [form, setForm] = useState({
    name: tarea.name ?? '',
    description: tarea.description ?? '',
    estimated_minutes: tarea.estimated_minutes ?? 10,
    active: tarea.active ?? true,
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? backofficeService.tareaCreate(form) : backofficeService.tareaUpdate(tarea.id, form),
    onSuccess: () => { toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nueva tarea' : `Editar: ${tarea.name}`}</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Confirmación de citas" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Tiempo estimado por unidad (minutos) *</label>
            <input className="input" type="number" min="1" value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: parseInt(e.target.value) || 0 })} />
            <div className="text-xs text-gray-500 mt-1">Permite comparar tiempo real vs estimado en informes de productividad</div>
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Tarea activa (disponible para asignar)
            </label>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!form.name || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AprobarModal({ task: tarea, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: tarea.name,
    description: tarea.description ?? '',
    estimated_minutes: tarea.estimated_minutes,
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.aprobarSolicitudTarea(tarea.id, form),
    onSuccess: () => { toast.success('Solicitud aprobada — el coordinador fue notificado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error al aprobar'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Aprobar solicitud</h2>
            <p className="text-xs text-gray-500 mt-0.5">Puedes ajustar los datos antes de aprobar</p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {tarea.justification && (
            <div className="text-xs text-gray-700 italic bg-gray-50 px-3 py-2 rounded-lg">
              💬 Justificación del coordinador: {tarea.justification}
            </div>
          )}
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descripción (la verán los recursos al asignarse)</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe brevemente qué incluye la tarea..." />
          </div>
          <div>
            <label className="label">Tiempo estimado por unidad (min) *</label>
            <input className="input" type="number" min="1" max="480" value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-xs text-green-800">
            ✓ Al aprobar, la tarea queda <strong>activa y disponible</strong> para asignar. Se le notifica al coordinador solicitante.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-success flex-1 justify-center" onClick={() => mutate()} disabled={!form.name || isPending}>
            {isPending ? <Spinner size="sm" /> : '✓ Aprobar y activar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RechazarModal({ task: tarea, onClose, onSaved }) {
  const [motivo, setMotivo] = useState('')
  const { tryClose } = useDirtyClose({ reason: motivo }, onClose)

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.rechazarSolicitudTarea(tarea.id, motivo),
    onSuccess: () => { toast('Solicitud rechazada — el coordinador fue notificado', { icon: 'ℹ️' }); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error al rechazar'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Rechazar solicitud</h2>
          <p className="text-xs text-gray-500 mt-0.5">Tarea: "{tarea.name}"</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">Motivo del rechazo (mínimo 5 caracteres) *</label>
            <textarea className="input resize-none" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Ya existe una tarea similar, no aplica al modelo operativo, etc." />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800">
            ⚠️ El coordinador recibirá el motivo por notificación + email.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-danger flex-1 justify-center" onClick={() => mutate()} disabled={motivo.trim().length < 5 || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Rechazar y notificar'}
          </button>
        </div>
      </div>
    </div>
  )
}
