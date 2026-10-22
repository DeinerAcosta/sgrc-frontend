import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { bloqueoSedeService } from '@/services/api'
import { Badge, Spinner } from '@/components/ui'
import { useConfirm } from '@/contexts/ConfirmContext'

/**
 * BLOQUEOS DE SEDE (PROYECTOS-3583 §5)
 * Supervisor y gerencia bloquean una sede por unas fechas cuando no hay
 * disponibilidad. Mientras dure no se programa en ella y no cuenta en los
 * informes de ocupación. Se levanta, no se borra.
 */
export default function BloqueosSedePanel({ sedes }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ site_id: '', start_date: '', end_date: '', reason: '' })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const { data: bloqueos = [], isLoading } = useQuery({
    queryKey: ['bloqueos-sede'],
    queryFn: () => bloqueoSedeService.list(),
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['bloqueos-sede'] })
    qc.invalidateQueries({ queryKey: ['asignaciones'] })
  }

  const { mutate: bloquear, isPending: bloqueando } = useMutation({
    mutationFn: () => bloqueoSedeService.crear(form),
    onSuccess: () => {
      toast.success('Sede bloqueada.')
      setForm({ site_id: '', start_date: '', end_date: '', reason: '' })
      setAbierto(false)
      refrescar()
    },
    onError: (e) => toast.error(e?.message ?? 'No se pudo bloquear la sede'),
  })
  const { mutate: levantar } = useMutation({
    mutationFn: (id) => bloqueoSedeService.levantar(id),
    onSuccess: () => { toast.success('Bloqueo levantado.'); refrescar() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo levantar el bloqueo'),
  })

  const valido = form.site_id && form.start_date && form.end_date && form.end_date >= form.start_date && form.reason.trim().length >= 5

  return (
    <div className="card p-3 mb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Bloqueos de sede</h2>
        {!abierto && <button className="btn text-xs" onClick={() => setAbierto(true)}>🚫 Bloquear una sede</button>}
      </div>

      {abierto && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-600">Sede <span className="text-red-600">*</span></span>
            <select className="input text-xs" value={form.site_id} onChange={(e) => set('site_id', e.target.value)}>
              <option value="">Seleccionar…</option>
              {sedes.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-600">Desde <span className="text-red-600">*</span></span>
            <input type="date" className="input text-xs" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-600">Hasta <span className="text-red-600">*</span></span>
            <input type="date" className="input text-xs" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-4">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-600">Motivo <span className="text-red-600">*</span></span>
            <input className="input text-xs" maxLength={500} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Ej: sin personal disponible" />
          </label>
          <div className="sm:col-span-4 flex justify-end gap-2">
            <button className="btn text-xs" onClick={() => setAbierto(false)} disabled={bloqueando}>Cancelar</button>
            <button className="btn-danger text-xs" onClick={() => bloquear()} disabled={!valido || bloqueando}>
              {bloqueando ? <Spinner size="sm" /> : 'Bloquear'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-3"><Spinner size="sm" /></div>
      ) : bloqueos.length === 0 ? (
        <p className="text-xs text-gray-400 mt-2">Ninguna sede bloqueada.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {bloqueos.map((b) => (
            <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="text-gray-900">
                  <Badge variant="red">Bloqueada</Badge> <strong>{b.site_name}</strong> · del {b.start_date} al {b.end_date}
                </div>
                <div className="text-gray-500 truncate">{b.reason}{b.created_by_name ? ` · ${b.created_by_name}` : ''}</div>
              </div>
              <button
                className="btn text-xs flex-shrink-0"
                onClick={async () => {
                  const ok = await confirm({
                    title: `¿Levantar el bloqueo de ${b.site_name}?`,
                    message: `Se vuelve a poder programar en la sede del ${b.start_date} al ${b.end_date}.`,
                    confirmLabel: 'Levantar',
                  })
                  if (ok) levantar(b.id)
                }}
              >
                Levantar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
