import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { backofficeService, sedeService, festivoService } from '@/services/api'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

/**
 * HU-C-17 + RN-36: asignar auxiliar a una tarea de backoffice.
 * Soporta UN día puntual o un RANGO de fechas (cobertura larga).
 * En modo rango: salta domingos y festivos. Sábados se incluyen hasta 12:00.
 */
export default function AsignarBackofficeModal({ auxiliar, onClose }) {
  const qc = useQueryClient()
  const [esRango, setEsRango] = useState(false)
  const [sabadoMedioDia, setSabadoMedioDia] = useState(true)
  const [form, setForm] = useState({
    site_id: auxiliar?.site_id ?? '',
    backoffice_task_id: '',
    day: format(new Date(), 'yyyy-MM-dd'),
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '07:00',
    end_time: '13:00',
  })
  const { tryClose } = useDirtyClose({ ...form, esRango, sabadoMedioDia }, onClose)

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-backoffice-activas'],
    queryFn: () => backofficeService.tasks(),
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-list'],
    queryFn: () => sedeService.list(),
  })

  // Festivos del rango — para mostrar preview correcto.
  // Mientras el query esté cargando, el preview podría contar días que en
  // realidad son festivos como si fueran hábiles. Bloqueamos el botón hasta
  // que termine (ver `valid` más abajo).
  const { data: festivos = [], isLoading: festivosLoading } = useQuery({
    queryKey: ['festivos-rango', form.start_date, form.end_date],
    queryFn: () => festivoService.list({ desde: form.start_date, hasta: form.end_date }),
    enabled: esRango && !!form.start_date && !!form.end_date,
  })

  // Preview: calcular días hábiles que se van a crear (mismo algoritmo que backend).
  const preview = useMemo(() => {
    if (!esRango) return null
    if (!form.start_date || !form.end_date) return null
    if (form.start_date > form.end_date) return { error: 'La fecha inicial debe ser ≤ a la final' }
    const festivosSet = new Set(festivos.map((f) => (f.date ?? '').slice(0, 10)))
    const SAB_MAX = '12:00'
    const dias = []
    const omitidas = []
    const ini = new Date(form.start_date + 'T00:00:00Z')
    const fin = new Date(form.end_date + 'T00:00:00Z')
    const cursor = new Date(ini)
    while (cursor <= fin) {
      const dow = cursor.getUTCDay()
      const fecha = cursor.toISOString().slice(0, 10)
      const esDomingo = dow === 0
      const esSabado = dow === 6
      const esFestivo = festivosSet.has(fecha)
      if (esDomingo) omitidas.push({ date: fecha, reason: 'domingo' })
      else if (esFestivo) omitidas.push({ date: fecha, reason: 'festivo' })
      else if (esSabado && !sabadoMedioDia) omitidas.push({ date: fecha, reason: 'sábado deshabilitado' })
      else if (esSabado && form.start_time >= SAB_MAX) omitidas.push({ date: fecha, reason: 'sábado sin franja útil' })
      else if (esSabado) dias.push({ date: fecha, ajustado: form.end_time > SAB_MAX, endTime: form.end_time > SAB_MAX ? SAB_MAX : form.end_time })
      else dias.push({ date: fecha, ajustado: false, endTime: form.end_time })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return { dias, skipped: omitidas }
  }, [esRango, form.start_date, form.end_date, form.start_time, form.end_time, festivos, sabadoMedioDia])

  const sedesActivas = sedes.filter((s) => s.active)
  const auxSede = sedes.find((s) => s.id === auxiliar?.site_id)
  const sedesPosibles = auxSede
    ? sedesActivas.filter((s) => s.city === auxSede.city)
    : sedesActivas

  const { mutate, isPending } = useMutation({
    mutationFn: () => backofficeService.asignar({
      assistant_id: auxiliar.id,
      site_id: form.site_id,
      backoffice_task_id: form.backoffice_task_id,
      start_time: form.start_time,
      end_time: form.end_time,
      ...(esRango
        ? { start_date: form.start_date, end_date: form.end_date, sabado_medio_dia: sabadoMedioDia }
        : { day: form.day }),
    }),
    onSuccess: (res) => {
      // Backend devuelve:
      //  - shape histórico (un objeto) si fue 1 día sin omitidas
      //  - { creadas: [], omitidas: [], grupoId } si fue rango o hubo omitidas
      const data = res?.data ?? res
      if (Array.isArray(data?.created)) {
        const c = data.created.length
        const o = data.skipped?.length ?? 0
        if (c > 0 && o === 0) {
          toast.success(`${auxiliar.name}: ${c} ${c === 1 ? 'día asignado' : 'días asignados'}`)
        } else if (c > 0 && o > 0) {
          const primer = data.skipped[0]
          toast(`${c} ${c === 1 ? 'día creado' : 'días creados'}, ${o} ${o === 1 ? 'omitido' : 'omitidos'} (ej: ${primer.date} — ${primer.reason})`, { icon: '⚠️', duration: 8000 })
        } else {
          toast.error(`Todos los días fueron omitidos por conflicto. Revisa la programación de ${auxiliar.name}.`, { duration: 8000 })
        }
      } else {
        toast.success(`${auxiliar.name} asignada a backoffice`)
      }
      qc.invalidateQueries({ queryKey: ['recursos-sede'] })
      qc.invalidateQueries({ queryKey: ['recursos-sede-full'] })
      qc.invalidateQueries({ queryKey: ['backoffice-coord'] })
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al asignar'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.site_id && form.backoffice_task_id && form.start_time < form.end_time
    && (esRango
      ? (!festivosLoading && form.start_date && form.end_date && form.start_date <= form.end_date && preview?.dias?.length > 0)
      : !!form.day)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Asignar a backoffice</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {auxiliar?.name}
            </p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Sede {auxSede?.city ? `(cualquiera de ${auxSede.city})` : ''} *</label>
            <select className="input" value={form.site_id} onChange={(e) => set('site_id', e.target.value)}>
              <option value="">Seleccionar sede...</option>
              {sedesPosibles.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Tarea *</label>
            <select className="input" value={form.backoffice_task_id} onChange={(e) => set('backoffice_task_id', e.target.value)}>
              <option value="">Seleccionar tarea...</option>
              {tareas.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.estimated_minutes}min/u</option>)}
            </select>
          </div>

          <div className="border border-gray-100 rounded-lg p-3 space-y-3 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={esRango}
                onChange={(e) => setEsRango(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium text-gray-800">Cubrir varios días (rango de fechas)</span>
            </label>

            {!esRango ? (
              <div>
                <label className="label">Fecha *</label>
                <input className="input" type="date" value={form.day} onChange={(e) => set('day', e.target.value)} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Desde *</label>
                    <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Hasta *</label>
                    <input className="input" type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date', e.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sabadoMedioDia}
                    onChange={(e) => setSabadoMedioDia(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-gray-700">Incluir sábados hasta las 12:00</span>
                </label>
                {preview?.error && (
                  <div className="text-xs text-red-600">{preview.error}</div>
                )}
                {festivosLoading && (
                  <div className="text-xs text-gray-400 italic">Cargando festivos del rango…</div>
                )}
                {!festivosLoading && preview?.dias && (
                  <div className="bg-blue-50 border border-blue-100 rounded p-2 text-xs text-blue-800">
                    Se crearán <strong>{preview.dias.length}</strong> {preview.dias.length === 1 ? 'asignación' : 'asignaciones'}
                    {preview.dias.some((d) => d.ajustado) && (
                      <span> · {preview.dias.filter((d) => d.ajustado).length} sábado(s) ajustado(s) a 12:00</span>
                    )}
                    {preview.skipped.length > 0 && (
                      <div className="mt-1 text-blue-700">
                        Omitidos: {preview.skipped.length} ({[...new Set(preview.skipped.map((o) => o.reason))].join(', ')})
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Hora inicio *</label>
              <input className="input" type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="label">Hora fin *</label>
              <input className="input" type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
            ℹ️ La auxiliar registrará al final de su turno qué tareas completó. Esto alimentará su informe de productividad de backoffice.
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : (esRango ? `Asignar ${preview?.dias?.length ?? 0} días` : 'Asignar')}
          </button>
        </div>
      </div>
    </div>
  )
}
