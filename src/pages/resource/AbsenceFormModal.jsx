import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, motivoAusenciaService } from '@/services/api'
import { GRUPOS_TIPO_AUSENCIA, parseFechaLocal, tiposDelGrupo, MOTIVO_RETRASO } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import CalendarioMultiple from '@/components/ui/CalendarioMultiple'
import { useAuthStore } from '@/store/authStore'
import { differenceInCalendarDays, format } from 'date-fns'
import { useDirtyClose } from '@/hooks/useDirtyClose'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones']

// Oct-2026 · Hector: vuelve "¿Desea reponer?" y, si dice que sí, las fechas se
// eligen en un calendario (varias). Solo para quien atiende pacientes; el
// personal de apoyo no repone (feedback de sep-2026).
const TIPOS_QUE_REPONEN = new Set(['oftalmologo', 'otorrino', 'fonoaudiologa', 'optometra', 'anestesiologo'])

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
export default function AusenciaFormModal({ recursoId, onClose, horarioSemana = [] }) {
    const qc = useQueryClient()
  // motivoId = del catálogo dinámico; tipo = el enum legacy (se setea automáticamente).
  const [form, setForm] = useState({
    // grupo = primer nivel (remunerada / no remunerada). Recorta el segundo
    // select y no se envía: el backend solo conoce `type`.
    grupo: '',
    reasonId: '', type: '', start_date: '', end_date: '',
    is_partial: false, absence_start_time: '', absence_end_time: '', reason: '',
    wants_makeup: '', makeup_dates: [], makeup_notes: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)
  // Autorización de datos personales (3642/3643). Sin marcar al abrir, siempre:
  // vive en el estado del modal, que nace de nuevo cada vez que se abre.
  const [autorizaDatos, setAutorizaDatos] = useState(false)
  const { data: autorizacion } = useQuery({
    queryKey: ['autorizacion-datos'],
    queryFn: () => ausenciaService.autorizacionDatos(),
    staleTime: 60 * 60 * 1000,
  })

  // Catálogo dinámico de motivos. Si falla, fallback al hardcoded.
  const { data: motivosCatalogo = [] } = useQuery({
    queryKey: ['motivos-ausencia', 'activos'],
    queryFn: () => motivoAusenciaService.list({ soloActivos: true }),
    staleTime: 5 * 60 * 1000,
  })

  // Días de calendario, igual que el servidor (lib/anticipacion): el 20-oct,
  // una ausencia del 9-nov son 20 días, no 19 por la hora del registro.
  const anticip = form.start_date
    ? differenceInCalendarDays(parseFechaLocal(form.start_date), new Date())
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
      // 3739 · Lo elegido en el primer nivel queda como valor inicial; Agendas lo puede cambiar.
      is_paid: form.grupo ? form.grupo === 'remunerada' : undefined,
      motivoCodigo: undefined,
      // Oct-2026 · ¿Desea reponer? y sus fechas (varias).
      wants_makeup: puedeReponer && form.wants_makeup ? form.wants_makeup === 'si' : undefined,
      makeup_dates: puedeReponer && form.wants_makeup === 'si' ? fechasValidas : undefined,
      // Si no repone, su motivo es el mismo "Motivo" del formulario.
      makeup_notes: !puedeReponer || !form.wants_makeup ? undefined
        : form.wants_makeup === 'no' ? (form.reason.trim() || undefined) : (form.makeup_notes.trim() || undefined),
      // La versión del texto que se mostró; el servidor la exige y la guarda.
      data_consent_version: autorizaDatos ? autorizacion?.version : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias'] })
      toast.success('Ausencia reportada. El coordinador será notificado.')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al reportar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const { user } = useAuthStore()
  const puedeReponer = TIPOS_QUE_REPONEN.has(user?.type)
  // Se puede reponer desde mañana (incluso antes de la ausencia).
  const [manana] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return format(d, 'yyyy-MM-dd') })
  const faltaMotivoNoReponer = puedeReponer && form.wants_makeup === 'no' && form.reason.trim().length < 5
  // Al cambiar las fechas de la ausencia, las de reposición que caigan en ella se quitan.
  const fechasValidas = form.makeup_dates.filter((f) => !(form.start_date && f >= form.start_date && f <= (form.end_date || form.start_date)))
  const esRetraso = form.motivoCodigo === MOTIVO_RETRASO
  const horasRetraso = !(esRetraso || form.is_partial) || (form.absence_start_time && form.absence_end_time)
  // Oct-2026 · La fecha final no puede quedar antes de la inicial (en producción
  // quedó una vacación del 27-nov al 11-nov). El servidor también lo rechaza.
  const rangoInvalido = !!(form.end_date && form.start_date && form.end_date < form.start_date)
  const valid = form.type && form.start_date && horasRetraso && autorizaDatos && !!autorizacion && !faltaMotivoNoReponer && !rangoInvalido

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
            <label className="label">¿La ausencia es remunerada? <span className="text-red-600">*</span></label>
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
              <label className="label">Tipo de ausencia <span className="text-red-600">*</span></label>
              <select
                className="input"
                value={form.reasonId || form.type}
                onChange={(e) => {
                  const sel = tipos.find((t) => String(t.id) === e.target.value || t.value === e.target.value)
                  // 3650 · El retraso siempre es por horas: debía empezar → empezó.
                  setForm((f) => ({
                    ...f, reasonId: sel?.id ?? '', type: sel?.value ?? '', motivoCodigo: sel?.code ?? '',
                    ...(sel?.code === MOTIVO_RETRASO ? { is_partial: true } : {}),
                  }))
                }}
              >
                <option value="">Seleccionar tipo...</option>
                {tipos.map((t) => <option key={t.id ?? t.value} value={t.id ?? t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio <span className="text-red-600">*</span></label>
              <input className="input" type="date" value={form.start_date} onChange={(e) => { const d = e.target.value; setForm((f) => ({ ...f, start_date: d, end_date: f.end_date && d && f.end_date < d ? d : f.end_date })) }} />
            </div>
            <div>
              <label className="label">Fecha fin</label>
              <input className={`input ${rangoInvalido ? 'border-red-500 bg-red-50' : ''}`} type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_partial} disabled={esRetraso} onChange={(e) => set('is_partial', e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-700">Ausencia parcial dentro del día</span>
            </label>
          </div>

          {form.is_partial && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">{esRetraso ? 'Hora en que debía empezar' : 'Hora inicio ausencia'} <span className="text-red-600">*</span></label>
                <input className="input" type="time" value={form.absence_start_time} onChange={(e) => set('absence_start_time', e.target.value)} />
              </div>
              <div>
                <label className="label">{esRetraso ? 'Hora en que empezó' : 'Hora fin ausencia'} <span className="text-red-600">*</span></label>
                <input className="input" type="time" value={form.absence_end_time} onChange={(e) => set('absence_end_time', e.target.value)} />
              </div>
            </div>
          )}

          {puedeReponer && (
            <div>
              <label className="label">¿Deseas reponer esta ausencia?</label>
              <div className="flex gap-4">
                {[{ v: 'si', l: 'Sí' }, { v: 'no', l: 'No' }].map((o) => (
                  <label key={o.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="desea_reponer" checked={form.wants_makeup === o.v} onChange={() => set('wants_makeup', o.v)} />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 21-oct · Hector: un solo "Motivo" (antes había dos). Debajo de
              "¿Deseas reponer?"; si dice que no, es obligatorio. */}
          <div>
            <label className="label">
              Motivo{puedeReponer && form.wants_makeup === 'no' ? <> <span className="text-red-600">*</span></> : ' (opcional)'}
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              placeholder="Describe brevemente el motivo..."
              maxLength={2000}
            />
          </div>

          {puedeReponer && form.wants_makeup === 'si' && (
            <div>
              {form.wants_makeup === 'si' && (
                <div className="mt-3 space-y-2">
                  <label className="label">Fechas en que repondrá</label>
                  <CalendarioMultiple
                    value={form.makeup_dates}
                    onChange={(v) => set('makeup_dates', v)}
                    // Desde mañana, también antes de la ausencia; los días de la
                    // ausencia no se pueden marcar.
                    min={manana}
                    bloqueadas={form.start_date ? { desde: form.start_date, hasta: form.end_date || form.start_date } : null}
                  />
                  {form.makeup_dates.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.makeup_dates.map((f) => (
                        <span key={f} className="text-[11px] bg-blue-50 text-blue-800 border border-blue-100 rounded px-1.5 py-0.5">
                          {parseFechaLocal(f).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={form.makeup_notes}
                    onChange={(e) => set('makeup_notes', e.target.value)}
                    placeholder="Horario y modalidad propuesta para la reposición (opcional)."
                    maxLength={2000}
                  />
                </div>
              )}
            </div>
          )}

          {alertaAnticip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Este tipo de ausencia requiere mínimo 30 días de anticipación. Está reportando con {anticip} días. El coordinador será notificado de este incumplimiento.
            </div>
          )}

          {pacientesImpactados > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-800">
              🔴 Esta ausencia impacta aproximadamente <strong>{pacientesImpactados} pacientes</strong> programados. El coordinador recibirá notificación inmediata.
            </div>
          )}

          {/* Lo último antes de enviar: la autorización de datos personales,
              con el texto a la vista y no detrás de un enlace. */}
          {autorizacion && (
            <label className="flex items-start gap-2 cursor-pointer border-t border-gray-100 pt-3">
              <input
                type="checkbox"
                className="rounded mt-0.5"
                checked={autorizaDatos}
                onChange={(e) => setAutorizaDatos(e.target.checked)}
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                {autorizacion.texto}{' '}
                <a href={autorizacion.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                  Ver la política
                </a>
              </span>
            </label>
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
        {form.type && form.start_date && !autorizaDatos && (
          <div className="px-5 pb-4 -mt-2 text-[11px] text-gray-500 text-right">
            Para enviar, autoriza el tratamiento de datos personales.
          </div>
        )}
      </div>
    </div>
  )
}
