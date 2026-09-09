import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, motivoAusenciaService } from '@/services/api'
import { TIPOS_AUSENCIA, parseFechaLocal } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import { differenceInDays } from 'date-fns'
import { useDirtyClose } from '@/hooks/useDirtyClose'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada']
const SOLO_SALARIO_FIJO = ['licencia_remunerada', 'licencia_no_remunerada']

// Sep-2026: el recurso profesional solo debe ver los motivos que aparecen en el
// formato oficial F-AA-126 v04. Los motivos operativos (cambio horario, formato,
// disminuir pacientes, cubre_qx, regionales, brigada, etc.) los usa quien gestiona
// la reprogramacion — no el profesional que se ausenta. Se filtran por code.
const MOTIVOS_VISIBLES_RECURSO = new Set([
  'enfermedad',
  'calamidad',
  'academico',
  'familiar',
  'vacaciones',
  'licencia_no_remunerada',
  'licencia_remunerada',        // se filtra despues por esquema de pago si aplica
  'traslado_sedes_externas',
])

// Sep-2026 · feedback usuario: la reposición de ausencias aplica SOLO a los
// profesionales que atienden pacientes (oftalmólogos, otorrinos, fonoaudiólogas
// y optómetras). El personal de apoyo (auxiliares, técnicos, asesores,
// anestesiólogos) NO repone — no ven el bloque "¿Deseas reponer?" ni la caja
// de observaciones de reposición.
const TIPOS_QUE_REPONEN = new Set([
  'oftalmologo',
  'otorrino',
  'fonoaudiologa',
  'optometra',
])

export default function AusenciaFormModal({ recursoId, esquemaPago, tipoRecurso, onClose, horarioSemana = [] }) {
  const puedeReponer = TIPOS_QUE_REPONEN.has(tipoRecurso)
  const qc = useQueryClient()
  // motivoId = del catálogo dinámico; tipo = el enum legacy (se setea automáticamente).
  const [form, setForm] = useState({
    reasonId: '', type: '', start_date: '', end_date: '',
    is_partial: false, absence_start_time: '', absence_end_time: '', reason: '',
    // Fase 5 · F-AA-126 v04 — sin default; obligamos elección explícita.
    affected_company: '',
    wants_makeup: '',
    makeup_notes: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)

  // Catálogo dinámico de motivos. Si falla, fallback al hardcoded.
  const { data: motivosCatalogo = [] } = useQuery({
    queryKey: ['motivos-ausencia', 'activos'],
    queryFn: () => motivoAusenciaService.list({ soloActivos: true }),
    staleTime: 5 * 60 * 1000,
  })

  const anticip = form.start_date
    ? differenceInDays(parseFechaLocal(form.start_date), new Date())
    : null

  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.type) && anticip !== null && anticip < 30

  const pacientesImpactados = horarioSemana
    .filter((a) => a.weekday && form.start_date)
    .reduce((acc, a) => acc + (a.patient_capacity ?? 0), 0)

  // Combina catálogo dinámico + fallback hardcoded. Si el backend responde,
  // muestra el catálogo (incluye personalizados). Si no, sigue el hardcoded.
  const opciones = motivosCatalogo.length > 0
    ? motivosCatalogo.map((m) => ({ id: m.id, value: m.code, label: m.name }))
    : TIPOS_AUSENCIA.map((t) => ({ id: null, value: t.value, label: t.label }))

  const tipos = opciones.filter((t) => {
    // Filtro 1 (sep-2026): el recurso solo ve los 7 motivos del F-AA-126 oficial.
    // Coord/sup/gerencia siguen viendo TODOS via CoordLogAbsenceModal.
    if (!MOTIVOS_VISIBLES_RECURSO.has(t.value)) return false
    if (SOLO_SALARIO_FIJO.includes(t.value) && esquemaPago !== 'fijo') return false
    return true
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.create({
      resource_id: recursoId, ...form,
      reason_id: form.reasonId || undefined,
      affected_company: form.affected_company || undefined,
      wants_makeup: form.wants_makeup === 'si' ? true : form.wants_makeup === 'no' ? false : undefined,
      makeup_notes: form.wants_makeup === 'si' ? (form.makeup_notes || undefined) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias'] })
      toast.success('Ausencia reportada. El coordinador será notificado.')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al reportar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.type && form.start_date && !!form.affected_company  // Fase 5 · v04: empresa obligatoria

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Reportar ausencia</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Tipo de ausencia *</label>
            <select
              className="input"
              value={form.reasonId || form.type}
              onChange={(e) => {
                const sel = tipos.find((t) => String(t.id) === e.target.value || t.value === e.target.value)
                // El backend valida `tipo` contra el enum legacy (9 valores). Si el
                // motivo personalizado no corresponde a ninguno, mapeamos a 'otra'
                // y dejamos el motivoId para que la lógica del catálogo aplique.
                const codigosEnum = TIPOS_AUSENCIA.map((t) => t.value)
                const tipoEnum = codigosEnum.includes(sel?.value) ? sel.value : 'otra'
                setForm((f) => ({ ...f, reasonId: sel?.id ?? '', type: sel ? tipoEnum : '' }))
              }}
            >
              <option value="">Seleccionar tipo...</option>
              {tipos.map((t) => <option key={t.id ?? t.value} value={t.id ?? t.value}>{t.label}</option>)}
            </select>
          </div>

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
              <input type="checkbox" checked={form.is_partial} onChange={(e) => set('is_partial', e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-700">Ausencia parcial dentro del día</span>
            </label>
          </div>

          {form.is_partial && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Hora inicio ausencia</label>
                <input className="input" type="time" value={form.absence_start_time} onChange={(e) => set('absence_start_time', e.target.value)} />
              </div>
              <div>
                <label className="label">Hora fin ausencia</label>
                <input className="input" type="time" value={form.absence_end_time} onChange={(e) => set('absence_end_time', e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className="label">Motivo (opcional)</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              placeholder="Describe brevemente el motivo..."
            />
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
                      name="empresa_afectada_rec"
                      checked={form.affected_company === o.v}
                      onChange={() => set('affected_company', o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>

            {/* Reposición solo aplica a los profesionales que atienden pacientes.
                El personal de apoyo (asesores, auxiliares, tecnicos, anestesiologos)
                no repone — el bloque queda oculto para ellos. */}
            {puedeReponer && (
              <>
                <div className="mt-3">
                  <label className="label">¿Deseas reponer esta ausencia?</label>
                  <div className="flex gap-4 flex-wrap">
                    {[
                      { v: 'si', l: 'SÍ' },
                      { v: 'no', l: 'NO' },
                    ].map((o) => (
                      <label key={o.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="desea_reponer_rec"
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
                      placeholder="Detalla la fecha, horario y/o modalidad propuesta para la reposición."
                      maxLength={2000}
                    />
                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2 mt-2">
                      ℹ️ Cuando el coordinador confirme tu ausencia, podrás proponer formalmente la reposición desde "Mis ausencias".
                    </div>
                  </div>
                )}
              </>
            )}
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

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
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
