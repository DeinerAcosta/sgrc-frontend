import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { backofficeService } from '@/services/api'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

/**
 * El coordinador solicita al supervisor crear una tarea de backoffice que no
 * existe en el catálogo. No crea la tarea (eso lo hace el supervisor, HU-S-06):
 * envía una notificación in-app al supervisor para que la dé de alta.
 */
export default function SolicitarTareaBackofficeModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    estimated_minutes: '',
    justification: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.solicitarTarea({
      name: form.name.trim(),
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : undefined,
      justification: form.justification.trim() || undefined,
    }),
    onSuccess: (res) => {
      const n = res?.notificados ?? res?.data?.notificados
      toast.success(n ? `Solicitud enviada al supervisor (${n})` : 'Solicitud enviada al supervisor')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al enviar la solicitud'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.name.trim().length >= 3

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Solicitar nueva tarea de backoffice</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Se notificará al supervisor para que la dé de alta en el catálogo
            </p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Nombre de la tarea *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej. Conciliación de historias clínicas"
              maxLength={150}
            />
          </div>

          <div>
            <label className="label">Tiempo estimado por unidad (min)</label>
            <input
              className="input"
              type="number"
              min="1"
              max="480"
              value={form.estimated_minutes}
              onChange={(e) => set('estimated_minutes', e.target.value)}
              placeholder="Opcional — ej. 15"
            />
          </div>

          <div>
            <label className="label">Justificación / detalle</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.justification}
              onChange={(e) => set('justification', e.target.value)}
              placeholder="Opcional — por qué se necesita y en qué consiste"
              maxLength={1000}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
            ℹ️ El supervisor recibirá una notificación en el aplicativo. Una vez la dé de alta, la tarea aparecerá disponible para asignar.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
