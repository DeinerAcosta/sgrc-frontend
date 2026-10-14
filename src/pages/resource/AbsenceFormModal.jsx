import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, motivoAusenciaService } from '@/services/api'
import { GRUPOS_TIPO_AUSENCIA, parseFechaLocal, tiposDelGrupo } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import { differenceInDays } from 'date-fns'
import { useDirtyClose } from '@/hooks/useDirtyClose'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones']

// El profesional que se ausenta solo debe ver los motivos que le aplican a el.
// Los motivos operativos (cambio horario, disminuir pacientes, cubre_qx,
// regionales, brigada, etc.) los usa quien gestiona la reprogramacion — no el
// profesional. Se filtran por code.
//
// Sep-2026 · feedback usuario: las LICENCIAS (remunerada y no remunerada) salen
// de esta lista. El diligenciamiento se simplifico y las licencias no las
// registra el profesional — las tramita quien maneja la novedad de personal, y
// coord/sup/gerencia las siguen viendo completas en CoordLogAbsenceModal. Con
// esto cayo tambien el filtro SOLO_SALARIO_FIJO, que existia solo para
// esconderle esos dos motivos a quien no fuera de salario fijo.
// Sep-2026: se retiró el prop `esquemaPago`. Solo alimentaba el filtro que
// escondía las licencias a quien no fuera de salario fijo, y las licencias ya no
// se le ofrecen al profesional.
export default function AusenciaFormModal({ recursoId, tipoRecurso, onClose, horarioSemana = [] }) {
    const qc = useQueryClient()
  // motivoId = del catálogo dinámico; tipo = el enum legacy (se setea automáticamente).
  const [form, setForm] = useState({
    // grupo = primer nivel (remunerada / no remunerada). Recorta el segundo
    // select y no se envía: el backend solo conoce `type`.
    grupo: '',
    reasonId: '', type: '', start_date: '', end_date: '',
    is_partial: false, absence_start_time: '', absence_end_time: '', reason: '',
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

  // Momento del registro: se fija al ABRIR el modal, no en cada repintado. Si
  // se recalculara en cada render, el reloj iría cambiando mientras la persona
  // llena el formulario y el valor mostrado no sería el que se guarda.
  const [momentoRegistro] = useState(() => new Date())
  const momentoRegistroTxt = momentoRegistro.toLocaleString('es-CO', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
  })

  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.type) && anticip !== null && anticip < 30

  const pacientesImpactados = horarioSemana
    .filter((a) => a.weekday && form.start_date)
    .reduce((acc, a) => acc + (a.patient_capacity ?? 0), 0)

  // Los tipos del grupo elegido. Mientras no haya grupo, el segundo select
  // ni se muestra.
  const grupoSel = GRUPOS_TIPO_AUSENCIA.find((g) => g.value === form.grupo)
  const tipos = tiposDelGrupo(form.grupo, motivosCatalogo)

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.create({
      resource_id: recursoId, ...form,
      reason_id: form.reasonId || undefined,
      grupo: undefined,   // solo organiza el formulario; no es un campo del backend
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias'] })
      toast.success('Ausencia reportada. El coordinador será notificado.')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al reportar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.type && form.start_date

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Reportar ausencia</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* PROYECTOS-3398 §4 · La FECHA Y HORA DE REGISTRO va de primera y se
              precarga con el momento actual. Es un dato de solo lectura —lo
              pone el sistema, no la persona— y sirve para que quien reporta vea
              de entrada con cuánta antelación está avisando.
              El cálculo ya existía en el backend (`noticeDays`); lo que faltaba
              era mostrarlo ANTES de llenar el formulario, no después. */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Fecha y hora de registro</div>
            <div className="text-xs text-gray-800 font-medium">{momentoRegistroTxt}</div>
            {anticip !== null && (
              <div className={`text-[11px] mt-1.5 ${
                anticip < 0 ? 'text-red-700' : anticip <= 2 ? 'text-amber-700' : 'text-green-700'
              }`}>
                {anticip < 0
                  ? `⚠️ Ausencia ya ocurrida — se está reportando ${Math.abs(anticip)} ${Math.abs(anticip) === 1 ? 'día' : 'días'} después`
                  : anticip === 0
                    ? '⚠️ Se está reportando el mismo día'
                    : `Avisando con ${anticip} ${anticip === 1 ? 'día' : 'días'} de antelación`}
              </div>
            )}
          </div>

          {/* Primer nivel. Cambiarlo limpia el tipo: los del grupo anterior
              ya no aplican y dejarlo puesto guardaría una incoherencia. */}
          <div>
            <label className="label">¿La ausencia es remunerada? *</label>
            <select
              className="input"
              value={form.grupo}
              onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value, reasonId: '', type: '' }))}
            >
              <option value="">Seleccionar...</option>
              {GRUPOS_TIPO_AUSENCIA.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            {grupoSel && <div className="text-[11px] text-gray-500 mt-1">{grupoSel.descripcion}</div>}
          </div>

          {/* Segundo nivel. */}
          {form.grupo && (
            <div>
              <label className="label">Tipo de ausencia *</label>
              <select
                className="input"
                value={form.reasonId || form.type}
                onChange={(e) => {
                  const sel = tipos.find((t) => String(t.id) === e.target.value || t.value === e.target.value)
                  setForm((f) => ({ ...f, reasonId: sel?.id ?? '', type: sel?.value ?? '' }))
                }}
              >
                <option value="">Seleccionar tipo...</option>
                {tipos.map((t) => <option key={t.id ?? t.value} value={t.id ?? t.value}>{t.label}</option>)}
              </select>
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
