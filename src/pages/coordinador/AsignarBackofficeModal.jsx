import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { backofficeService, sedeService } from '@/services/api'
import { Spinner } from '@/components/ui'

/**
 * HU-C-17 + RN-36: asignar auxiliar liberada por ausencia a una tarea de backoffice.
 * Solo aparece cuando una auxiliar tiene estado_badge='liberada'.
 */
export default function AsignarBackofficeModal({ auxiliar, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    sede_id: auxiliar?.sede_id ?? '',
    tarea_backoffice_id: '',
    dia: format(new Date(), 'yyyy-MM-dd'),
    hora_inicio: '07:00',
    hora_fin: '13:00',
  })

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-backoffice-activas'],
    queryFn: () => backofficeService.tareas(),
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-list'],
    queryFn: () => sedeService.list(),
  })

  // Preferimos las sedes de la misma ciudad que la auxiliar. Pero el backend no
  // expone sede_id en el recurso (un recurso no tiene sede fija), así que si no se
  // puede determinar su ciudad, mostramos TODAS las sedes activas como fallback —
  // nunca dejamos el selector vacío.
  const sedesActivas = sedes.filter((s) => s.activa)
  const auxSede = sedes.find((s) => s.id === auxiliar?.sede_id)
  const sedesPosibles = auxSede
    ? sedesActivas.filter((s) => s.ciudad === auxSede.ciudad)
    : sedesActivas

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.asignar({
      auxiliar_id: auxiliar.id,
      ...form,
    }),
    onSuccess: () => {
      toast.success(`${auxiliar.nombre} asignada a backoffice`)
      qc.invalidateQueries(['recursos-sede'])
      qc.invalidateQueries(['recursos-sede-full'])
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al asignar'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.sede_id && form.tarea_backoffice_id && form.dia && form.hora_inicio < form.hora_fin

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Asignar a backoffice</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {auxiliar?.nombre} · liberada por ausencia de médico
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Sede {auxSede?.ciudad ? `(cualquiera de ${auxSede.ciudad})` : ''} *</label>
            <select className="input" value={form.sede_id} onChange={(e) => set('sede_id', e.target.value)}>
              <option value="">Seleccionar sede...</option>
              {sedesPosibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.ciudad ? ` · ${s.ciudad}` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Tarea *</label>
            <select className="input" value={form.tarea_backoffice_id} onChange={(e) => set('tarea_backoffice_id', e.target.value)}>
              <option value="">Seleccionar tarea...</option>
              {tareas.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.tiempo_estimado_minutos}min/u</option>)}
            </select>
          </div>

          <div>
            <label className="label">Fecha *</label>
            <input className="input" type="date" value={form.dia} onChange={(e) => set('dia', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hora inicio *</label>
              <input className="input" type="time" value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} />
            </div>
            <div>
              <label className="label">Hora fin *</label>
              <input className="input" type="time" value={form.hora_fin} onChange={(e) => set('hora_fin', e.target.value)} />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
            ℹ️ La auxiliar registrará al final de su turno qué tareas completó. Esto alimentará su informe de productividad de backoffice.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}
