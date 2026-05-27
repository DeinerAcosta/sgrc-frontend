import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { backofficeService } from '@/services/api'
import { Spinner } from '@/components/ui'

/**
 * El coordinador solicita al supervisor crear una tarea de backoffice que no
 * existe en el catálogo. No crea la tarea (eso lo hace el supervisor, HU-S-06):
 * envía una notificación in-app al supervisor para que la dé de alta.
 */
export default function SolicitarTareaBackofficeModal({ onClose }) {
  const [form, setForm] = useState({
    nombre: '',
    tiempo_estimado_minutos: '',
    justificacion: '',
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.solicitarTarea({
      nombre: form.nombre.trim(),
      tiempo_estimado_minutos: form.tiempo_estimado_minutos ? parseInt(form.tiempo_estimado_minutos) : undefined,
      justificacion: form.justificacion.trim() || undefined,
    }),
    onSuccess: (res) => {
      const n = res?.notificados ?? res?.data?.notificados
      toast.success(n ? `Solicitud enviada al supervisor (${n})` : 'Solicitud enviada al supervisor')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al enviar la solicitud'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.nombre.trim().length >= 3

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Solicitar nueva tarea de backoffice</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Se notificará al supervisor para que la dé de alta en el catálogo
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Nombre de la tarea *</label>
            <input
              className="input"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
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
              value={form.tiempo_estimado_minutos}
              onChange={(e) => set('tiempo_estimado_minutos', e.target.value)}
              placeholder="Opcional — ej. 15"
            />
          </div>

          <div>
            <label className="label">Justificación / detalle</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.justificacion}
              onChange={(e) => set('justificacion', e.target.value)}
              placeholder="Opcional — por qué se necesita y en qué consiste"
              maxLength={1000}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
            ℹ️ El supervisor recibirá una notificación en el aplicativo. Una vez la dé de alta, la tarea aparecerá disponible para asignar.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
