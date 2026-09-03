import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { reposicionService, consultorioService } from '@/services/api'
import { parseFechaLocal } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

// Fase 3 · el profesional propone reponer una ausencia confirmada.
// Coord/gerencia recibe notificación y aprueba o rechaza.
const TIPOS_REPOSICION = [
  { value: 'misma_agenda',  label: 'Misma agenda (mi consultorio habitual)' },
  { value: 'otra_sede',     label: 'Otra sede / consultorio' },
  { value: 'doble_jornada', label: 'Doble jornada (extender día habitual)' },
  { value: 'otro',          label: 'Otro' },
]

export default function RegistrarReposicionModal({ ausencia, onClose }) {
  const qc = useQueryClient()

  // Fase 5 · v04: precargamos motivo_solicitud con las observaciones_reposicion
  // capturadas al reportar la ausencia (si vinieron). Antes se perdían y el
  // usuario tenía que re-escribir todo el detalle.
  const observacionesPrefill = ausencia?.makeup_notes ?? ausencia?.makeupNotes ?? ''
  const [form, setForm] = useState({
    makeup_date: '',
    start_time: '',
    end_time: '',
    makeup_type: 'misma_agenda',
    request_reason: observacionesPrefill,
    room_id: '',
    estimated_patients: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)

  // Solo cargamos consultorios cuando el tipo es "otra_sede" — el UI solo lo
  // pide para ese caso (no llena el dropdown si el prof va a reponer en su
  // agenda habitual).
  const { data: consultorios = [] } = useQuery({
    queryKey: ['consultorios-reposicion'],
    queryFn: () => consultorioService.list({ active: true }),
    enabled: form.makeup_type === 'otra_sede',
    staleTime: 5 * 60 * 1000,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => reposicionService.create({
      absence_id: ausencia.id,
      makeup_date: form.makeup_date,
      start_time: form.start_time,
      end_time: form.end_time,
      makeup_type: form.makeup_type,
      request_reason: form.request_reason,
      room_id: form.room_id || undefined,
      estimated_patients: form.estimated_patients === '' ? undefined : Number(form.estimated_patients),
    }),
    onSuccess: () => {
      toast.success('Reposición propuesta. El coordinador la revisará.')
      qc.invalidateQueries({ queryKey: ['reposiciones-recurso'] })
      qc.invalidateQueries({ queryKey: ['reposiciones-coord'] })
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al enviar la propuesta'),
  })

  // Validaciones locales
  const horaOk = form.start_time && form.end_time && form.end_time > form.start_time
  const fechaOk = !!form.makeup_date
  const motivoOk = form.request_reason.trim().length >= 5
  const valid = fechaOk && horaOk && motivoOk

  // Info de la ausencia original (contexto)
  const ini = parseFechaLocal(ausencia.start_date)
  const fin = parseFechaLocal(ausencia.end_date ?? ausencia.start_date)
  const periodoTxt = ini && fin && ini.getTime() === fin.getTime()
    ? format(ini, "d 'de' LLL yyyy", { locale: es })
    : `${format(ini, "d 'de' LLL", { locale: es })} – ${format(fin, "d 'de' LLL yyyy", { locale: es })}`

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && tryClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">🔁 Proponer reposición</h2>
            <p className="text-xs text-gray-500 mt-0.5">Ausencia del {periodoTxt}</p>
          </div>
          <button
            type="button"
            onClick={tryClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >×</button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-900">
            💡 Propone una fecha y horario para reponer esta ausencia. El coordinador revisará y aprobará o rechazará tu propuesta.
          </div>

          <div>
            <label className="label">Fecha de la reposición *</label>
            <input
              type="date"
              className="input"
              value={form.makeup_date}
              onChange={(e) => set('makeup_date', e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hora inicio *</label>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Hora fin *</label>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </div>
          </div>
          {form.start_time && form.end_time && !horaOk && (
            <div className="text-xs text-red-600">La hora fin debe ser posterior a la hora inicio.</div>
          )}

          <div>
            <label className="label">Tipo de reposición *</label>
            <select
              className="input"
              value={form.makeup_type}
              onChange={(e) => {
                const v = e.target.value
                // Al cambiar el tipo, limpiar consultorio_id salvo que siga
                // aplicando (solo "otra_sede" lo usa). Evita datos huérfanos
                // enviados al backend (verify Fase 3).
                setForm((f) => ({
                  ...f,
                  makeup_type: v,
                  room_id: v === 'otra_sede' ? f.room_id : '',
                }))
              }}
            >
              {TIPOS_REPOSICION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {form.makeup_type === 'otra_sede' && (
            <div>
              <label className="label">Consultorio propuesto (opcional)</label>
              <select
                className="input"
                value={form.room_id}
                onChange={(e) => set('room_id', e.target.value)}
              >
                <option value="">Sin especificar</option>
                {consultorios.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Pacientes estimados</label>
            <input
              type="number"
              className="input"
              min={0}
              max={999}
              value={form.estimated_patients}
              onChange={(e) => set('estimated_patients', e.target.value)}
              placeholder="opcional"
            />
          </div>

          <div>
            <label className="label">Motivo / justificación *</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.request_reason}
              onChange={(e) => set('request_reason', e.target.value)}
              placeholder="Ej: Puedo reponer el sábado 15 en el mismo consultorio."
              maxLength={2000}
            />
            <div className="text-xs text-gray-400 mt-1">Mínimo 5 caracteres.</div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 flex-shrink-0">
          <button type="button" className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            type="button"
            className="btn-primary flex-1 justify-center"
            disabled={!valid || isPending}
            onClick={() => mutate()}
          >
            {isPending ? <Spinner size="sm" /> : 'Enviar propuesta'}
          </button>
        </div>
      </div>
    </div>
  )
}
