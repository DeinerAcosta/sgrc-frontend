import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { differenceInDays } from 'date-fns'
import { recursoService, ausenciaService, motivoAusenciaService } from '@/services/api'
import { TIPOS_AUSENCIA, TIPOS_RECURSO, parseFechaLocal } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useAuthStore } from '@/store/authStore'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada']

/**
 * HU-C-06: Coordinador registra una ausencia en nombre del recurso.
 * Queda con flag `registrado_por_coordinador = true`.
 * Solo se permite hasta 7 días hacia atrás.
 */
export default function RegistrarAusenciaCoordModal({ sedeId, onClose, onCreated }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [categoria, setCategoria] = useState('')
  const [form, setForm] = useState({
    resource_id: '',
    reasonId: '',
    motivoCodigo: '',
    type: '',
    start_date: '',
    end_date: '',
    is_partial: false,
    absence_start_time: '',
    absence_end_time: '',
    reason: '',
    regional_city: '',
    // Fase 5 · F-AA-126 v04 — sin default; forzamos elección explícita.
    affected_company: '',
    wants_makeup: '',                    // '' = sin elegir, 'si' | 'no'
    makeup_notes: '',
  })

  // Catálogo dinámico de motivos. Fallback al hardcoded si la API falla.
  const { data: motivosCatalogo = [] } = useQuery({
    queryKey: ['motivos-ausencia', 'activos'],
    queryFn: () => motivoAusenciaService.list({ soloActivos: true }),
    staleTime: 5 * 60 * 1000,
  })
  const opcionesMotivo = motivosCatalogo.length > 0
    ? motivosCatalogo.map((m) => ({ id: m.id, value: m.code, label: m.name, family: m.family }))
    : TIPOS_AUSENCIA.map((t) => ({ id: null, value: t.value, label: t.label, family: null }))
  const esMotivoRegional = form.motivoCodigo === 'regional'
  const dirtySnapshot = { categoria, ...form }
  const { tryClose } = useDirtyClose(dirtySnapshot, onClose)

  // Coord-líder ve su equipo completo (en cualquier sede); supervisor/gerencia ven la sede activa.
  const esCoordAus = user?.role === 'coordinador'
  const { data: equipo = [] } = useQuery({
    queryKey: ['recursos-coord-ausencia', esCoordAus ? user?.id : sedeId],
    queryFn: () => recursoService.list(
      esCoordAus ? { lead_coordinator_id: user?.id, active: true } : { site_id: sedeId, active: true }
    ),
  })

  // Oftalmólogos y anestesiólogos son ROTATIVOS — no tienen coordinador_lider ni sede fija,
  // pero igual el coordinador debe poder registrarles ausencia (si no se presentan, la sede pierde
  // dinero por costo del consultorio agendado). Traer aparte y combinar con el equipo.
  const { data: rotativosOft = [] } = useQuery({
    queryKey: ['recursos-rotativos-oftalmologo'],
    queryFn: () => recursoService.list({ type: 'oftalmologo', active: true }),
  })
  const { data: rotativosAnest = [] } = useQuery({
    queryKey: ['recursos-rotativos-anestesiologo'],
    queryFn: () => recursoService.list({ type: 'anestesiologo', active: true }),
  })

  // Combina y deduplica por id (por si algún oftalmólogo tiene líder asignado y aparece en ambos).
  const recursos = (() => {
    const map = new Map()
    for (const r of [...equipo, ...rotativosOft, ...rotativosAnest]) map.set(r.id, r)
    return [...map.values()]
  })()

  // Solo muestra el personal de la categoría elegida (RN-X: filtrar por tipo de recurso)
  const recursosFiltrados = categoria ? recursos.filter((r) => r.type === categoria) : []

  const anticip = form.start_date ? differenceInDays(parseFechaLocal(form.start_date), new Date()) : null
  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.type) && anticip !== null && anticip < 30
  const diasAtras = form.start_date ? differenceInDays(new Date(), parseFechaLocal(form.start_date)) : 0
  const fechaInvalida = diasAtras > 7

  // Duración calculada de la ausencia parcial (ej: el recurso llegó 2h tarde)
  const minutosParcial = (() => {
    if (!form.is_partial || !form.absence_start_time || !form.absence_end_time) return null
    const [h1, m1] = form.absence_start_time.split(':').map(Number)
    const [h2, m2] = form.absence_end_time.split(':').map(Number)
    const min = (h2 * 60 + m2) - (h1 * 60 + m1)
    return min > 0 ? min : null
  })()
  const horasInvalidas = form.is_partial && form.absence_start_time && form.absence_end_time && minutosParcial === null
  const horasOk = !form.is_partial || (form.absence_start_time && form.absence_end_time && minutosParcial !== null)

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.create({
      ...form,
      reason_id: form.reasonId || undefined,
      regional_city: esMotivoRegional ? form.regional_city.trim() : undefined,
      // Fase 5 · F-AA-126 v04
      affected_company: form.affected_company || undefined,
      wants_makeup: form.wants_makeup === 'si' ? true : form.wants_makeup === 'no' ? false : undefined,
      makeup_notes: form.wants_makeup === 'si' ? (form.makeup_notes || undefined) : undefined,
      end_date: form.end_date || form.start_date,
      recorded_by_coordinator: true,
    }),
    onSuccess: (creada) => {
      toast.success('Ausencia registrada. El sistema calculó el impacto.')
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      // Fase 5 · v04: si vino desea_reponer=SÍ, notificamos al padre para que
      // encadene el modal de proponer reposición (Fase 3).
      if (creada?.wants_makeup === true && typeof onCreated === 'function') {
        onCreated(creada)
      }
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al registrar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ciudadOk = !esMotivoRegional || form.regional_city.trim().length >= 2
  const empresaOk = !!form.affected_company  // Fase 5 · v04: campo obligatorio del formato
  const valid = form.resource_id && form.type && form.start_date && !fechaInvalida && horasOk && ciudadOk && empresaOk

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Registrar ausencia en nombre del recurso</h2>
            <p className="text-xs text-gray-500 mt-0.5">El sistema calculará el impacto automáticamente</p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Categoría *</label>
            <select
              className="input"
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); set('resource_id', '') }}
            >
              <option value="">Seleccionar categoría...</option>
              {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Recurso *</label>
            <select
              className="input"
              value={form.resource_id}
              onChange={(e) => set('resource_id', e.target.value)}
              disabled={!categoria}
            >
              <option value="">
                {!categoria ? 'Primero elige la categoría...' : recursosFiltrados.length === 0 ? 'Sin personal de esta categoría en la sede' : 'Seleccionar recurso...'}
              </option>
              {recursosFiltrados.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.specialty ? ` · ${r.specialty}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Tipo de ausencia *</label>
            <select
              className="input"
              value={form.reasonId || form.type}
              onChange={(e) => {
                const sel = opcionesMotivo.find((t) => String(t.id) === e.target.value || t.value === e.target.value)
                const codigosEnum = TIPOS_AUSENCIA.map((t) => t.value)
                const tipoEnum = codigosEnum.includes(sel?.value) ? sel.value : 'otra'
                setForm((f) => ({
                  ...f,
                  reasonId: sel?.id ?? '',
                  motivoCodigo: sel?.value ?? '',
                  type: sel ? tipoEnum : '',
                  // Si cambia a un motivo distinto de "regional", limpiamos la ciudad.
                  regional_city: sel?.value === 'regional' ? f.regional_city : '',
                }))
              }}
            >
              <option value="">Seleccionar tipo...</option>
              {opcionesMotivo.map((t) => <option key={t.id ?? t.value} value={t.id ?? t.value}>{t.label}</option>)}
            </select>
          </div>

          {esMotivoRegional && (
            <div>
              <label className="label">Ciudad de cobertura *</label>
              <input
                className="input"
                value={form.regional_city}
                onChange={(e) => set('regional_city', e.target.value)}
                placeholder="Ej: Santa Marta, Cartagena, Valledupar, Riohacha, Sabanalarga…"
                maxLength={60}
              />
              <div className="text-xs text-gray-400 mt-1">
                Indicá la ciudad a la que se traslada el profesional para cobertura.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio *</label>
              <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha fin</label>
              <input className="input" type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_partial}
                onChange={(e) => {
                  const v = e.target.checked
                  setForm((f) => ({ ...f, is_partial: v, absence_start_time: v ? f.absence_start_time : '', absence_end_time: v ? f.absence_end_time : '' }))
                }}
                className="rounded"
              />
              <span className="text-xs text-gray-700">Ausencia parcial — solo unas horas dentro del día (ej. llegada tardía, salida anticipada)</span>
            </label>
          </div>

          {form.is_partial && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Hora inicio ausencia *</label>
                  <input className="input" type="time" value={form.absence_start_time} onChange={(e) => set('absence_start_time', e.target.value)} />
                </div>
                <div>
                  <label className="label">Hora fin ausencia *</label>
                  <input className="input" type="time" value={form.absence_end_time} onChange={(e) => set('absence_end_time', e.target.value)} />
                </div>
              </div>
              {minutosParcial !== null && (
                <div className="text-xs text-gray-600">
                  Duración: <strong>{Math.floor(minutosParcial / 60)}h {minutosParcial % 60 > 0 ? `${minutosParcial % 60}m` : ''}</strong>
                  <span className="text-gray-400"> · el impacto se calculará proporcional a estas horas</span>
                </div>
              )}
              {horasInvalidas && (
                <div className="text-xs text-red-600">⛔ La hora fin debe ser posterior a la hora inicio.</div>
              )}
            </div>
          )}

          <div>
            <label className="label">Observaciones</label>
            <textarea className="input resize-none" rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Ej: No se presentó al consultorio y no avisó" />
          </div>

          {/* ===== Fase 5 · F-AA-126 v04 ===== */}
          <div className="border-t border-gray-100 pt-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Datos para el formato F-AA-126 v04</div>

            <div>
              <label className="label">¿A qué empresa aplica la ausencia? *</label>
              <div className="flex gap-4 flex-wrap">
                {[
                  { v: 'foca',  l: 'FOCA' },
                  { v: 'viu',   l: 'VIU' },
                  { v: 'ambas', l: 'AMBAS' },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="empresa_afectada"
                      checked={form.affected_company === o.v}
                      onChange={() => set('affected_company', o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="label">¿Desea reponer?</label>
              <div className="flex gap-4 flex-wrap">
                {[
                  { v: 'si', l: 'SÍ' },
                  { v: 'no', l: 'NO' },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="desea_reponer"
                      checked={form.wants_makeup === o.v}
                      onChange={() => set('wants_makeup', o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>

            {form.wants_makeup === 'si' && (
              <div className="mt-3">
                <label className="label">Observaciones de reposición</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.makeup_notes}
                  onChange={(e) => set('makeup_notes', e.target.value)}
                  placeholder="Detalle la fecha, horario y/o modalidad propuesta para la reposición."
                  maxLength={2000}
                />
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2 mt-2">
                  ℹ️ Al confirmar esta ausencia, se abrirá automáticamente el formulario de <strong>Proponer reposición</strong> con estos datos precargados.
                </div>
              </div>
            )}
          </div>

          {alertaAnticip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Este tipo requiere 30 días de anticipación. Estás registrando con {anticip} días.
            </div>
          )}

          {/* Advertencia F-AA-126 (formato oficial oftalmología/optometría):
              recomienda informar con 20 días antes. Solo advertencia — NO bloquea. */}
          {['oftalmologo','optometra','anestesiologo','otorrino','fonoaudiologa'].includes(categoria) && anticip !== null && anticip < 20 && anticip >= 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              📄 <strong>Formato F-AA-126</strong>: la política interna recomienda informar las ausencias médicas con <strong>al menos 20 días de anticipación</strong>. Estás registrando con solo <strong>{anticip} {anticip === 1 ? 'día' : 'días'}</strong>. Puedes continuar, pero quedará registrado.
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

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Registrar ausencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
