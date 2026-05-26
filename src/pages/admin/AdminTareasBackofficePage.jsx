import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { backofficeService } from '@/services/api'
import { Badge, Spinner, EmptyState } from '@/components/ui'

/**
 * HU-S-06: Supervisor mantiene el catálogo de tareas de backoffice.
 * Solo se desactivan, no se eliminan (mantiene historial).
 */
export default function AdminTareasBackofficePage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['admin-tareas-backoffice'],
    queryFn: () => backofficeService.tareasAll(),
  })

  const activas = tareas.filter((t) => t.activa).length

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Tareas de backoffice</h1>
          <p className="text-xs text-gray-500">{tareas.length} tareas · {activas} activas</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}>+ Nueva tarea</button>
      </div>

      {activas === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 mb-4">
          ⚠️ No hay tareas activas. Los coordinadores no podrán asignar auxiliares liberadas a backoffice.
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : tareas.length === 0 ? (
          <EmptyState icon="📋" title="Sin tareas configuradas" />
        ) : (
          <table className="w-full text-sm">
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
              {tareas.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs font-medium text-gray-900">{t.nombre}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{t.descripcion || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right">{t.tiempo_estimado_minutos} min</td>
                  <td className="px-3 py-2 text-center"><Badge variant={t.activa ? 'green' : 'gray'}>{t.activa ? 'activa' : 'inactiva'}</Badge></td>
                  <td className="px-3 py-2 text-right"><button className="btn text-xs" onClick={() => setEditing(t)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && <TareaModal tarea={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries(['admin-tareas-backoffice']); setEditing(null) }} />}
    </div>
  )
}

function TareaModal({ tarea, onClose, onSaved }) {
  const isNew = !tarea.id
  const [form, setForm] = useState({
    nombre: tarea.nombre ?? '',
    descripcion: tarea.descripcion ?? '',
    tiempo_estimado_minutos: tarea.tiempo_estimado_minutos ?? 10,
    activa: tarea.activa ?? true,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? backofficeService.tareaCreate(form) : backofficeService.tareaUpdate(tarea.id, form),
    onSuccess: () => { toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nueva tarea' : `Editar: ${tarea.nombre}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Confirmación de citas" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <div>
            <label className="label">Tiempo estimado por unidad (minutos) *</label>
            <input className="input" type="number" min="1" value={form.tiempo_estimado_minutos} onChange={(e) => setForm({ ...form, tiempo_estimado_minutos: parseInt(e.target.value) || 0 })} />
            <div className="text-xs text-gray-500 mt-1">Permite comparar tiempo real vs estimado en informes de productividad</div>
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
              Tarea activa (disponible para asignar)
            </label>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!form.nombre || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
