import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { differenceInDays, differenceInCalendarDays } from 'date-fns'
import { recursoService, ausenciaService, motivoAusenciaService } from '@/services/api'
import { GRUPOS_TIPO_AUSENCIA, TIPOS_RECURSO, parseFechaLocal, tiposDelGrupo, MOTIVO_RETRASO } from '@/utils/helpers'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useAuthStore } from '@/store/authStore'

const REQUIEREN_ANTICIPACION = ['academico', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada']

// Sep-2026 · feedback usuario: la reposición aplica SOLO a los profesionales
// que atienden pacientes directamente. Personal de apoyo (asesores, auxiliares,
// técnicos) no repone → se oculta el bloque "¿Desea reponer?" cuando la
// categoría elegida no está en este set.

/**
 * HU-C-06: Coordinador registra una ausencia en nombre del recurso.
 * Queda con flag `registrado_por_coordinador = true`.
 * Solo se permite hasta 7 días hacia atrás.
 */
export default function RegistrarAusenciaCoordModal({ sedeId, onClose, tipos }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  // 21-oct · Hector: dentro de un módulo (Asesores, Técnicos...) el registro
  // viene ya en ese tipo de recurso; en la página general se elige entre todos.
  const categorias = tipos?.length ? TIPOS_RECURSO.filter((t) => tipos.includes(t.value)) : TIPOS_RECURSO
  const [categoria, setCategoria] = useState(categorias.length === 1 ? categorias[0].value : '')
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
    // grupo = primer nivel (remunerada / no remunerada). Recorta el segundo
    // select y no se envía: el backend solo conoce `type`.
    grupo: '',
  })

  // Catálogo dinámico de motivos. Fallback al hardcoded si la API falla.
  const { data: motivosCatalogo = [] } = useQuery({
    queryKey: ['motivos-ausencia', 'activos'],
    queryFn: () => motivoAusenciaService.list({ soloActivos: true }),
    staleTime: 5 * 60 * 1000,
  })
  const esMotivoRegional = form.motivoCodigo === 'regional'
  // 3650 · El retraso siempre es por horas: debía empezar → empezó.
  const esRetraso = form.motivoCodigo === MOTIVO_RETRASO
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

  // Los PROFESIONALES son rotativos — no tienen coordinador_lider ni sede fija,
  // pero igual el coordinador debe poder registrarles ausencia (si no se presentan, la sede pierde
  // dinero por costo del consultorio agendado). Traer aparte y combinar con el equipo.
  // 22-oct · QA (F1): solo traía oftalmólogos y anestesiólogos; con "Optómetra"
  // salía "Sin personal" aunque hay 12 activos. Ahora los cinco tipos de profesional.
  const { data: rotativos = [] } = useQuery({
    queryKey: ['recursos-rotativos-profesionales'],
    queryFn: async () => (await Promise.all(
      ['oftalmologo', 'optometra', 'anestesiologo', 'otorrino', 'fonoaudiologa']
        .map((type) => recursoService.list({ type, active: true })),
    )).flat(),
  })
  // Y el personal de la sede activa (técnicos, auxiliares, asesores que no
  // tienen a este coordinador como líder pero trabajan en su sede).
  const { data: deLaSede = [] } = useQuery({
    queryKey: ['recursos-sede-ausencia', sedeId],
    queryFn: () => recursoService.list({ site_id: sedeId, active: true }),
    enabled: esCoordAus && !!sedeId,
  })

  // Combina y deduplica por id (por si algún profesional tiene líder asignado y aparece en ambos).
  const recursos = (() => {
    const map = new Map()
    for (const r of [...equipo, ...deLaSede, ...rotativos]) map.set(r.id, r)
    return [...map.values()]
  })()

  // Solo muestra el personal de la categoría elegida (RN-X: filtrar por tipo de recurso)
  const recursosFiltrados = categoria ? recursos.filter((r) => r.type === categoria) : []

  // Días de calendario (oct-2026): el 20-oct, una ausencia del 9-nov son 20
  // días, no 19 por la hora del registro. Igual que el servidor (lib/anticipacion).
  const anticip = form.start_date ? differenceInCalendarDays(parseFechaLocal(form.start_date), new Date()) : null
  const alertaAnticip = REQUIEREN_ANTICIPACION.includes(form.type) && anticip !== null && anticip < 30
  const diasAtras = form.start_date ? differenceInDays(new Date(), parseFechaLocal(form.start_date)) : 0
  // Sep-14-2026: supervisor y gerencia pueden registrar ausencias retroactivas
  // sin limite (para casos excepcionales como vacaciones ya iniciadas). El
  // coordinador mantiene el limite de 7 dias para proteger el historico.
  const puedeSaltarRestriccionFecha = user?.role === 'supervisor' || user?.role === 'gerencia'
  const fechaInvalida = !puedeSaltarRestriccionFecha && diasAtras > 7

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
      grupo: undefined,   // solo organiza el formulario; no es un campo del backend
      // 3739 · Lo elegido en el primer nivel queda como valor inicial; Agendas lo puede cambiar.
      is_paid: form.grupo ? form.grupo === 'remunerada' : undefined,
      end_date: form.end_date || form.start_date,
      recorded_by_coordinator: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      toast.success('Ausencia registrada. El sistema calculó el impacto.')
      onClose()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al registrar la ausencia'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ciudadOk = !esMotivoRegional || form.regional_city.trim().length >= 2
  const grupoSel = GRUPOS_TIPO_AUSENCIA.find((g) => g.value === form.grupo)
  // Oct-2026 · La fecha final no puede quedar antes de la inicial (en producción
  // quedó una vacación del 27-nov al 11-nov). El servidor también lo rechaza.
  const rangoInvalido = !!(form.end_date && form.start_date && form.end_date < form.start_date)
  const valid = form.resource_id && form.type && form.start_date && !fechaInvalida && horasOk && ciudadOk && !rangoInvalido

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
            <label className="label">Categoría <span className="text-red-600">*</span></label>
            <select
              className="input"
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); set('resource_id', '') }}
            >
              {categorias.length > 1 && <option value="">Seleccionar categoría...</option>}
              {categorias.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Recurso <span className="text-red-600">*</span></label>
            <select
              className="input"
              value={form.resource_id}
              onChange={(e) => set('resource_id', e.target.value)}
              disabled={!categoria}
            >
              <option value="">
                {!categoria ? 'Primero elija la categoría...' : recursosFiltrados.length === 0 ? 'Sin personal de esta categoría en la sede' : 'Seleccionar recurso...'}
              </option>
              {recursosFiltrados.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.specialty ? ` · ${r.specialty}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Primer nivel. Cambiarlo limpia el tipo: los del grupo anterior
              ya no aplican y dejarlo puesto guardaría una incoherencia. */}
          <div>
            <label className="label">¿La ausencia es remunerada? <span className="text-red-600">*</span></label>
            <select
              className="input"
              value={form.grupo}
              onChange={(e) => setForm((f) => ({
                ...f, grupo: e.target.value, reasonId: '', motivoCodigo: '', type: '', regional_city: '',
              }))}
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
                  const sel = tiposDelGrupo(form.grupo, motivosCatalogo).find(
                    (t) => String(t.id) === e.target.value || t.value === e.target.value,
                  )
                  setForm((f) => ({
                    ...f,
                    reasonId: sel?.id ?? '',
                    motivoCodigo: sel?.code ?? sel?.value ?? '',
                    type: sel?.value ?? '',
                    ...(sel?.code === MOTIVO_RETRASO ? { is_partial: true } : {}),
                    // Si cambia a un motivo distinto de "regional", limpiamos la ciudad.
                    regional_city: sel?.value === 'regional' ? f.regional_city : '',
                  }))
                }}
              >
                <option value="">Seleccionar tipo...</option>
                {tiposDelGrupo(form.grupo, motivosCatalogo).map((t) => (
                  <option key={t.id ?? t.value} value={t.id ?? t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {esMotivoRegional && (
            <div>
              <label className="label">Ciudad de cobertura <span className="text-red-600">*</span></label>
              <input
                className="input"
                value={form.regional_city}
                onChange={(e) => set('regional_city', e.target.value)}
                placeholder="Ej: Santa Marta, Cartagena, Valledupar, Riohacha, Sabanalarga…"
                maxLength={60}
              />
              <div className="text-xs text-gray-400 mt-1">
                Indique la ciudad a la que se traslada el profesional para cobertura.
              </div>
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
              <input
                type="checkbox"
                checked={form.is_partial}
                disabled={esRetraso}
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
                  <label className="label">{esRetraso ? <>Hora en que debía empezar <span className="text-red-600">*</span></> : <>Hora inicio ausencia <span className="text-red-600">*</span></>}</label>
                  <input className="input" type="time" value={form.absence_start_time} onChange={(e) => set('absence_start_time', e.target.value)} />
                </div>
                <div>
                  <label className="label">{esRetraso ? <>Hora en que empezó <span className="text-red-600">*</span></> : <>Hora fin ausencia <span className="text-red-600">*</span></>}</label>
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

          {alertaAnticip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Este tipo requiere 30 días de anticipación. Está registrando con {anticip} días.
            </div>
          )}

          {/* Advertencia de anticipación (política interna, no el PDF — ese se eliminó):
              recomienda informar con 20 días antes. Solo advertencia — NO bloquea. */}
          {['oftalmologo','optometra','anestesiologo','otorrino','fonoaudiologa'].includes(categoria) && anticip !== null && anticip < 20 && anticip >= 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⏱️ Le recordamos que, según la política interna, las ausencias médicas deben informarse con <strong>al menos 20 días de anticipación</strong>. Su solicitud registra <strong>{anticip} {anticip === 1 ? 'día' : 'días'}</strong> de anticipación; sin embargo, puede continuar con el registro.
            </div>
          )}

          {fechaInvalida && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
              ⛔ Solo puede registrar ausencias para el día actual o hasta 7 días atrás.
            </div>
          )}
          {/* Sep-14-2026: aviso a supervisor/gerencia cuando registra retroactivo mas alla del limite del coord. */}
          {puedeSaltarRestriccionFecha && diasAtras > 7 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Está registrando una ausencia iniciada hace <strong>{diasAtras} días</strong>. Los coordinadores no pueden registrar con más de 7 días de atraso, pero como <strong>{user?.role}</strong> sí puede. Quedará registrado en la auditoría.
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
            ℹ️ Para garantizar la trazabilidad del proceso, quedará registrado en el historial de auditoría que usted realizó esta solicitud en nombre del recurso seleccionado.
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
