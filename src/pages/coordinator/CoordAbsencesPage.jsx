import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, sedeService, reposicionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, Avatar, usePaginacion, Paginacion } from '@/components/ui'
import { TIPOS_AUSENCIA, formatCOP, parseFechaLocal, GRUPOS_AUSENCIAS, tiposSinGrupo, TIPOS_QUE_IMPACTAN_PACIENTES } from '@/utils/helpers'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import RegistrarAusenciaCoordModal from '@/pages/coordinator/CoordLogAbsenceModal'
import { useSedeActiva } from '@/hooks/useActiveSite'

const TIPO_LABEL = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

/**
 * ¿Esta ausencia todavía necesita que alguien la gestione?
 *
 * No es lo mismo que "está pendiente". Son dos preguntas:
 *   · `status`            ¿ocurrió la ausencia?       → pendiente | confirmada
 *   · `reschedule_status` ¿ya se gestionó la agenda?  → null | asignada | resuelta
 *
 * Una ausencia CONFIRMADA con 33 pacientes sin reubicar es el caso más urgente
 * que hay, y antes no aparecía como pendiente de nadie porque la pestaña solo
 * miraba la primera pregunta.
 *
 * Queda fuera la rechazada (no ocurrió) y la que no dejó pacientes tirados: si
 * nadie se quedó sin atender, no hay agenda que reubicar.
 */
const necesitaGestion = (a) => {
  if (a.status === 'rechazada') return false
  if (a.status === 'pendiente') return true
  return (a.patients_affected ?? 0) > 0 && a.reschedule_status !== 'resuelta'
}

export default function AusenciasCoordPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { siteId: sedeId, Selector } = useSedeActiva()
  const [tab, setTab] = useState('pendientes')
  const [selected, setSelected] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [notaConfirm, setNotaConfirm] = useState('')
  const [showRegistrar, setShowRegistrar] = useState(false)
  // Ausencia abierta en el modal de gestión (§6.1). null = cerrado.
  const [gestionando, setGestionando] = useState(null)
  // Si la ausencia confirmada trae desea_reponer=true,
  // abrimos automáticamente el modal de proponer reposición (Fase 3) con la
  // ausencia preseleccionada para no obligar al coord a ir a otro sitio.
  // Grupo de personal elegido. Vive en la URL (?grupo=auxiliares) y no en
  // estado interno, para que el menú lateral pueda enlazar directo a cada uno
  // y para que la pantalla se pueda compartir o recargar sin perderse.
  // Sin ?grupo → se muestran las tarjetas.
  const grupoKey = searchParams.get('grupo')
  const grupo = GRUPOS_AUSENCIAS.find((g) => g.key === grupoKey) ?? null
  const setGrupoKey = (key) => {
    const p = new URLSearchParams(searchParams)
    if (key) p.set('grupo', key)
    else p.delete('grupo')
    setSearchParams(p)
  }

  // Ausencias de TODOS los grupos, para los contadores de las tarjetas. Va sin
  // filtro de estado ni de sede a propósito: la pantalla de entrada debe decir
  // cuánto hay en cada grupo antes de que elijas sede, y el backend ya recorta
  // por el alcance de quien consulta.
  const { data: ausenciasHub = [], isLoading: cargandoHub } = useQuery({
    queryKey: ['ausencias-hub'],
    queryFn: () => ausenciaService.list({}),
    enabled: !grupoKey,
    staleTime: 30 * 1000,
  })

  // Cargar sede para obtener ciudad (para el sugeridor de reemplazos)
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-list-ausencias'],
    queryFn: () => sedeService.list(),
  })
  const sedeActual = sedes.find((s) => s.id === sedeId)

  const { data: ausencias = [], isLoading } = useQuery({
    queryKey: ['ausencias-coord', sedeId],
    // Sin filtro de estado en el servidor: "por gestionar" no es un estado de
    // la ausencia, es el cruce de dos. Se filtra abajo con necesitaGestion.
    queryFn: () => ausenciaService.list({ site_id: sedeId }),
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
    // La nota llega del modal de gestión: lleva qué se hizo con la agenda, no
    // solo un comentario suelto.
    mutationFn: ({ id, nota, accion }) => ausenciaService.confirmar(id, {
      nota_coordinador: nota ?? notaConfirm,
      action_taken: accion ?? undefined,
    }),
    onSuccess: (actualizada, variables) => {
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      qc.invalidateQueries({ queryKey: ['ausencias-hub'] })
      setGestionando(null)
      toast.success('Ausencia gestionada. Recursos notificados.')
      setSelected(null)
      // El proceso no termina al guardar: si la agenda hay que cubrirla o
      // reprogramarla, lo siguiente es decidir QUIEN, y eso vive en la
      // pantalla de reemplazo. Antes esto se quedaba aquí y el hueco seguía
      // abierto sin que nada lo recordara.
      if (variables?.irAReemplazo) navigate(`/app/reemplazo/${variables.id}`)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al confirmar'),
  })

  // Oct-2026 · SIN USO POR AHORA, y a proposito. Al quitar "No procede" del
  // modal de gestion (decision de Hector: la persona ya falto, preguntarlo
  // invitaba a cerrar el caso de un clic) esta quedo sin boton que la llame, y
  // es la UNICA forma de rechazar una ausencia en toda la app. O sea que hoy
  // una ausencia registrada por error no se puede deshacer.
  // No se borra hasta que se decida donde vive esa salida — si es que debe
  // existir. Ver PROYECTOS-3398 §6.1.
  // eslint-disable-next-line no-unused-vars
  const { mutate: rechazar, isPending: rechazando } = useMutation({
    mutationFn: ({ id, reason: motivo }) => ausenciaService.rechazar(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      qc.invalidateQueries({ queryKey: ['ausencias-hub'] })
      setGestionando(null)
      toast('Ausencia marcada como no procedente. El recurso fue notificado.', { icon: 'ℹ️' })
      setSelected(null)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al guardar'),
  })

  // Solo las del grupo elegido. El backend no filtra por tipo de recurso, así
  // que se recorta aquí: la respuesta ya trae `resource.type` anidado.
  const ausenciasGrupo = grupo
    ? ausencias.filter((a) => grupo.tipos.includes(a.resource?.type))
    : ausencias

  const pendientes = ausenciasGrupo.filter(necesitaGestion)
  const sel = ausenciasGrupo.find((a) => a.id === selected)
  const pag = usePaginacion(ausenciasGrupo, 10)

  // Sep-2026 · El módulo se entra por una pantalla de tarjetas, una por grupo de
  // personal. Mientras no se elija grupo se muestran las tarjetas; al entrar en
  // una, el listado de siempre pero acotado a ese personal.
  if (!grupo) {
    return (
      <HubAusencias
        ausencias={ausenciasHub}
        cargando={cargandoHub}
        Selector={Selector}
        onElegir={setGrupoKey}
        onRegistrar={() => setShowRegistrar(true)}
      >
        {showRegistrar && (
          <RegistrarAusenciaCoordModal
            sedeId={sedeId}
            onClose={() => setShowRegistrar(false)}
            onSaved={() => { setShowRegistrar(false); qc.invalidateQueries({ queryKey: ['ausencias-hub'] }) }}
          />
        )}
      </HubAusencias>
    )
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <button
            className="text-xs text-gray-500 hover:text-gray-900 mb-1.5 flex items-center gap-1"
            onClick={() => { setGrupoKey(null); setSelected(null) }}
          >
            ← Gestión de ausencias
          </button>
          <h1 className="text-base font-semibold text-gray-900">
            <span className="mr-1.5">{grupo.icono}</span>Ausencias · {grupo.label}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{grupo.descripcion}</p>
          <Selector className="mt-2" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              ['pendientes', `Por gestionar (${pendientes.length})`],
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
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr,1fr] gap-4">
        {/* GRILLA (PROYECTOS-3398 §5) — antes era una lista de tarjetas, una por
            ausencia. Con 131 registros había que ir bajando a ciegas: no se
            podía comparar fechas ni antelación de un vistazo, ni ordenar.
            Mismo patrón que el resto del sistema: encabezado fijo, 10 por
            página y conteo total. */}
        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : ausenciasGrupo.length === 0 ? (
            <EmptyState icon="✅" title="Sin ausencias" description="No hay ausencias en este estado" />
          ) : (
            <>
              <div className="overflow-auto max-h-[calc(100vh-290px)]">
                <table className="w-full text-xs border-separate border-spacing-0 min-w-[620px]">
                  <thead>
                    <tr>
                      {['Recurso', 'Motivo', 'Fechas', 'Antelación', 'Clasificación', 'Estado'].map((c) => (
                        <th key={c} className="sticky top-0 z-10 bg-brand-800 text-white text-left font-semibold px-3 py-2 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pag.visibles.map((a) => (
                      <tr
                        key={a.id}
                        onClick={() => setSelected(a.id)}
                        className={`cursor-pointer transition-colors ${
                          selected === a.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-3 py-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <Avatar nombre={a.resource?.name} size="sm" color="blue" />
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate">{a.resource?.name}</div>
                              <div className="text-[11px] text-gray-400 capitalize">{a.resource?.type}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-700">
                          {TIPO_LABEL[a.type] ?? a.type}
                          {a.is_partial && <Badge variant="blue" className="ml-1">Parcial</Badge>}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-600 whitespace-nowrap">
                          {format(parseFechaLocal(a.start_date), 'd MMM yyyy', { locale: es })}
                          {a.end_date !== a.start_date && (
                            <span className="text-gray-400"> – {format(parseFechaLocal(a.end_date), 'd MMM', { locale: es })}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-600 whitespace-nowrap">
                          {a.notice_days ?? 0} d
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100">
                          <Badge variant={a.is_planned ? 'green' : 'amber'}>
                            {a.is_planned ? 'Programada' : 'Imprevista'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100">
                          <Badge variant={a.status === 'pendiente' ? 'amber' : a.status === 'confirmada' ? 'green' : 'red'}>
                            {a.status}
                          </Badge>
                          {/* El segundo estado: el de la gestión. Sin esto, una
                              confirmada y una confirmada-sin-reubicar se veían
                              exactamente igual. */}
                          {necesitaGestion(a) && a.status !== 'pendiente' && (
                            <div className="mt-0.5">
                              <Badge variant="amber">por gestionar</Badge>
                            </div>
                          )}
                          {a.reschedule_status === 'resuelta' && (
                            <div className="mt-0.5">
                              <Badge variant="green">gestionada</Badge>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion estado={pag} etiqueta="ausencias" />
            </>
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
                <Row
                  label="Horario ausencia"
                  value={sel.is_partial ? `${sel.absence_start_time} – ${sel.absence_end_time}` : 'Día completo'}
                />
                {/* La hora a la que ESTABA PROGRAMADO, que es distinta de la
                    hora de la ausencia: en una de día completo no había hora, y
                    aun así la agenda que se cayó tiene la suya. Sin esto el
                    panel decía el día pero no a qué hora atendía. */}
                <FranjasAfectadas ausenciaId={sel.id} />
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

              {/* Oct-2026 · UN SOLO BOTÓN.
                  Antes eran dos: GESTIONAR abría un modal que preguntaba "¿qué
                  pasó con su agenda?" y Buscar reemplazo llevaba a la pantalla.
                  Decidirlo a ciegas en un modal, antes de ver las franjas que se
                  cayeron, era pedirle a alguien que se comprometa con una
                  respuesta que todavía no puede saber. Ahora GESTIONAR lleva
                  directo a la pantalla, y qué pasa con la agenda se decide ahí,
                  franja por franja, con los candidatos a la vista. */}
              <AccionDelCaso ausencia={sel} onIr={() => navigate(`/app/reemplazo/${sel.id}`)} />
            </div>
          )}
        </div>
      </div>
      )}

      {showRegistrar && (
        <RegistrarAusenciaCoordModal
          sedeId={sedeId}
          onClose={() => setShowRegistrar(false)}
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

/**
 * Modal de GESTIÓN de una ausencia (PROYECTOS-3398 §6.1).
 *
 * Reemplaza a los botones sueltos de Confirmar y Rechazar. La diferencia no es
 * cosmética: antes el caso se cerraba con un clic, sin obligar a decir qué pasó
 * con la agenda. Por eso en producción había 6 ausencias pendientes de hasta
 * 106 días — reales, ya ocurridas, nunca revisadas.
 *
 * Ahora son dos decisiones separadas:
 *
 *   1. ¿Procede la ausencia?            aceptar / no aceptar
 *   2. ¿Qué se hizo con la agenda?      solo si procede y el recurso atiende
 *                                       pacientes — a un auxiliar no se le
 *                                       reprograma nada
 *
 * La segunda es la que faltaba. "Confirmada" decía que la ausencia era válida,
 * pero no si los pacientes se reubicaron, si otro profesional cubrió o si la
 * agenda simplemente se perdió. Ese dato es el que necesita Duarte para su
 * trabajo y el que no existe en ningún informe.
 *
 * Lo elegido se guarda en `actionTaken`, que ya estaba en el modelo y nadie
 * escribía.
 */
const ACCIONES_AGENDA = [
  { value: 'reprogramada',   label: 'Se reprogramaron los pacientes', help: 'Pasan a otro día u otro profesional' },
  { value: 'cubierta',       label: 'Otro profesional cubrió',        help: 'La agenda se atendió igual' },
  { value: 'perdida',        label: 'La agenda se perdió',            help: 'No se pudo reubicar a nadie' },
  { value: 'sin_agenda',     label: 'No tenía agenda ese día',        help: 'No había pacientes programados' },
]

/**
 * Pantalla de entrada del módulo: una tarjeta por grupo de personal.
 *
 * Sep-2026 · Antes se entraba directo a un listado plano con todo mezclado. La
 * división por grupo existe porque las ausencias se gestionan distinto según
 * quién falta: un profesional que no viene deja pacientes sin atender y puede
 * reponer; un asesor no atiende pacientes, así que ni genera impacto ni repone.
 *
 * Cada tarjeta muestra el total y, aparte, las que están por revisar — que es
 * lo único que exige acción hoy. Si no hay ninguna pendiente se dice "al día"
 * en vez de un cero suelto, para que se lea de un vistazo cuál mirar primero.
 */
function HubAusencias({ ausencias, cargando, Selector, onElegir, onRegistrar, children }) {
  const conteos = (tipos) => {
    const delGrupo = ausencias.filter((a) => tipos.includes(a.resource?.type))
    return {
      total: delGrupo.length,
      pendientes: delGrupo.filter(necesitaGestion).length,
    }
  }
  // Si alguien agrega un tipo de recurso y olvida meterlo en un grupo, sus
  // ausencias no saldrían en ninguna tarjeta. Mejor avisarlo que esconderlas.
  const huerfanos = tiposSinGrupo()

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Gestión de ausencias</h1>
          <p className="text-xs text-gray-500 mt-0.5">Elige el grupo de personal que vas a gestionar</p>
          <Selector className="mt-2" />
        </div>
        <button className="btn-danger" onClick={onRegistrar}>+ Registrar ausencia</button>
      </div>

      {huerfanos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
          ⚠️ Hay tipos de recurso sin grupo asignado ({huerfanos.join(', ')}). Sus ausencias no
          aparecen en ninguna tarjeta — hay que agregarlos en <code>GRUPOS_AUSENCIAS</code>.
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {GRUPOS_AUSENCIAS.map((g) => {
            const { total, pendientes } = conteos(g.tipos)
            const hayQueMirar = pendientes > 0
            return (
              <button
                key={g.key}
                onClick={() => onElegir(g.key)}
                className={`card text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  hayQueMirar ? 'border-l-4 border-l-red-500' : ''
                }`}
              >
                <div className="text-3xl mb-2">{g.icono}</div>
                <div className="text-sm font-semibold text-gray-900">{g.label}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-snug min-h-[2.4em]">{g.descripcion}</div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-gray-900 leading-none">{total}</div>
                    <div className="text-[11px] text-gray-500 mt-1">ausencias</div>
                  </div>
                  {hayQueMirar ? (
                    <Badge variant="red">{pendientes} por revisar</Badge>
                  ) : (
                    <span className="text-[11px] text-green-700">✓ al día</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {children}
    </div>
  )
}

function ReposicionesTab({ reposiciones, qc }) {
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

/**
 * El botón del panel, según en qué punto está el caso.
 *
 * Hector: "si esta ya está realizada y confirmada, ¿por qué aparece Gestionar?
 * Debe salir Ver Detalles solamente, y que muestre que todo se realizó."
 *
 * Tiene razón: GESTIONAR invita a hacer algo que ya está hecho. Y el estado de
 * la AUSENCIA no sirve para decidirlo —puede estar confirmada y con la agenda
 * sin reubicar— así que se mira la cuenta del caso: si todos los pacientes
 * tienen dónde ir, el caso está cerrado y lo que queda es consultarlo.
 *
 * Comparte la consulta con FranjasAfectadas (misma queryKey), así que no hay
 * una segunda petición.
 */
function AccionDelCaso({ ausencia, onIr }) {
  const { data } = useQuery({
    queryKey: ['contexto-reemplazo', ausencia.id],
    queryFn: () => ausenciaService.contextoReemplazo(ausencia.id),
    enabled: !!ausencia.id,
    staleTime: 30_000,
  })
  const cuenta = data?.cuenta
  const resuelto = !!cuenta?.resuelto

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      {resuelto && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-900">
          <div className="font-semibold">✅ Agenda reubicada</div>
          <div className="mt-0.5">
            Los {cuenta.pacientes_impactados} pacientes tienen dónde ir.
          </div>
          {cuenta.quienes_cubren.map((q, i) => (
            <div key={i} className="mt-0.5">
              · <strong>{q.nombre}</strong> — {q.dia} {q.desde}–{q.hasta} · {q.pacientes} pac.
            </div>
          ))}
        </div>
      )}

      <button
        className={`w-full justify-center ${resuelto ? 'btn' : 'btn-primary'}`}
        onClick={onIr}
      >
        {resuelto ? '🔍 Ver detalles' : '⚙️ GESTIONAR'}
      </button>

      <div className="text-xs text-gray-400 text-center">
        {resuelto
          ? 'Abre el caso para revisar cómo quedó o reasignar'
          : 'Abre la pantalla con las franjas que se cayeron: día, hora, sede y coordinador'}
      </div>
    </div>
  )
}

/**
 * Las franjas que se cayeron, con su hora y su sede.
 *
 * Hector: "en la página principal debe aparecer la hora también de la ausencia".
 * Y antes: "dice el día pero no la hora a la que está programado".
 *
 * La hora de la AUSENCIA y la hora de la AGENDA son dos cosas distintas: en una
 * ausencia de día completo no hay hora de ausencia, y aun así el profesional
 * tenía turnos con su horario. Lo que hace falta ver es el segundo.
 *
 * Se pide solo cuando hay una ausencia abierta en el panel —una por vez— y
 * reusa el contexto que ya alimenta la pantalla de gestión, así que no hay
 * endpoint nuevo ni consulta extra en el listado.
 */
function FranjasAfectadas({ ausenciaId }) {
  const { data } = useQuery({
    queryKey: ['contexto-reemplazo', ausenciaId],
    queryFn: () => ausenciaService.contextoReemplazo(ausenciaId),
    enabled: !!ausenciaId,
    staleTime: 30_000,
  })
  const franjas = data?.franjas ?? []
  if (franjas.length === 0) return null
  return (
    <div className="pt-1">
      <div className="text-gray-400 mb-1">Agenda que se cayó</div>
      {franjas.map((f) => (
        <div key={f.assignment_id} className="text-gray-800 font-medium leading-snug">
          <span className="capitalize">{f.weekday}</span> {f.start_time}–{f.end_time}
          <span className="font-normal text-gray-500"> · {f.site?.name} / {f.room?.name}</span>
          {f.patient_capacity ? <span className="font-normal text-gray-500"> · {f.patient_capacity} pac.</span> : null}
          {f.reemplazo && <span className="text-blue-700"> · cubre {f.reemplazo.resource?.name}</span>}
        </div>
      ))}
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
