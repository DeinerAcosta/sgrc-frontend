import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, sedeService, reposicionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, Avatar } from '@/components/ui'
import { TIPOS_AUSENCIA, formatCOP, parseFechaLocal } from '@/utils/helpers'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import RegistrarAusenciaCoordModal from '@/pages/coordinator/CoordLogAbsenceModal'
import SugeridorReemplazosModal from '@/pages/coordinator/ReplacementSuggesterModal'
import RegistrarReposicionModal from '@/pages/resource/LogMakeupModal'
import { useSedeActiva } from '@/hooks/useActiveSite'

const TIPO_LABEL = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

export default function AusenciasCoordPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const { siteId: sedeId, Selector } = useSedeActiva()
  const [tab, setTab] = useState('pendientes')
  const [selected, setSelected] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [notaConfirm, setNotaConfirm] = useState('')
  const [showRegistrar, setShowRegistrar] = useState(false)
  const [showSugerir, setShowSugerir] = useState(null)
  // Fase 5 · F-AA-126 v04: si la ausencia confirmada trae desea_reponer=true,
  // abrimos automáticamente el modal de proponer reposición (Fase 3) con la
  // ausencia preseleccionada para no obligar al coord a ir a otro sitio.
  const [autoReposicion, setAutoReposicion] = useState(null)

  // Cargar sede para obtener ciudad (para el sugeridor de reemplazos)
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-list-ausencias'],
    queryFn: () => sedeService.list(),
  })
  const sedeActual = sedes.find((s) => s.id === sedeId)

  const { data: ausencias = [], isLoading } = useQuery({
    queryKey: ['ausencias-coord', sedeId, tab],
    queryFn: () => ausenciaService.list({ site_id: sedeId, status: tab === 'pendientes' ? 'pendiente' : undefined }),
    enabled: tab === 'pendientes' || tab === 'todas',
  })

  // Reposiciones pendientes de aprobación por este coord (Fase 3).
  const { data: reposicionesPend = [] } = useQuery({
    queryKey: ['reposiciones-coord', sedeId, 'solicitadas'],
    queryFn: () => reposicionService.list({ status: 'solicitada', site_id: sedeId }),
    staleTime: 60 * 1000,
  })

  // Enfocar una ausencia específica si llega ?selected=<id> en la URL (deep-link
  // desde una notificación). Si la encuentra en otro tab, cambia a "Todas".
  useEffect(() => {
    const want = searchParams.get('selected')
    if (!want || ausencias.length === 0) return
    const existe = ausencias.find((a) => a.id === want)
    if (existe) {
      setSelected(want)
    } else if (tab === 'pendientes') {
      setTab('todas')
    }
    // Limpiar el param tras consumirlo para que no quede pegado en navegaciones
    searchParams.delete('selected')
    setSearchParams(searchParams, { replace: true })
  }, [ausencias, searchParams, tab, setSearchParams])

  const { mutate: confirmar, isPending: confirmando } = useMutation({
    mutationFn: (id) => ausenciaService.confirmar(id, { nota_coordinador: notaConfirm }),
    onSuccess: (actualizada) => {
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      toast.success('Ausencia confirmada. Recursos notificados.')
      // Fase 5 · v04: si el profesional marcó "desea reponer=SÍ" en el formulario
      // original, encadenamos inmediatamente el modal de proponer reposición.
      // La ausencia actualizada viene del backend con la bandera desea_reponer.
      if (actualizada?.wants_makeup === true) {
        setAutoReposicion(actualizada)
      }
      setSelected(null)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al confirmar'),
  })

  const { mutate: rechazar } = useMutation({
    mutationFn: ({ id, reason: motivo }) => ausenciaService.rechazar(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      toast('Ausencia rechazada. El recurso fue notificado.', { icon: 'ℹ️' })
      setSelected(null)
    },
  })

  const pendientes = ausencias.filter((a) => a.status === 'pendiente')
  const sel = ausencias.find((a) => a.id === selected)

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Gestión de ausencias</h1>
          <Selector className="mt-2" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              ['pendientes', `Pendientes (${pendientes.length})`],
              ['todas', 'Todas'],
              ['reposiciones', `Reposiciones${reposicionesPend.length ? ` (${reposicionesPend.length})` : ''}`],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === k ? 'bg-white text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setTab(k)}
              >{label}</button>
            ))}
          </div>
          <button className="btn-danger" onClick={() => setShowRegistrar(true)}>
            + Registrar ausencia
          </button>
        </div>
      </div>

      {tab === 'reposiciones' ? (
        <ReposicionesTab reposiciones={reposicionesPend} qc={qc} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lista */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : ausencias.length === 0 ? (
            <EmptyState icon="✅" title="Sin ausencias" description="No hay ausencias en este estado" />
          ) : (
            ausencias.map((a) => (
              <div
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`card cursor-pointer hover:border-brand-400 transition-colors ${selected === a.id ? 'border-brand-400 ring-1 ring-brand-400' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar nombre={a.resource?.name} size="sm" color="blue" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">{a.resource?.name}</div>
                    <div className="text-xs text-gray-500">{TIPO_LABEL[a.type] ?? a.type}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {format(parseFechaLocal(a.start_date), 'd MMM', { locale: es })}
                      {a.end_date !== a.start_date && ` – ${format(parseFechaLocal(a.end_date), 'd MMM', { locale: es })}`}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={a.status === 'pendiente' ? 'amber' : a.status === 'confirmada' ? 'green' : 'red'}>
                      {a.status}
                    </Badge>
                    {a.patients_affected > 0 && (
                      <Badge variant="red">{a.patients_affected} pac.</Badge>
                    )}
                    {a.is_partial && <Badge variant="blue">Parcial</Badge>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detalle */}
        <div>
          {!sel ? (
            <div className="card h-full flex items-center justify-center text-xs text-gray-400">
              Selecciona una ausencia para ver el detalle
            </div>
          ) : (
            <div className="card space-y-4">
              <div className="flex items-center gap-3">
                <Avatar nombre={sel.resource?.name} size="md" color="blue" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{sel.resource?.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{sel.resource?.type} · {sel.resource?.specialty}</div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <Row label="Tipo" value={TIPO_LABEL[sel.type] ?? sel.type} />
                <Row label="Fechas" value={`${format(parseFechaLocal(sel.start_date), 'd MMM yyyy', { locale: es })} ${sel.end_date !== sel.start_date ? `— ${format(parseFechaLocal(sel.end_date), 'd MMM yyyy', { locale: es })}` : ''}`} />
                {sel.is_partial && <Row label="Horario ausencia" value={`${sel.absence_start_time} – ${sel.absence_end_time}`} />}
                {sel.reason && <Row label="Motivo" value={sel.reason} />}
                <Row label="Reportado" value={format(parseISO(sel.reported_at ?? sel.created_at), 'd MMM HH:mm', { locale: es })} />
                <Row label="Anticipación" value={`${sel.notice_days ?? '?'} días`} warn={(sel.notice_days ?? Infinity) < 30 && ['academico','vacaciones'].includes(sel.type)} />
              </div>

              {sel.patients_affected > 0 && (
                <div className="bg-red-50 rounded-lg p-3 space-y-1 text-xs">
                  <div className="font-medium text-red-800">Impacto calculado</div>
                  <Row label="Pacientes impactados" value={sel.patients_affected ?? 0} />
                  {sel.opportunity_cost && <Row label="Costo de oportunidad" value={formatCOP(sel.opportunity_cost)} />}
                  {sel.idle_staff_cost && <Row label="Costo personal inactivo" value={formatCOP(sel.idle_staff_cost)} />}

                  {/* Desglose día a día: qué y cuánto afecta a los pacientes durante la ausencia (RN-18) */}
                  {Array.isArray(sel.daily_impact) && sel.daily_impact.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      <div className="font-medium text-red-700 mb-1">Pacientes afectados por día</div>
                      <table className="w-full">
                        <thead>
                          <tr className="text-red-400 text-left">
                            <th className="font-medium">Día</th>
                            <th className="font-medium text-right">Pacientes</th>
                            <th className="font-medium text-right">Costo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sel.daily_impact.map((d, i) => (
                            <tr key={i} className="text-red-800">
                              <td className="capitalize">{d.day}{d.date ? ` ${d.date.slice(5)}` : ''}{d.parcial ? ' (parcial)' : ''}</td>
                              <td className="text-right">{d.pacientes}</td>
                              <td className="text-right">{formatCOP(d.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {sel.status === 'pendiente' && (
                <div className="space-y-2">
                  <label className="label">Nota / Motivo (obligatorio si rechazas — RN-20)</label>
                  <textarea
                    className="input resize-none text-xs"
                    rows={2}
                    value={notaConfirm}
                    onChange={(e) => setNotaConfirm(e.target.value)}
                    placeholder="Si confirmas: acción tomada (opcional). Si rechazas: motivo (mínimo 5 caracteres)"
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-danger flex-1 justify-center"
                      onClick={() => {
                        if (!notaConfirm || notaConfirm.trim().length < 5) {
                          toast.error('El motivo de rechazo es obligatorio (mínimo 5 caracteres)')
                          return
                        }
                        rechazar({ id: sel.id, reason: notaConfirm })
                      }}
                    >Rechazar</button>
                    <button
                      className="btn-success flex-1 justify-center"
                      onClick={() => confirmar(sel.id)}
                      disabled={confirmando}
                    >
                      {confirmando ? <Spinner size="sm" /> : '✓ Confirmar'}
                    </button>
                  </div>
                </div>
              )}

              {sel.status === 'confirmada' && (
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <button
                    className="btn-primary w-full justify-center"
                    onClick={() => setShowSugerir(sel)}
                  >
                    🔍 Buscar reemplazo
                  </button>
                  <div className="text-xs text-gray-400 text-center">
                    Sugiere recursos disponibles de cualquier sede de la ciudad
                  </div>
                  {/* Formato F-AA-126: solo para recursos médicos
                      (oftalmólogo, optómetra, anestesiólogo, otorrino, fonoaudiologa). */}
                  {['oftalmologo','optometra','anestesiologo','otorrino','fonoaudiologa'].includes(sel.resource?.type) && (
                    <>
                      <button
                        className="btn w-full justify-center"
                        onClick={async () => {
                          try {
                            const blob = await ausenciaService.descargarFormatoFAA126(sel.id)
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            const nombreSafe = (sel.resource?.name ?? 'profesional').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                            a.download = `F-AA-126_${nombreSafe}_${sel.id.slice(0, 8)}.pdf`
                            a.click()
                            URL.revokeObjectURL(url)
                            toast.success('Formato F-AA-126 descargado')
                          } catch (err) {
                            toast.error(err?.message ?? 'Error al generar el formato')
                          }
                        }}
                      >
                        📄 Descargar formato F-AA-126
                      </button>
                      <div className="text-xs text-gray-400 text-center">
                        Formato oficial de continuidad del servicio (PDF)
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {showRegistrar && (
        <RegistrarAusenciaCoordModal
          sedeId={sedeId}
          onClose={() => setShowRegistrar(false)}
          onCreated={(creada) => setAutoReposicion(creada)}
        />
      )}

      {autoReposicion && (
        <RegistrarReposicionModal
          ausencia={autoReposicion}
          onClose={() => setAutoReposicion(null)}
        />
      )}

      {showSugerir && (
        <SugeridorReemplazosModal
          asignacionVacia={{
            resource: showSugerir.resource,
            weekday: 'lunes', // simplificación demo
            start_time: '07:00',
            end_time: '13:00',
            week_id: 'sem-actual',
          }}
          ausencia={showSugerir}
          ciudad={sedeActual?.city}
          onClose={() => setShowSugerir(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Tab de Reposiciones (Fase 3): coord aprueba/rechaza propuestas del profesional.
// ============================================================================
const TIPO_REPOSICION_LABEL = {
  misma_agenda:  'Misma agenda',
  otra_sede:     'Otra sede / consultorio',
  doble_jornada: 'Doble jornada',
  otro:          'Otro',
}

function ReposicionesTab({ makeups: reposiciones, qc }) {
  const [seleccionada, setSeleccionada] = useState(null)
  const [nota, setNota] = useState('')
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const { mutate: aprobar, isPending: aprobando } = useMutation({
    mutationFn: ({ id, approverNote: notaAprobador }) => reposicionService.aprobar(id, { approver_note: notaAprobador }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reposiciones-coord'] })
      qc.invalidateQueries({ queryKey: ['reposiciones-recurso'] })
      toast.success('Reposición aprobada. El profesional fue notificado.')
      setSeleccionada(null)
      setNota('')
    },
    onError: (err) => toast.error(err?.message ?? 'Error al aprobar'),
  })

  const { mutate: rechazar, isPending: rechazando } = useMutation({
    mutationFn: ({ id, reason: motivo }) => reposicionService.rechazar(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reposiciones-coord'] })
      qc.invalidateQueries({ queryKey: ['reposiciones-recurso'] })
      toast('Reposición rechazada. El profesional fue notificado.', { icon: 'ℹ️' })
      setSeleccionada(null)
      setMotivoRechazo('')
    },
  })

  const sel = reposiciones.find((r) => r.id === seleccionada)

  if (reposiciones.length === 0) {
    return (
      <EmptyState
        icon="🔁"
        title="Sin reposiciones pendientes"
        description="Cuando un profesional proponga reponer una ausencia confirmada, aparecerá aquí."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        {reposiciones.map((r) => (
          <div
            key={r.id}
            onClick={() => { setSeleccionada(r.id); setNota(''); setMotivoRechazo('') }}
            className={`card cursor-pointer hover:border-brand-400 transition-colors ${seleccionada === r.id ? 'border-brand-400 ring-1 ring-brand-400' : ''}`}
          >
            <div className="flex items-start gap-2.5">
              <Avatar nombre={r.absence?.resource?.name} size="sm" color="blue" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">
                  {r.absence?.resource?.name ?? '—'}
                </div>
                <div className="text-xs text-gray-500">
                  Repone la ausencia del {format(parseFechaLocal(r.absence?.start_date), 'd MMM', { locale: es })}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  📅 {format(parseFechaLocal(r.makeup_date), "EEE d MMM", { locale: es })}
                  {' · '}⏰ {r.start_time}–{r.end_time}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  🏷 {TIPO_REPOSICION_LABEL[r.makeup_type] ?? r.makeup_type}
                </div>
              </div>
              <Badge variant="amber">solicitada</Badge>
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="card space-y-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {sel.absence?.resource?.name ?? '—'}
            </div>
            <div className="text-xs text-gray-500">
              {sel.absence?.resource?.type}
              {' · Solicitado el '}
              {format(parseISO(sel.requested_at), "d MMM yyyy HH:mm", { locale: es })}
            </div>
          </div>

          <div className="text-xs space-y-1.5">
            <Row label="Ausencia original" value={format(parseFechaLocal(sel.absence?.start_date), "EEEE d 'de' LLLL yyyy", { locale: es })} />
            <Row label="Fecha reposición" value={format(parseFechaLocal(sel.makeup_date), "EEEE d 'de' LLLL yyyy", { locale: es })} />
            <Row label="Horario" value={`${sel.start_time} – ${sel.end_time}`} />
            <Row label="Tipo" value={TIPO_REPOSICION_LABEL[sel.makeup_type] ?? sel.makeup_type} />
            {sel.room?.name && <Row label="Consultorio propuesto" value={sel.room.name} />}
            {sel.estimated_patients != null && <Row label="Pacientes estimados" value={sel.estimated_patients} />}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Justificación del profesional</div>
            <div className="text-xs text-gray-700 border border-gray-100 rounded p-2 bg-gray-50 whitespace-pre-wrap">
              {sel.request_reason}
            </div>
          </div>

          {/* Aprobar */}
          <div className="border border-green-100 bg-green-50/40 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-green-800">Aprobar reposición</div>
            <textarea
              className="input resize-none text-xs"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Nota opcional (ej: OK. Recuerda avisar en recepción.)"
            />
            <button
              type="button"
              className="btn-primary w-full justify-center"
              disabled={aprobando}
              onClick={() => aprobar({ id: sel.id, approverNote: nota })}
            >
              {aprobando ? <Spinner size="sm" /> : '✅ Aprobar'}
            </button>
          </div>

          {/* Rechazar */}
          <div className="border border-red-100 bg-red-50/40 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-red-800">Rechazar reposición</div>
            <textarea
              className="input resize-none text-xs"
              rows={2}
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Motivo del rechazo (obligatorio, mín 5 caracteres)"
            />
            <button
              type="button"
              className="btn-danger w-full justify-center"
              disabled={rechazando || motivoRechazo.trim().length < 5}
              onClick={() => rechazar({ id: sel.id, reason: motivoRechazo })}
            >
              {rechazando ? <Spinner size="sm" /> : '❌ Rechazar'}
            </button>
            {motivoRechazo.trim().length > 0 && motivoRechazo.trim().length < 5 && (
              <div className="text-[11px] text-red-600">Faltan {5 - motivoRechazo.trim().length} caracteres para poder rechazar.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, warn }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium text-right ${warn ? 'text-amber-700' : 'text-gray-800'}`}>{value}{warn && ' ⚠️'}</span>
    </div>
  )
}
