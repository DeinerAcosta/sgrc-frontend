import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { differenceInDays, parseISO } from 'date-fns'
import { recursoService, ausenciaService } from '@/services/api'
import { TIPOS_AUSENCIA } from '@/utils/helpers'
import { Spinner } from '@/components/ui'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada']

/**
 * HU-C-06: Coordinador registra una ausencia en nombre del recurso.
 * Queda con flag `registrado_por_coordinador = true`.
 * Solo se permite hasta 7 días hacia atrás.
 */
export default function RegistrarAusenciaCoordModal({ sedeId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    recurso_id: '',
    tipo: '',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
  })

  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-sede-list', sedeId],
    queryFn: () => recursoService.list({ sede_id: sedeId }),
  })

  const anticip = form.fecha_inicio ? differenceInDays(parseISO(form.fecha_inicio), new Date()) : null
  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.tipo) && anticip !== null && anticip < 30
  const diasAtras = form.fecha_inicio ? differenceInDays(new Date(), parseISO(form.fecha_inicio)) : 0
  const fechaInvalida = diasAtras > 7

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.create({
      ...form,
      fecha_fin: form.fecha_fin || form.fecha_inicio,
      registrado_por_coordinador: true,
    }),
    onSuccess: () => {
      toast.success('Ausencia registrada. El sistema calculó el impacto.')
      qc.invalidateQueries(['ausencias-coord'])
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al registrar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.recurso_id && form.tipo && form.fecha_inicio && !fechaInvalida

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Registrar ausencia en nombre del recurso</h2>
            <p className="text-xs text-gray-500 mt-0.5">El sistema calculará el impacto automáticamente</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Recurso *</label>
            <select className="input" value={form.recurso_id} onChange={(e) => set('recurso_id', e.target.value)}>
              <option value="">Seleccionar recurso...</option>
              {recursos.map((r) => <option key={r.id} value={r.id}>{r.nombre} — {r.tipo}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Tipo de ausencia *</label>
            <select className="input" value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Seleccionar tipo...</option>
              {TIPOS_AUSENCIA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio *</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha fin</label>
              <input className="input" type="date" value={form.fecha_fin} min={form.fecha_inicio} onChange={(e) => set('fecha_fin', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Observaciones</label>
            <textarea className="input resize-none" rows={2} value={form.motivo} onChange={(e) => set('motivo', e.target.value)} placeholder="Ej: No se presentó al consultorio y no avisó" />
          </div>

          {alertaAnticip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Este tipo requiere 30 días de anticipación. Estás registrando con {anticip} días.
            </div>
          )}

          {fechaInvalida && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
              ⛔ Solo puedes registrar ausencias para el día actual o hasta 7 días atrás.
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
            ℹ️ Quedará registrado en el log de auditoría que TÚ registraste esta ausencia en nombre del recurso.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Registrar ausencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
