import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService } from '@/services/api'
import { TIPOS_AUSENCIA } from '@/utils/helpers'
import { Spinner, Badge } from '@/components/ui'
import { differenceInDays, parseISO } from 'date-fns'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada']
const SOLO_SALARIO_FIJO = ['licencia_remunerada', 'licencia_no_remunerada']

export default function AusenciaFormModal({ recursoId, esquemaPago, onClose, horarioSemana = [] }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ tipo: '', fecha_inicio: '', fecha_fin: '', es_parcial: false, hora_inicio_ausencia: '', hora_fin_ausencia: '', motivo: '' })

  const anticip = form.fecha_inicio
    ? differenceInDays(parseISO(form.fecha_inicio), new Date())
    : null

  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.tipo) && anticip !== null && anticip < 30

  const pacientesImpactados = horarioSemana
    .filter((a) => a.dia_semana && form.fecha_inicio)
    .reduce((acc, a) => acc + (a.pacientes_capacidad ?? 0), 0)

  const tipos = TIPOS_AUSENCIA.filter((t) => {
    if (SOLO_SALARIO_FIJO.includes(t.value) && esquemaPago !== 'fijo') return false
    return true
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.create({ recurso_id: recursoId, ...form }),
    onSuccess: () => {
      qc.invalidateQueries(['ausencias'])
      toast.success('Ausencia reportada. El coordinador será notificado.')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al reportar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.tipo && form.fecha_inicio

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Reportar ausencia</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Tipo de ausencia *</label>
            <select className="input" value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Seleccionar tipo...</option>
              {tipos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.es_parcial} onChange={(e) => set('es_parcial', e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-700">Ausencia parcial dentro del día</span>
            </label>
          </div>

          {form.es_parcial && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Hora inicio ausencia</label>
                <input className="input" type="time" value={form.hora_inicio_ausencia} onChange={(e) => set('hora_inicio_ausencia', e.target.value)} />
              </div>
              <div>
                <label className="label">Hora fin ausencia</label>
                <input className="input" type="time" value={form.hora_fin_ausencia} onChange={(e) => set('hora_fin_ausencia', e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className="label">Motivo (opcional)</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.motivo}
              onChange={(e) => set('motivo', e.target.value)}
              placeholder="Describe brevemente el motivo..."
            />
          </div>

          {alertaAnticip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Este tipo de ausencia requiere mínimo 30 días de anticipación. Estás reportando con {anticip} días. El coordinador será notificado de este incumplimiento.
            </div>
          )}

          {pacientesImpactados > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-800">
              🔴 Esta ausencia impacta aproximadamente <strong>{pacientesImpactados} pacientes</strong> programados. El coordinador recibirá notificación inmediata.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-danger flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!valid || isPending}
          >
            {isPending ? <Spinner size="sm" /> : '⚠️ Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  )
}
