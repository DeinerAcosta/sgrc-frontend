import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { addWeeks, subWeeks, startOfWeek, format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { asignacionService, semanaService, sedeService, festivoService, recursoService, consultorioService, ausenciaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { DIAS_LABEL, DIAS, semanaLabel, diasDeSemana, parseFechaLocal, normalizarTexto, TIPOS_RECURSO, pacientesDelCaso, utilizacionSemanal } from '@/utils/helpers'
import AsignacionModal from '@/pages/coordinator/AssignmentModal'
import CerrarSemanaModal from '@/pages/coordinator/CloseWeekModal'
import AsignarBackofficeModal from '@/pages/coordinator/AssignBackofficeModal'
import AvisoAusentesSemanaAnterior from '@/pages/coordinator/PreviousAbsencesModal'
import CambiosSemanaModal from '@/pages/coordinator/WeekChangesModal'
import { useConfirm } from '@/contexts/ConfirmContext'

// Oct-2026 · Aquí vivía SLOT_COLOR, que pintaba cada casilla según el TIPO de
// recurso (teal oftalmólogo, morado optómetra, naranja otorrino…). Se eliminó:
// ese color competía con el del estado y no dejaba leer de un vistazo lo único
// que importa en la grilla. El tipo ya se sabe por el consultorio, que está en
// la fila. Ahora son tres colores y significan estado, no especialidad:
//   VERDE asignación normal · AZUL reprogramación · ROJO ausente

// Áreas/especialidades disponibles para filtrar consultorios en la grilla
// Devuelve "Primer Nombre + Primer Apellido" para mostrar en celdas estrechas.
// Para nombres muy largos, prioriza primer nombre + primer apellido detectable.
function nombreCorto(nombre) {
  if (!nombre) return ''
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return nombre
  // Asumir [PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido]
  // o [PrimerNombre, PrimerApellido, SegundoApellido]
  return `${partes[0]} ${partes[partes.length === 4 ? 2 : 1]}`
}

const TIPO_A_LABEL = Object.fromEntries(TIPOS_RECURSO.map((t) => [t.value, t.label]))
const rolLabel = (tipo) => TIPO_A_LABEL[tipo] ?? 'Recurso'

const AREAS = [
  { value: 'oftalmologia',         label: '🩺 Oftalmología',        dot: 'bg-teal-400' },
  { value: 'optometria',           label: '👓 Optometría',          dot: 'bg-purple-400' },
  { value: 'anestesiologia',       label: '💉 Anestesiología',      dot: 'bg-blue-400' },
  { value: 'diagnostico',          label: '🔬 Diagnóstico',         dot: 'bg-amber-400' },
  { value: 'asesoria',             label: '👥 Asesoría',            dot: 'bg-pink-400' },
  { value: 'fonoaudiologia',       label: '🗣️ Fonoaudiología',     dot: 'bg-rose-400' },
  { value: 'otorrinolaringologia', label: '👂 Otorrinolaringología', dot: 'bg-orange-400' },
]

export default function ProgramadorPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  // Sep-2026 · Los roles admin (gerencia, supervisor, directivo) NUNCA quedan
  // encerrados en 1 sola sede aunque tengan exactamente 1 sede vinculada por
  // accidente de configuración. Siempre ven el selector — misma regla que en
  // el hook useSedeActiva. Bug reportado: Wendy (gerencia) veía el Programador
  // como si fuera coord de una sola sede porque tenía 1 site en su usuario.
  const esAdminSched = ['gerencia', 'supervisor', 'directivo'].includes(user?.role)
  // sedePropia solo si tiene EXACTAMENTE 1 sede (caso típico coordinador 1 sede).
  // Si tiene 2+ sedes (coordinador multi-sede como Wadys que tiene 5),
  // mostramos el selector para que elija cuál programar.
  const sedePropia = (!esAdminSched && user?.sites?.length === 1) ? user.sites[0] : null
  const tieneVariasSedes = !esAdminSched && (user?.sites?.length ?? 0) > 1
  const primeraSede = user?.sites?.[0]

  const [sedeManual, setSedeManual] = useState('')

  // Sincronizar sedeManual cuando user.sedes cambia (por el refresh automático
  // del AppLayout que trae sedes nuevas tras un login con JWT viejo).
  useEffect(() => {
    if (tieneVariasSedes && (!sedeManual || !user.sites.includes(sedeManual))) {
      setSedeManual(user.sites[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneVariasSedes, primeraSede, user?.sites?.length])
  // Filtro multi-select por especialidad — array vacío = todas
  const [especialidadFilter, setEspecialidadFilter] = useState([])
  const [showFilter, setShowFilter] = useState(false)
  const [showDescargar, setShowDescargar] = useState(false)
  const [descargando, setDescargando] = useState(false)
  // Abre siempre en la semana ACTUAL (lunes de hoy). El coordinador usa este
  // módulo principalmente para revisar el cronograma vigente. Si necesita
  // CREAR una semana futura, usa "Siguiente →" y la regla RN-01 (anticipación
  // mínima de 3 días) se aplica en ese momento al botón "Crear semana".
  const [semanaBase, setSemanaBase] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [modalData, setModalData]   = useState(null)
  const [pickerServicio, setPickerServicio] = useState(null)  // { consultorioId, consultorio, dia, semanaId }
  const [copiarDia, setCopiarDia]   = useState(null)  // { diaOrigen, etiqueta }
  const [showCierre, setShowCierre] = useState(false)
  const [highlightCons, setHighlightCons] = useState(null)
  const [boRecursoOcioso, setBoRecursoOcioso] = useState(null)
  // Buscador de recurso dentro de la semana visible (HU-C-XX): input + panel lateral.
  // asigResaltada guarda el id de la asignación que quedó resaltada tras un click,
  // con timeout de 3.5s (mismo patrón que highlightCons).
  // saltoPendiente: para cross-sede (sup/ger) — cuando el resultado es de otra
  // sede, se guarda aquí y el useEffect ejecuta el scroll al terminar de cargar.
  const [busquedaRecurso, setBusquedaRecurso] = useState('')
  const [panelBusquedaAbierto, setPanelBusquedaAbierto] = useState(false)
  const [asigResaltada, setAsigResaltada] = useState(null)
  const [saltoPendiente, setSaltoPendiente] = useState(null)
  const rowRefs = useRef({})
  const confirm = useConfirm()

  // Llevar al usuario a la fila de un consultorio en la grilla y resaltarla
  // unos segundos. Se usa desde el modal de cierre cuando hace click en un aviso.
  const irAConsultorio = (consId) => {
    setShowCierre(false)
    setTimeout(() => {
      const row = rowRefs.current[consId]
      if (!row) return
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightCons(consId)
      setTimeout(() => setHighlightCons(null), 3500)
    }, 250)
  }

  // Acción contextual para un recurso ocioso: si es auxiliar abrimos el modal
  // de backoffice (HU-C-17); si es médico/optómetra/etc. lo llevamos al primer
  // consultorio de su especialidad para que el coordinador asigne ahí.
  const asignarRecursoOcioso = (recurso) => {
    setShowCierre(false)
    setTimeout(() => {
      if (recurso.type === 'auxiliar' || recurso.type === 'auxiliar_admin') {
        setBoRecursoOcioso(recurso)
        return
      }
      const cons = consultorios.find((c) => c.active && c.specialty === recurso.type)
      if (cons) {
        const row = rowRefs.current[cons.id]
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightCons(cons.id)
        setTimeout(() => setHighlightCons(null), 3500)
        toast(`${recurso.name} tiene horas disponibles — asígnelo en ${cons.name}`, { icon: '👉' })
      } else {
        toast(`No hay consultorios activos de ${recurso.type} en esta sede`, { icon: 'ℹ️' })
      }
    }, 250)
  }

  // Salta a la celda de una asignación específica dentro de la grilla y la
  // resalta 3.5s. Reusa rowRefs (que va por consultorio) y aplica una clase
  // extra al div de la asignación vía state asigResaltada. Se llama desde el
  // panel de búsqueda de recurso, sin cerrarlo — el coord puede saltar entre
  // varias apariciones sin perder la lista.
  //
  // Cross-sede (sup/ger): si el resultado es de otra sede, primero cambiamos
  // la sede activa y guardamos el objetivo en saltoPendiente — el useEffect
  // de abajo ejecuta el scroll cuando la grilla de la nueva sede ya se pintó.
  const ejecutarSalto = (asigId, consId) => {
    const row = rowRefs.current[consId]
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setAsigResaltada(asigId)
    setTimeout(() => setAsigResaltada(null), 3500)
  }
  const saltarACelda = (asigId, consId, targetSedeId) => {
    if (targetSedeId && targetSedeId !== sedeId) {
      setSedeManual(targetSedeId)
      setSaltoPendiente({ asigId, consId })
      return
    }
    ejecutarSalto(asigId, consId)
  }

  // El coordinador trabaja sobre su sede; el supervisor (sin sede propia) la elige.
  const sedeId = sedePropia || sedeManual

  // Sedes para el selector:
  //   - Supervisor/gerencia (sin sedes propias): TODAS las sedes
  //   - Coordinador multi-sede: SOLO sus sedes
  //   - Coordinador con 1 sede: no se muestra selector
  const { data: todasSedes = [] } = useQuery({
    queryKey: ['sedes-programador'],
    queryFn: () => sedeService.list(),
    enabled: !sedePropia,
  })
  const sedesDisponibles = tieneVariasSedes
    ? todasSedes.filter((s) => user.sites.includes(s.id))
    : todasSedes

  const diasFecha = diasDeSemana(semanaBase)
  const fechasISO = diasFecha.map((d) => format(d, 'yyyy-MM-dd'))

  // Festivos del rango (RN-06)
  const { data: festivos = [] } = useQuery({
    queryKey: ['festivos-semana', fechasISO[0], fechasISO[6]],
    queryFn: () => festivoService.list({ desde: fechasISO[0], hasta: fechasISO[6] }),
  })
  // f.fecha viene como "2026-06-08T00:00:00.000Z" del backend (Prisma serializa
  // DATE como ISO con Z UTC). fechasISO[i] es "2026-06-08". Tomamos solo YYYY-MM-DD
  // para que coincidan y no haya desfase por timezone.
  const festivosSet = new Set(festivos.map((f) => String(f.date).slice(0, 10)))

  // Recursos para cálculo de ocupación + ociosos al cerrar.
  // El coord-líder ve SU equipo (en todas sus sedes); supervisor/gerencia ven los de la sede activa.
  const esCoordProg = user?.role === 'coordinador'
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-coord-programador', esCoordProg ? user?.id : sedeId],
    queryFn: () => recursoService.list(
      esCoordProg ? { lead_coordinator_id: user?.id, active: true } : { site_id: sedeId, active: true }
    ),
  })

  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas', sedeId],
    queryFn: () => semanaService.list({ site_id: sedeId }),
  })
  const semanaActual = semanas.find((s) => {
    const ini = new Date(s.start_date)
    const fin = new Date(s.end_date)
    return semanaBase >= ini && semanaBase <= fin
  })

  const { data: consultorios = [], isLoading: loadCons } = useQuery({
    queryKey: ['consultorios', sedeId],
    queryFn: () => sedeService.rooms(sedeId),
    enabled: !!sedeId,
  })

  const { data: asignaciones = [], isLoading: loadAsig } = useQuery({
    queryKey: ['asignaciones', semanaActual?.id, sedeId],
    queryFn: () => asignacionService.list({ week_id: semanaActual?.id, site_id: sedeId }),
    enabled: !!semanaActual,
  })

  // ===== §7 · AUSENCIAS DE LA SEMANA ANTERIOR =====
  // Se consulta siempre que haya semana visible, no solo al copiar: el ticket
  // dice "al seleccionar o traer la semana anterior", y seleccionar una semana
  // ya copiada es igual de válido. El aviso se abre solo después de copiar
  // (que es cuando el coordinador acaba de arrastrar el problema) y queda
  // disponible en un botón para el resto de los casos.
  const { data: ausentesPrev, isLoading: loadAusentesPrev } = useQuery({
    queryKey: ['ausentes-semana-anterior', semanaActual?.id, sedeId],
    queryFn: () => semanaService.ausentesSemanaAnterior(semanaActual.id, { siteId: sedeId || undefined }),
    enabled: !!semanaActual,
    staleTime: 60_000,
  })
  // ===== AUSENCIAS DE ESTA MISMA SEMANA =====
  // El gemelo hacia adentro de la consulta de arriba: aquella avisa de quien
  // falto la semana PASADA y hay que reprogramar; esta dice quien esta ausente
  // AHORA y en que dia, que es lo que tiñe la casilla de rojo.
  const { data: ausenciasSemana } = useQuery({
    queryKey: ['ausencias-de-la-semana', semanaActual?.id, sedeId],
    queryFn: () => semanaService.ausenciasDeLaSemana(semanaActual.id, { siteId: sedeId || undefined }),
    enabled: !!semanaActual,
    staleTime: 60_000,
  })

  const [verAvisoAusentes, setVerAvisoAusentes] = useState(false)
  const [verCambios, setVerCambios] = useState(false)
  // Mapa "ausenciaId" -> ausencia, para que la casilla de reprogramación
  // pueda decir DE QUIÉN son los pacientes que se están atendiendo ahí.
  const ausenciaPorId = useMemo(() => {
    const m = new Map()
    for (const a of ausenciasSemana?.ausencias ?? []) m.set(a.id, a)
    return m
  }, [ausenciasSemana])

  /**
   * ¿Esta asignación cae dentro de la ausencia?
   *
   * Una ausencia parcial no tumba el día entero. Quien falta de 07:00 a 11:00
   * sigue atendiendo por la tarde: ese turno va verde, no rojo. Antes se
   * pintaba todo el día y el coordinador veía como caída una agenda que estaba
   * en pie.
   *
   * Las horas son "HH:mm" de ancho fijo: compararlas como texto equivale a
   * compararlas como minutos.
   */
  const laTumbaLaAusencia = (asig, ausencia) => {
    if (!ausencia?.is_partial) return true
    const { absence_start_time: desde, absence_end_time: hasta } = ausencia
    if (!desde || !hasta) return true
    return !(hasta <= asig.start_time || desde >= asig.end_time)
  }

  // Mapa "recursoId|dia" -> ausencias. Se indexa por DIA y no solo por recurso
  // porque una ausencia de martes a jueves no debe teñir el lunes: aqui el dato
  // ES el dia. Se memoiza porque la grilla se repinta cientos de veces.
  // Oct-2026 · Es una LISTA: puede haber dos permisos el mismo día (08–09 y
  // 09–10:30) y antes el segundo tapaba al primero.
  const ausenciasPorRecursoDia = useMemo(() => {
    const m = new Map()
    for (const a of ausenciasSemana?.ausencias ?? []) {
      for (const dia of a.dias ?? []) {
        const k = a.resource?.id + '|' + dia
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(a)
      }
    }
    return m
  }, [ausenciasSemana])
  // La ausencia de ese día que tumba este turno (o undefined).
  const ausenciaDelTurno = (asig, dia) =>
    (ausenciasPorRecursoDia.get(asig.resource?.id + '|' + dia) ?? []).find((au) => laTumbaLaAusencia(asig, au))

  // Se memoiza sobre `ausentesPrev`, no sobre la lista derivada: `?? []` crea un
  // array nuevo en cada render y eso recalculaba el Set en cada pintada de la
  // grilla, que es lo único de esta pantalla que se pinta cientos de veces.
  const { ausentesPrevLista, ausentesSinProgramar, recursosQueFaltaron } = useMemo(() => {
    const lista = ausentesPrev?.ausentes ?? []
    return {
      ausentesPrevLista: lista,
      ausentesSinProgramar: lista.filter((a) => a.pendiente).length,
      // Para teñir casillas van TODOS los que faltaron, no solo los pendientes.
      // Quien está pendiente no tiene casilla que teñir — justamente por eso el
      // aviso existe. El resaltado sirve para el otro caso: la copia ya le puso
      // turnos y hay que mirar si ahí repone lo que se cayó.
      recursosQueFaltaron: new Set(lista.map((a) => a.resource.id)),
    }
  }, [ausentesPrev])

  // BÚSQUEDA GLOBAL (sup/ger): cuando el rol tiene acceso multi-sede y abre el
  // panel de búsqueda, cargamos TODAS las asignaciones de la semana visible sin
  // filtro de sede. El endpoint `/asignaciones?semana_id=X` sin sede_id ya trae
  // eso — la Semana es global por fechaInicio (schema.prisma:331 @unique) y
  // el include incluye consultorio.sede, así que cada asignación viene con su
  // sede inline y podemos mostrarla en el resultado + saltar entre sedes.
  //
  // Se activa solo con panel abierto para no cargar innecesariamente cuando el
  // sup no está buscando (evitar tráfico de fondo). React Query cachea 5 min
  // por defecto, así que reabrir el panel no vuelve a pegarle al backend.
  const esBusquedaGlobal = user?.role === 'supervisor' || user?.role === 'gerencia'
  const { data: asignacionesGlobales = [], isFetching: cargandoGlobal } = useQuery({
    queryKey: ['asignaciones-globales', semanaActual?.id],
    queryFn: () => asignacionService.list({ week_id: semanaActual?.id }),
    enabled: esBusquedaGlobal && !!semanaActual && panelBusquedaAbierto,
    staleTime: 60_000,
  })

  // Ejecuta el salto una vez que la nueva sede terminó de cargar sus consultorios
  // y asignaciones — sabemos que está listo cuando el rowRef del consultorio
  // objetivo existe Y la asignación aparece en el array de asignaciones locales.
  // Delay corto para dar tiempo al DOM a pintar y evitar scroll antes de tiempo.
  useEffect(() => {
    if (!saltoPendiente) return
    const { asigId, consId } = saltoPendiente
    const rowLista = !!rowRefs.current[consId]
    const asigCargada = asignaciones.some((a) => a.id === asigId)
    if (rowLista && asigCargada) {
      const t = setTimeout(() => {
        ejecutarSalto(asigId, consId)
        setSaltoPendiente(null)
      }, 120)
      return () => clearTimeout(t)
    }
  }, [saltoPendiente, asignaciones, consultorios, sedeId])

  const { mutate: crearSemana } = useMutation({
    mutationFn: () => semanaService.create({ start_date: format(semanaBase, 'yyyy-MM-dd'), site_id: sedeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['semanas'] }); toast.success('Semana creada') },
    onError: (err) => toast.error(err?.message ?? 'No se puede crear la semana'),
  })

  const { mutate: copiarSemana } = useMutation({
    mutationFn: () => {
      // parseFechaLocal: las fechas vienen como YYYY-MM-DD; con parseISO se
      // interpretarían como UTC y en Colombia (UTC-5) podrían quedar en el día
      // anterior, devolviendo la semana incorrecta.
      const anterior = semanas.find((s) => parseFechaLocal(s.end_date) < semanaBase)
      if (!anterior) throw new Error('No hay semana anterior para copiar')
      // FIX Bug B (jul-2026): antes fallaba en producción con "Debes especificar
      // la(s) sede(s)..." cuando `sedeId` llegaba vacío al backend. Causa raíz:
      // race entre montaje del componente y el useEffect que setea sedeManual.
      // Auto-recover: si sedeId está vacío pero user.sedes tiene contenido,
      // usamos user.sedes[0] como fallback antes de rechazar. Solo abortamos si
      // realmente no hay ninguna sede que usar.
      const sedeFallback = sedeId || sedePropia || (esAdminSched ? null : user?.sites?.[0]) || null
      if (!sedeFallback) {
        throw new Error('No se pudo determinar la sede. Recargue la página y vuelva a intentar.')
      }
      // SCOPE POR SEDE (fix incidente jun-2026): solo afectamos la sede activa.
      return semanaService.copiar(anterior.id, format(semanaBase, 'yyyy-MM-dd'), { siteId: sedeFallback })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['semanas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      const copiadas = res?.copied ?? 0
      const omitidas = res?.skipped ?? 0
      const errores = res?.errors ?? []
      const reemplazo = res?.replaced > 0
        ? ` (reemplazaron ${res.replaced} anteriores en su sede)`
        : ''

      // Copiar semana ahora valida igual que copiar día: lo que choca con el
      // horario que el profesional ya tiene se omite y se avisa, en lugar de
      // crear el solape en silencio.
      if (omitidas > 0 && copiadas === 0) {
        toast.error(
          `No se pudo copiar nada (${omitidas} ${omitidas === 1 ? 'asignación' : 'asignaciones'}): ${errores[0]?.message ?? 'conflicto'}`,
          { duration: 9000 },
        )
      } else if (omitidas > 0) {
        toast(
          `${copiadas} copiadas${reemplazo}, ${omitidas} omitidas por conflicto · ${errores[0]?.message ?? ''}`,
          { duration: 9000, icon: '⚠️' },
        )
      } else {
        toast.success(`${copiadas} asignaciones copiadas${reemplazo}`)
      }

      // §7 · Acabamos de arrastrar la semana anterior tal como se programó, no
      // como ocurrió. Si alguien faltó, este es el momento de decirlo: después
      // nadie vuelve a mirar. Se refresca primero para que el aviso no muestre
      // como "sin programar" a quien la copia acaba de programar.
      qc.invalidateQueries({ queryKey: ['ausentes-semana-anterior'] })
      setVerAvisoAusentes(true)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al copiar'),
  })

  // Llama copiarSemana pidiendo DOBLE confirmación cuando la semana actual ya
  // tiene asignaciones. Esto evita borrados accidentales — el conteo y los
  // mensajes son del ALCANCE DE SU SEDE (no global) — la solicitud al backend
  // también va con sede_id, así otras sedes nunca se ven afectadas.
  // Admin: su sede vinculada no dice nada de la sede que está programando —
  // el nombre sale del catálogo completo (antes decía "tu sede").
  const sedeActivaNombre = todasSedes.find((s) => s.id === sedeId)?.name
    ?? user?.sites_info?.find((s) => s.id === sedeId)?.name ?? 'su sede'
  const onClickCopiarSemana = async () => {
    // Validación temprana: si aún no hay sede seleccionada (dropdown vacío en
    // supervisor/gerencia, o hidratación pendiente del auth para coord), avisar
    // ANTES de mostrar el confirm — así el mensaje del backend "Debes especificar
    // la(s) sede(s)..." nunca aparece al usuario final.
    const sedeFallback = sedeId || sedePropia || (esAdminSched ? null : user?.sites?.[0]) || null
    if (!sedeFallback) {
      toast.error('Seleccione una sede antes de copiar (arriba en el selector).', { duration: 4000 })
      return
    }
    if (asignaciones.length > 0) {
      const paso1 = await confirm({
        title: '⚠️ Atención: esta semana ya tiene programación',
        message: `${sedeActivaNombre} tiene ${asignaciones.length} asignaciones esta semana. Al copiar la semana anterior, esas ${asignaciones.length} serán REEMPLAZADAS por las de la semana anterior. SOLO afecta a su sede — las demás sedes NO se tocan.`,
        confirmLabel: 'Entiendo, continuar',
        cancelLabel: 'Cancelar',
        variant: 'warning',
      })
      if (!paso1) return
      const paso2 = await confirm({
        title: '🛑 ÚLTIMA CONFIRMACIÓN',
        message: `Va a borrar ${asignaciones.length} asignaciones de ${sedeActivaNombre} (solo su sede). Otras sedes NO se tocan. Esta acción es recuperable de backup pero requiere intervención técnica. ¿100% seguro?`,
        confirmLabel: `Sí, reemplazar ${asignaciones.length} asignaciones de mi sede`,
        cancelLabel: 'No, cancelar',
        variant: 'danger',
      })
      if (!paso2) return
    }
    copiarSemana()
  }

  const { mutate: eliminarAsig } = useMutation({
    mutationFn: (id) => asignacionService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asignaciones'] }); toast.success('Asignación eliminada') },
  })

  // HU-C-15: toggle activar/desactivar consultorio
  const { mutate: toggleConsultorio } = useMutation({
    mutationFn: ({ id, active: activo }) => consultorioService.update(id, { active: activo }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['consultorios'] })
      toast.success(vars.active ? 'Consultorio activado' : 'Consultorio desactivado')
    },
  })

  // El reemplazo se pinta SIEMPRE despues de la casilla que cubre: se monta
  // encima con margen negativo, asi que si saliera antes se montaria sobre la
  // casilla equivocada. El backend ordena por hora y a igual hora el orden
  // queda al azar, de ahi este desempate explicito.
  const asigDeConsultorioDia = (consultorioId, dia) =>
    asignaciones
      .filter((a) => a.room_id === consultorioId && a.weekday === dia)
      .slice()
      .sort((x, y) =>
        (x.start_time ?? '').localeCompare(y.start_time ?? '') ||
        (x.covered_absence_id ? 1 : 0) - (y.covered_absence_id ? 1 : 0))

  // ===== ¿VENGO DE UN CASO DE REPROGRAMACIÓN? =====
  // La líder llega aquí desde "Mover la agenda" para buscar dónde hay hueco.
  // Sin este aviso, a los dos clics ya no se acuerda de a qué vino ni tiene
  // cómo volver a asignar el reprogramador, que es donde termina el proceso.
  const [paramsCaso] = useSearchParams()
  const casoId = paramsCaso.get('caso')
  // 'mismo' = el ausente recupera su agenda otro día · 'otro' = alguien más se
  // hace cargo. Decide si el profesional viene puesto o se deja elegir.
  const quienAtiende = paramsCaso.get('quien') ?? 'mismo'
  const navegar = useNavigate()
  const { data: caso } = useQuery({
    queryKey: ['contexto-reemplazo', casoId],
    queryFn: () => ausenciaService.contextoReemplazo(casoId),
    enabled: !!casoId,
  })

  // Saltar a la semana de la ausencia. Una vez, al llegar: después la líder
  // navega libremente entre semanas buscando hueco y volver a arrastrarla a
  // la semana del caso en cada render sería pelearle a la pantalla.
  const saltoHecho = useRef(false)
  useEffect(() => {
    if (saltoHecho.current || !caso?.semana?.desde) return
    saltoHecho.current = true
    setSemanaBase(startOfWeek(parseFechaLocal(caso.semana.desde), { weekStartsOn: 1 }))
  }, [caso])

  // TERMINÓ DE REPARTIR → DE VUELTA AL CASO, SOLO.
  // "Ya distribuí a los pacientes, ¿por qué me sigue ahí? Cuando ya termine me
  // debería mandar a la principal inmediatamente."
  // El Programador es la herramienta, no el destino: una vez que todos los
  // pacientes tienen dónde ir, lo que queda es cerrar el caso asignando quién
  // los llama, y eso vive en la pantalla del caso.
  const vueltaHecha = useRef(false)
  useEffect(() => {
    if (vueltaHecha.current || !caso?.cuenta?.resuelto || !caso?.ausencia?.id) return
    vueltaHecha.current = true
    toast.success(`Listo: los ${caso.cuenta.pacientes_impactados} pacientes quedaron reprogramados.`)
    navegar(`/app/reemplazo/${caso.ausencia.id}`)
  }, [caso, navegar])

  const isCerrada = semanaActual?.status === 'cerrada'
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'gerencia'
  // Modo temporal de programación libre (lo decide el backend y viaja en la
  // sesión). Mientras esté activo, una semana cerrada no bloquea la edición:
  // sirve para cuadres retroactivos. Los solapes y topes se siguen validando en
  // el servidor, así que abrir el botón no abre la puerta a datos inválidos.
  const libre = user?.free_scheduling === true
  const canEdit = !isCerrada || isSupervisor || libre
  // canCopiar = puede USAR esta semana como ORIGEN de copia hacia otra semana,
  // aunque esté cerrada. NO modifica la cerrada — solo lee. El destino siempre
  // debe ser otra semana (el modal CopiarDiaModal lo fuerza si origen cerrada).
  const canCopiar = canEdit || isCerrada

  // RN-01 relajada (jul-2026): antes exigía 3 días de anticipación; ahora los
  // coords pueden programar la semana en curso o cualquier futura. Solo se
  // bloquean semanas ya vencidas. Debe quedar sincronizada con el backend
  // (constante ANTICIPACION_MINIMA_DIAS en semanaController.js).
  // Con programación libre se permiten semanas ya vencidas: es exactamente lo
  // que hace falta para cargar el mes pasado de forma retroactiva.
  const diasAlInicio = differenceInDays(semanaBase, new Date())
  const cumpleAnticipacion = diasAlInicio >= 0 || libre

  // Ocupación proyectada de la semana (en horas, no en asignaciones).
  // - horas_disponibles = consultorios_activos × 6 días × 11h (operación 7am–7pm con almuerzo cubierto)
  // - horas_asignadas   = suma de (hora_fin − hora_inicio) sobre todas las asignaciones
  // El dashboard del directivo y los informes ya usan esta misma base; con esto
  // el coordinador ve el mismo número que la dirección, sin sobreestimar slots cortos.
  const HORAS_DIA_CONSULTORIO = 11
  const consultoriosActivos = consultorios.filter((c) => c.active).length

  // 3664 · Desde el aviso de ausentes: abre la asignación ya llena, como
  // reposición de esa ausencia (queda azul y cuenta en el caso). El día es el
  // que el profesional dijo que repondría si cae en esta semana; si no, el
  // mismo día de la semana que faltó. Las validaciones de siempre (solape,
  // tope de horas, tope de pacientes) bloquean igual que en cualquier casilla.
  const programarReposicion = (a, t) => {
    const cons = consultorios.find((c) => c.id === t.room_id)
    if (!cons || !semanaActual) {
      toast.error(`El consultorio ${t.room_name ?? ''} no está en la sede que está viendo.`)
      return
    }
    const propuesta = a.fecha_reposicion_propuesta ? String(a.fecha_reposicion_propuesta).slice(0, 10) : null
    const desde = String(ausentesPrev?.semana_destino?.desde ?? '').slice(0, 10)
    const hasta = String(ausentesPrev?.semana_destino?.hasta ?? '').slice(0, 10)
    const diaPropuesto = propuesta && propuesta >= desde && propuesta <= hasta
      ? DIAS[(new Date(propuesta + 'T00:00:00Z').getUTCDay() + 6) % 7]
      : t.weekday
    setVerAvisoAusentes(false)
    setModalData({
      roomId: cons.id, room: cons, day: diaPropuesto, weekId: semanaActual.id,
      recursoPrecargado: a.resource.id,
      recursoPrecargadoNombre: a.resource.name,
      cubreAusenciaId: a.absence_id,
      franjaCaida: { start_time: t.start_time, end_time: t.end_time, patient_capacity: t.patient_capacity },
    })
  }
  const horasAsignadas = asignaciones.reduce((acc, a) => {
    if (!a.resource_id || !a.start_time || !a.end_time) return acc
    const [hi_h, hi_m] = a.start_time.split(':').map(Number)
    const [hf_h, hf_m] = a.end_time.split(':').map(Number)
    return acc + Math.max(0, ((hf_h * 60 + hf_m) - (hi_h * 60 + hi_m)) / 60)
  }, 0)
  // PROYECTOS-3255 #1.1: dias festivos laborables (lu-sa) NO cuentan en el
  // denominador. fechasISO[0..5] = lu-sa; fechasISO[6] = domingo (fuera de base).
  // Nota: el frontend usa 11h/dia uniforme, mientras el backend modela 12h LV +
  // 4h sabado — divergencia historica del cálculo local del programador que
  // hace que el % de ocupacion aquí y en los informes difiera cuando cae festivo
  // en sábado. Alineado dentro del propio modelo del frontend.
  const diasFestivosLaborables = fechasISO.slice(0, 6).filter((iso) => festivosSet.has(iso)).length
  const diasHabiles = Math.max(0, 6 - diasFestivosLaborables)
  const horasDisponibles = consultoriosActivos * diasHabiles * HORAS_DIA_CONSULTORIO
  const ocupacion = horasDisponibles > 0
    ? Math.round((horasAsignadas / horasDisponibles) * 100)
    : 0

  // Búsqueda de recurso en la semana visible. Match tolerante a acentos y
  // mayúsculas contra a.recurso.nombre, a.auxiliar.nombre y a.auxiliar2.nombre —
  // una misma persona puede aparecer en 3 roles distintos. Solo asignaciones
  // activas (excluye canceladas y sin_cobertura).
  //
  // Sup/gerencia buscan en TODAS las sedes (fuente = asignacionesGlobales);
  // coord ve solo su sede activa (fuente = asignaciones locales). En modo
  // global cada item lleva su sede para poder mostrarla y saltar entre sedes.
  const resultadosBusqueda = useMemo(() => {
    const q = normalizarTexto(busquedaRecurso)
    if (q.length < 2) return []
    const fuente = esBusquedaGlobal ? asignacionesGlobales : asignaciones
    const items = []
    for (const a of fuente) {
      if (a.status && a.status !== 'activa') continue
      const candidatos = [
        a.resource && { obj: a.resource, role: rolLabel(a.resource.type) || 'Principal' },
        a.assistant && { obj: a.assistant, role: 'Auxiliar' },
        a.assistant2 && { obj: a.assistant2, role: 'Auxiliar 2' },
      ].filter(Boolean)
      for (const c of candidatos) {
        if (normalizarTexto(c.obj.name).includes(q)) {
          items.push({
            asigId: a.id,
            roomId: a.room_id,
            consultorioNombre: a.room?.name ?? '—',
            siteId: a.room?.site_id ?? a.room?.site?.id ?? null,
            sedeNombre: a.room?.site?.name ?? null,
            day: a.weekday,
            diaLabel: DIAS_LABEL[DIAS.indexOf(a.weekday)] ?? a.weekday,
            startTime: a.start_time,
            endTime: a.end_time,
            name: c.obj.name,
            rolLabel: c.role,
          })
        }
      }
    }
    return items
  }, [busquedaRecurso, asignaciones, asignacionesGlobales, esBusquedaGlobal])

  // Agrupa las apariciones por nombre exacto para mostrar "N× esta semana"
  // por persona. Ordena dentro de cada persona por orden natural de días
  // (lunes → domingo) y luego por hora de inicio.
  const resultadosAgrupados = useMemo(() => {
    const porNombre = new Map()
    for (const r of resultadosBusqueda) {
      if (!porNombre.has(r.name)) porNombre.set(r.name, [])
      porNombre.get(r.name).push(r)
    }
    return [...porNombre.entries()]
      .map(([nombre, items]) => ({
        name: nombre,
        apariciones: items.sort((a, b) => {
          const dA = DIAS.indexOf(a.day); const dB = DIAS.indexOf(b.day)
          if (dA !== dB) return dA - dB
          return String(a.startTime).localeCompare(String(b.startTime))
        }),
      }))
      .sort((a, b) => b.apariciones.length - a.apariciones.length)
  }, [resultadosBusqueda])

  return (
    <div className="p-3 sm:p-4">
      {caso?.ausencia && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-amber-900 min-w-0">
            🔀 Está moviendo la agenda de <strong>{caso.ausencia.resource?.name}</strong>
            {caso.ausencia.fechas?.length ? (
              <> · ausente el <strong>{caso.ausencia.fechas
                .map((f) => format(parseFechaLocal(f), "EEEE d 'de' MMMM", { locale: es }))
                .join(' · ')}</strong></>
            ) : caso.ausencia.dias?.length ? <> · ausente el <strong>{caso.ausencia.dias.join(', ')}</strong></> : null}
            {pacientesDelCaso(caso.ausencia) ? <> · <strong>{pacientesDelCaso(caso.ausencia)} pacientes</strong> por reprogramar</> : null}
            {caso.cuenta && caso.cuenta.pacientes_impactados > 0 && (
              <div className="mt-1">
                {caso.cuenta.resuelto ? (
                  <span className="text-emerald-800 font-semibold">
                    ✅ Los {caso.cuenta.pacientes_impactados} pacientes ya tienen médico o día nuevo. Vuelve al caso para repartirlo.
                  </span>
                ) : (
                  <span className="text-amber-900">
                    <strong>{caso.cuenta.pacientes_cubiertos}</strong> de <strong>{caso.cuenta.pacientes_impactados}</strong> pacientes reprogramados ·{" "}
                    <strong className="text-red-700">faltan {caso.cuenta.pacientes_pendientes}</strong>
                  </span>
                )}
              </div>
            )}
            {caso.franjas?.length > 0 && (
              <div className="mt-1 text-amber-800">
                {caso.franjas.length === 1 ? 'Jornada afectada' : 'Jornadas afectadas'}:{' '}
                {caso.franjas.map((f, i) => (
                  <span key={f.assignment_id}>
                    {i > 0 && ' · '}
                    <strong>{f.site?.name}</strong> / {f.room?.name} {f.start_time}–{f.end_time}
                    {f.patient_capacity ? ' (' + f.patient_capacity + ' pac.)' : ''}
                    {f.reemplazo ? ' ✓ cubierta' : ''}
                  </span>
                ))}
              </div>
            )}
            {/* Para "otro profesional" Hector pidió quitar la indicación. */}
            {quienAtiende === 'mismo' && (
              <div className="text-amber-700 mt-0.5">
                Va precargado al asignar. Cambie de sede arriba para ver dónde hay espacio.
              </div>
            )}
          </div>
          <button
            className="btn text-xs flex-shrink-0"
            onClick={async () => {
              // No se bloquea la salida —puede hacer falta irse y volver— pero
              // irse con gente sin reubicar no puede pasar en silencio: así es
              // como un caso queda a medias y nadie se entera.
              if (caso.cuenta && !caso.cuenta.resuelto && caso.cuenta.pacientes_pendientes > 0) {
                const salir = await confirm({
                  title: `Quedan ${caso.cuenta.pacientes_pendientes} pacientes sin reprogramar`,
                  message: 'Todavía no tienen médico ni día nuevo. Puede volver al caso y seguir después, pero el caso sigue abierto.',
                  confirmLabel: 'Continuar Reprogramación',
                  cancelLabel: 'Permanecer Aquí',
                })
                if (!salir) return
              }
              navegar(`/app/reemplazo/${caso.ausencia.id}`)
            }}
          >
            ← Volver al caso
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Programador semanal</h1>
          <p className="text-xs text-gray-500">
            {semanaLabel(semanaBase)} · Ocupación: <strong className={
              ocupacion >= 80 ? 'text-green-700' : ocupacion >= 60 ? 'text-amber-700' : 'text-red-600'
            }>{ocupacion}%</strong>
            {consultoriosActivos > 0 && (
              <span className="text-gray-400">
                {' '}({Math.round(horasAsignadas * 10) / 10}h / {horasDisponibles}h · {consultoriosActivos} consultorio{consultoriosActivos === 1 ? '' : 's'})
              </span>
            )}
          </p>
          {!sedePropia && (
            <div className="mt-2">
              {tieneVariasSedes && (
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  📍 Sede a programar ({sedesDisponibles.length} disponibles):
                </label>
              )}
              <select
                className="input w-full sm:max-w-[320px]"
                value={sedeManual}
                onChange={(e) => setSedeManual(e.target.value)}
              >
                {!tieneVariasSedes && <option value="">Seleccione una sede…</option>}
                {sedesDisponibles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!semanaActual && (
            <button
              className="btn-primary"
              onClick={() => crearSemana()}
              disabled={!cumpleAnticipacion}
              title={!cumpleAnticipacion ? 'No se pueden crear semanas ya vencidas' : ''}
            >
              + Crear semana
            </button>
          )}
          {/* 22-oct · Con programación libre el servidor deja copiar hacia una
              semana cerrada (weekController.copiar), pero el botón se escondía
              igual: Hector no podía copiar la semana anterior. */}
          {semanaActual && (!isCerrada || libre) && (
            <button
              className="btn"
              onClick={() => onClickCopiarSemana()}
              title={asignaciones.length > 0
                ? `Reemplaza las ${asignaciones.length} asignaciones actuales con las de la semana anterior. Le pedirá confirmación.`
                : 'Copia las asignaciones de la semana anterior a esta'}
            >
              📋 Copiar semana anterior
            </button>
          )}

          {/* §7 · Queda a mano para cuando el coordinador entra a una semana ya
              copiada: el aviso automático solo salta al momento de copiar. */}
          {ausentesPrevLista.length > 0 && (
            <button
              className={ausentesSinProgramar > 0 ? 'btn-warning' : 'btn'}
              onClick={() => setVerAvisoAusentes(true)}
              title="Quién faltó la semana anterior y qué hay que recuperar en esta programación"
            >
              🔶 Faltaron la semana pasada ({ausentesPrevLista.length})
              {ausentesSinProgramar > 0 && ` · ${ausentesSinProgramar} sin programar`}
            </button>
          )}
          {semanaActual && (
            <button className="btn" onClick={() => setVerCambios(true)}>🕘 Cambios</button>
          )}
          {semanaActual && !isCerrada && (
            <button className="btn" style={{ borderColor: '#d1fae5', color: '#065f46' }} onClick={() => {
              if (!sedeId) {
                toast.error('Seleccione una sede antes de cerrar (arriba en el selector).', { duration: 4000 })
                return
              }
              setShowCierre(true)
            }}>
              🔒 Cerrar semana
            </button>
          )}
          {isCerrada && (
            <Badge variant="gray">
              Semana cerrada{isSupervisor ? ' — puede editar' : libre ? ' — edición habilitada temporalmente' : ''}
            </Badge>
          )}
          {libre && (
            <span title="Modo temporal: puede programar semanas vencidas y sedes ya cerradas. Los solapes y topes de horas se siguen validando.">
              <Badge variant="amber">Programación libre activa</Badge>
            </span>
          )}
        </div>
      </div>

      {/* Aviso solo si la semana visible ya está VENCIDA (fue en el pasado).
          Antes se bloqueaban las semanas con < 3 días de anticipación (RN-01);
          se relajó a permitir la actual o cualquier futura. */}
      {!semanaActual && !cumpleAnticipacion && sedeId && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="flex-1">
            ⚠️ Esta semana ya está vencida — no se puede crear una semana en el pasado.
          </span>
          <button
            className="btn btn-warning sm:ml-auto"
            onClick={() => {
              let c = semanaBase
              while (differenceInDays(c, new Date()) < 3) c = addWeeks(c, 1)
              setSemanaBase(c)
            }}
          >
            Ir a la próxima semana válida →
          </button>
        </div>
      )}

      {/* Week nav */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" onClick={() => setSemanaBase((d) => subWeeks(d, 1))}>← Anterior</button>
          {/* Buscador de recurso dentro de la semana visible.
              Abre un panel lateral con la lista de apariciones — desde ahí el
              coord salta a cada celda con highlight. Se marca activo (fondo
              azul) si hay una búsqueda vigente para que no la olvide. */}
          <button
            className={`btn ${busquedaRecurso.trim() ? 'border-brand-400 text-brand-700 bg-blue-50' : ''}`}
            onClick={() => setPanelBusquedaAbierto(true)}
            title="Buscar dónde está asignado un recurso en esta semana"
          >
            🔎 {busquedaRecurso.trim() && resultadosBusqueda.length > 0
              ? `${resultadosBusqueda.length} resultado${resultadosBusqueda.length === 1 ? '' : 's'}`
              : 'Buscar recurso'}
          </button>
          {/* Filtro multi-select por área/especialidad */}
          <div className="relative">
            <button
              className={`btn ${especialidadFilter.length > 0 ? 'border-brand-400 text-brand-700 bg-blue-50' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              title="Filtrar consultorios por área"
            >
              🔍 {especialidadFilter.length === 0 ? 'Filtrar área' : `${especialidadFilter.length} ${especialidadFilter.length === 1 ? 'área' : 'áreas'}`}
            </button>
            {showFilter && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilter(false)} />
                <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-lg border border-gray-200 shadow-lg z-40 p-2">
                  <div className="text-xs text-gray-500 px-2 pt-1 pb-2 flex items-center justify-between">
                    <span>Filtrar por área</span>
                    {especialidadFilter.length > 0 && (
                      <button
                        className="text-brand-600 hover:underline text-xs"
                        onClick={() => setEspecialidadFilter([])}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  {AREAS.map((a) => {
                    const selected = especialidadFilter.includes(a.value)
                    return (
                      <label
                        key={a.value}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded text-brand-600 focus:ring-brand-400"
                          checked={selected}
                          onChange={() => {
                            setEspecialidadFilter((prev) =>
                              prev.includes(a.value)
                                ? prev.filter((v) => v !== a.value)
                                : [...prev, a.value]
                            )
                          }}
                        />
                        <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                        <span className="flex-1 text-gray-700">{a.label}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          {/* Descarga de la semana en PDF/Excel — visible cuando hay semana + sede */}
          {semanaActual && sedeId && (
            <div className="relative">
              <button
                className="btn"
                onClick={() => setShowDescargar((v) => !v)}
                disabled={descargando}
                title="Descargar horario semanal en PDF o Excel"
              >
                {descargando ? '⏳ Generando…' : '📥 Descargar semana'}
              </button>
              {showDescargar && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowDescargar(false)} />
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-40 p-1">
                    {[
                      { fmt: 'pdf',  label: '📄 PDF (para imprimir)', ext: 'pdf'  },
                      { fmt: 'xlsx', label: '📊 Excel (editable)',     ext: 'xlsx' },
                    ].map((opt) => (
                      <button
                        key={opt.fmt}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded"
                        onClick={async () => {
                          setShowDescargar(false)
                          setDescargando(true)
                          const nombreSede = sedesDisponibles.find((s) => s.id === sedeId)?.name ?? 'sede'
                          try {
                            await asignacionService.descargarSemana({ semanaId: semanaActual.id, sedeId, formato: opt.fmt, nombreSede })
                            toast.success(`Horario descargado (${opt.ext.toUpperCase()})`)
                          } catch (err) {
                            toast.error('No se pudo generar la descarga')
                          } finally {
                            setDescargando(false)
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="hidden sm:flex gap-1">
          {diasFecha.map((d, i) => (
            <div key={i} className="text-center">
              <div className="text-xs text-gray-400">{DIAS_LABEL[i]}</div>
              <div className={`text-xs font-medium ${format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-brand-600' : 'text-gray-600'}`}>
                {format(d, 'd')}
              </div>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setSemanaBase((d) => addWeeks(d, 1))}>Siguiente →</button>
      </div>

      {/* Grid */}
      {!sedeId ? (
        <EmptyState icon="🏢" title="Seleccione una sede" description="Elija una sede arriba para ver y programar sus consultorios." />
      ) : loadCons || loadAsig ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !semanaActual ? (
        <EmptyState icon="📅" title="No hay semana creada para este período" description="Cree la semana para comenzar a programar recursos." />
      ) : (
        // Sep-2026 · sticky vertical: sin max-h el div no tiene scroll propio y
        // el sticky top-0 queda "encerrado" arriba del div sin efecto visible.
        // Con max-h el div genera scroll interno y el sticky funciona correctamente.
        // Altura ~ viewport menos el espacio del header/filtros/topbar.
        <div className="overflow-auto -mx-3 sm:mx-0 max-h-[calc(100vh-260px)]">
          <table className="w-full min-w-[800px] border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              {DIAS.map((_, i) => <col key={i} style={{ width: `${(100 - 14) / 7}%` }} />)}
            </colgroup>
            <thead>
              {/* Sticky header: la fila de fechas queda pegada arriba al hacer
                  scroll. La primera celda ("Consultorio") tambien es sticky a
                  la izquierda, con z-index mayor porque es la esquina que se
                  superpone con la columna sticky de los consultorios. */}
              <tr className="bg-gray-50">
                <th className="p-2 text-left text-xs font-medium text-gray-500 border-b border-gray-100 sticky top-0 left-0 z-20 bg-gray-50">Consultorio</th>
                {DIAS_LABEL.map((d, i) => {
                  const esHoy = format(diasFecha[i], 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  const esFestivo = festivosSet.has(fechasISO[i])
                  const diaKey = DIAS[i]
                  // Solo muestra el botón "Copiar día" si ese día tiene asignaciones
                  const tieneAsigs = asignaciones.some((a) => a.weekday === diaKey)
                  // bg explicito en cada th porque sticky no hereda el bg del tr
                  const bgClase = esFestivo ? 'bg-amber-50/95' : 'bg-gray-50'
                  return (
                    <th key={i} className={`p-2 text-center text-xs font-medium border-b border-gray-100 sticky top-0 z-10 ${bgClase} ${esHoy ? 'text-brand-600' : esFestivo ? 'text-amber-700' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{d} {format(diasFecha[i], 'd')}</span>
                        {tieneAsigs && canCopiar && (
                          <button
                            className="text-gray-400 hover:text-brand-600 text-xs"
                            onClick={() => setCopiarDia({ type: 'dia', dayFrom: diaKey, etiqueta: `${d} ${format(diasFecha[i], 'd')}` })}
                            title={isCerrada
                              ? 'Semana cerrada: copie este día a otra semana'
                              : 'Copiar este día a otro(s) día(s)'}
                          >📋</button>
                        )}
                      </div>
                      {esFestivo && <div className="text-xs text-amber-600 font-normal mt-0.5">festivo</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {consultorios
                .filter((c) => c.active)
                .filter((c) => especialidadFilter.length === 0 || especialidadFilter.includes(c.specialty))
                .slice()
                .sort((a, b) => {
                  // ÁREA ASESORES primero, luego orden natural numérico (2 < 19A < 20 < 20A).
                  const ae = a.specialty === 'asesoria' ? 0 : 1
                  const be = b.specialty === 'asesoria' ? 0 : 1
                  if (ae !== be) return ae - be
                  return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
                })
                .map((cons) => (
                <tr
                  key={cons.id}
                  ref={(el) => { if (el) rowRefs.current[cons.id] = el; else delete rowRefs.current[cons.id] }}
                  className={`border-b border-gray-50 transition-colors ${highlightCons === cons.id ? 'bg-amber-100/70 ring-2 ring-amber-300' : ''}`}
                >
                  {/* Sep-2026 · Sticky en 2 ejes para consultorios con MUCHAS
                      asignaciones apiladas (row muy alta). left-0 pega la celda
                      del nombre al scrollear horizontal; top-[44px] la pega
                      DEBAJO del thead sticky (~44px) al scrollear vertical
                      dentro de una row alta — asi no se pierde de vista qué
                      consultorio estas mirando cuando revisas la parte inferior
                      de esa row. */}
                  <td className="p-2 bg-gray-50 border-r border-gray-100 align-top sticky left-0 top-[44px] z-10">
                    <div className="flex items-center justify-between gap-1">
                      <div>
                        <div className="font-medium text-gray-700 text-xs">{cons.name}</div>
                        <div className="text-gray-400 text-xs capitalize">{cons.specialty}</div>
                      </div>
                      {canEdit && (
                        <button
                          className="text-xs text-gray-300 hover:text-red-500"
                          onClick={() => toggleConsultorio({ id: cons.id, active: false })}
                          title="Desactivar consultorio temporalmente"
                        >×</button>
                      )}
                    </div>
                  </td>
                  {DIAS.map((dia) => {
                    const asigs = asigDeConsultorioDia(cons.id, dia)
                    // MISMO HORARIO = UNA SOLA CASILLA.
                    // Cuando quien cubre entra exactamente en la franja del que
                    // faltó, no son dos cosas: es la misma franja atendida por
                    // otro. Se pintan en un único recuadro partido por dentro.
                    // Si la hora NO coincide (la agenda se movió a la tarde, o a
                    // otro día) sí son dos turnos distintos y van separados.
                    const cubreA = new Map()
                    for (const r of asigs) if (r.covered_absence_id) cubreA.set(r.covered_absence_id, r)
                    const fusionados = new Set()
                    const parejaDe = new Map()
                    for (const x of asigs) {
                      const au = ausenciaDelTurno(x, dia)
                      const c = au && cubreA.get(au.id)
                      if (c && c.start_time === x.start_time && c.end_time === x.end_time) {
                        parejaDe.set(x.id, c)
                        fusionados.add(c.id)
                      }
                    }
                    return (
                      <td key={dia} className="p-1 align-top border-r border-gray-50 min-h-12">
                        {asigs.map((a, idx) => {
                          // Parcial: solo las franjas que pisa su horario.
                          const ausente = ausenciaDelTurno(a, dia)
                          const esReemplazo = !!a.covered_absence_id
                          // Ya se pinta dentro del recuadro de su pareja.
                          if (fusionados.has(a.id)) return null
                          const cubridor = parejaDe.get(a.id)

                          // UNA SOLA CASILLA, del mismo alto que todas: arriba
                          // quien faltó (rojo, tachado), abajo quien lo cubre
                          // (azul). El detalle completo, al pasar el mouse.
                          if (cubridor) {
                            return (
                              <div
                                key={a.id}
                                data-asig-id={a.id}
                                className="slot-base slot-repro group !p-0 flex flex-col"
                              >
                                <div
                                  className="bg-red-50 px-1.5 pt-1 pb-0.5 border-b border-red-300 flex-1 min-h-0"
                                  onClick={() => canEdit && setModalData({ roomId: cons.id, room: cons, day: dia, weekId: semanaActual.id, assignment: a })}
                                >
                                  <div className="text-xs leading-tight truncate line-through text-gray-900 font-medium">{nombreCorto(a.resource?.name)}</div>
                                  <div className="text-xs leading-tight text-gray-700">{a.start_time}–{a.end_time}</div>
                                </div>
                                <div
                                  className="bg-blue-50 px-1.5 pt-0.5 pb-1 flex-1 min-h-0"
                                  onClick={() => canEdit && setModalData({ roomId: cons.id, room: cons, day: dia, weekId: semanaActual.id, assignment: cubridor })}
                                >
                                  <div className="text-xs leading-tight truncate text-gray-900 font-medium">{nombreCorto(cubridor.resource?.name)}</div>
                                  <div className="text-xs leading-tight text-gray-600">{cubridor.patient_capacity} pac.</div>
                                </div>
                                <div className="hidden group-hover:block px-1.5 pb-1 pt-1 border-t border-black/10 text-[10px] leading-snug bg-white">
                                  <div className="text-gray-600">{cons.name} · {cons.specialty}</div>
                                  <div className="text-red-800 font-medium mt-0.5">
                                    Ausente: {a.resource?.name} · {ausente.motivo_catalogo ?? ausente.type}
                                    {ausente.status === 'pendiente' ? ' (sin confirmar)' : ''}
                                  </div>
                                  <div className="text-blue-800 font-medium">
                                    Lo cubre: {cubridor.resource?.name} · {cubridor.start_time}–{cubridor.end_time}
                                  </div>
                                  {cubridor.assistant && <div className="text-gray-600">Aux: {cubridor.assistant.name}</div>}
                                </div>
                              </div>
                            )
                          }

                          // TRES COLORES Y NINGUNO MÁS. El color por tipo de
                          // recurso (teal/azul/morado/naranja/rosa) competía con
                          // el de estado y no dejaba leer lo único que importa de
                          // un vistazo; el tipo ya se sabe por el consultorio, que
                          // está en la fila. Rojo manda sobre azul: si la persona
                          // faltó, da igual de dónde salió ese turno.
                          // 3739 · Naranja = turno en contingencia (después del rojo).
                          const claseSlot = ausente
                            ? 'slot-ausente'
                            : a.contingency
                              ? 'slot-contingencia'
                              : esReemplazo
                                ? 'slot-repro'
                                : 'slot-normal'
                          // Solo la reprogramación que cae sobre otra casilla de
                          // la misma celda se monta encima. Lo demás, separado.
                          const seMontaEncima = esReemplazo && idx > 0
                          const ausenciaQueCubre = esReemplazo ? ausenciaPorId.get(a.covered_absence_id) : null
                          return (
                          <div
                            key={a.id}
                            data-asig-id={a.id}
                            className={`slot-base ${claseSlot} ${seMontaEncima ? 'slot-encima' : ''} group ${canEdit ? '' : 'cursor-default'} ${
                              asigResaltada === a.id
                                ? 'ring-2 ring-brand-500 ring-offset-1 shadow-md animate-pulse'
                                : (!ausente && recursosQueFaltaron.has(a.resource?.id))
                                  /* §7 · Faltó la semana pasada: el borde ámbar
                                     marca la casilla que hay que revisar. El
                                     resaltado de la búsqueda tiene prioridad —
                                     ese es un salto que el usuario acaba de
                                     pedir y no puede quedar tapado. */
                                  ? 'ring-2 ring-amber-400 ring-offset-1'
                                  : ''
                            }`}
                            onClick={async () => {
                              if (!canEdit) return
                              // Viniendo de un caso, la casilla ocupada tiene dos
                              // lecturas posibles y solo quien decide sabe cuál:
                              // puede querer corregir ese turno, o montar encima
                              // al profesional que está reubicando.
                              if (caso?.ausencia) {
                                const encima = await confirm({
                                  title: `Esta casilla ya tiene a ${a.resource?.name}`,
                                  message: `¿Asigna a ${caso.ausencia.resource?.name} SOBRE esta casilla, o edita la que ya está?`,
                                  confirmLabel: 'Asignar Reprogramación',
                                  cancelLabel: 'Editar Existente',
                                })
                                if (encima) {
                                  setModalData({
                                    roomId: cons.id, room: cons, day: dia, weekId: semanaActual.id,
                                    recursoPrecargado: quienAtiende === 'mismo' ? caso.ausencia.resource?.id : undefined,
                                    recursoPrecargadoNombre: quienAtiende === 'mismo' ? caso.ausencia.resource?.name : undefined,
                                    cubreAusenciaId: caso.ausencia.id,
                                    franjaCaida: caso.franjas?.[0],
                                    // Tope de "pacientes reales": no se reprograman
                                    // más pacientes de los que faltan.
                                    pacientesPorReprogramar: caso.cuenta?.pacientes_pendientes,
                                  })
                                  return
                                }
                              }
                              setModalData({
                                roomId: cons.id,
                                room: cons,
                                day: dia,
                                weekId: semanaActual.id,
                                assignment: a,
                              })
                            }}
                          >
                            {/* Las MISMAS cuatro líneas en todas las casillas,
                                pase lo que pase. El estado lo dice el color del
                                fondo, no el texto: con etiquetas dentro, cada
                                casilla crecía distinto y la cuadrícula quedaba
                                despareja. Las líneas sin dato van con un espacio
                                duro para que la altura no dependa del contenido. */}
                            <div className="font-medium text-xs leading-tight truncate text-gray-900" title={a.resource?.name}>
                              {/* 3583 · El permiso por horas lleva su ícono, aparte del color. */}
                              {ausente?.is_partial && <span className="mr-0.5" title={`Por horas: ${ausente.absence_start_time ?? ''}–${ausente.absence_end_time ?? ''}`}>⏱</span>}
                              {nombreCorto(a.resource?.name)}
                            </div>
                            <div className="text-xs leading-tight text-gray-700">{a.start_time}–{a.end_time}</div>
                            <div className="text-xs leading-tight text-gray-600 truncate">
                              {a.assistant ? `Aux: ${nombreCorto(a.assistant.name)}` : ' '}
                            </div>
                            <div className="text-xs leading-tight text-gray-600">
                              {a.resource?.type === 'asesor_servicios' ? ' ' : a.contingency ? '— pac.' : `${a.patient_capacity} pac.`}
                            </div>

                            {/* EL DETALLE, AL PASAR EL MOUSE.
                                La casilla se mantiene chica y pareja con el resto;
                                al pasar por encima crece dentro de su propia celda
                                y muestra todo. Crece la casilla en vez de abrir un
                                globo flotante porque la grilla vive en un
                                contenedor con scroll horizontal y cualquier
                                elemento absoluto que se salga queda cortado. */}
                            <div className="hidden group-hover:block mt-1 pt-1 border-t border-black/10 text-[10px] leading-snug">
                              <div className="font-medium text-gray-800">{a.resource?.name}</div>
                              <div className="text-gray-600">{cons.name} · {cons.specialty}</div>
                              {a.assistant && <div className="text-gray-600">Aux 1: {a.assistant.name}</div>}
                              {a.assistant2 && <div className="text-gray-600">Aux 2: {a.assistant2.name}</div>}
                              {a.resource?.type !== 'asesor_servicios' && (
                                <div className="text-gray-600">Capacidad: {a.patient_capacity} pacientes</div>
                              )}
                              {ausente && (
                                <div className="text-red-800 mt-0.5">
                                  ⛔ Ausente · {ausente.motivo_catalogo ?? ausente.type}
                                  {ausente.is_partial && ausente.absence_start_time ? ` · ⏱ ${ausente.absence_start_time}–${ausente.absence_end_time}` : ''}
                                  {ausente.status === 'pendiente' ? ' (sin confirmar)' : ''}
                                  {pacientesDelCaso(ausente) ? ' · ' + pacientesDelCaso(ausente) + ' pac. afectados' : ''}
                                </div>
                              )}
                              {esReemplazo && (
                                <div className="text-indigo-800 mt-0.5">
                                  🔄 Reprogramación
                                  {ausenciaQueCubre ? ' — pacientes de ' + ausenciaQueCubre.resource?.name : ''}
                                  {seMontaEncima ? '. Se suma a su turno propio de esta franja.' : ''}
                                </div>
                              )}
                            </div>
                            {/* PROYECTOS-3255 #2.1: asesores no muestran # pacientes en el badge. */}
                            {a.resource?.type !== 'asesor_servicios' && (
                              <div className="text-teal-600 text-xs">{a.patient_capacity} pac.</div>
                            )}
                            {a.is_overtime && <span className="text-amber-700 text-xs">⚠ extras</span>}
                            {canCopiar && (
                              <button
                                className="absolute top-0.5 right-4 hidden group-hover:block text-gray-400 hover:text-brand-600 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCopiarDia({
                                    type: 'asignacion',
                                    assignmentId: a.id,
                                    dayFrom: dia,
                                    etiqueta: `${a.resource?.name?.split(' ')[0]} ${a.start_time}–${a.end_time}`,
                                  })
                                }}
                                title={isCerrada
                                  ? 'Semana cerrada: copie este turno a otra semana'
                                  : 'Copiar este turno a otro día'}
                              >📋</button>
                            )}
                            {canEdit && (
                              <button
                                className="absolute top-0.5 right-0.5 hidden group-hover:block text-gray-400 hover:text-red-500 text-xs"
                                onClick={(e) => { e.stopPropagation(); eliminarAsig(a.id) }}
                                title="Eliminar asignación"
                              >×</button>
                            )}
                          </div>
                          )
                        })}
                        {/* Botón "Copiar este consultorio+día" cuando hay 2+ asignaciones
                            (útil para área asesores con varios al tiempo) */}
                        {canCopiar && asigs.length >= 2 && (
                          <button
                            className="text-xs text-gray-400 hover:text-brand-600 italic py-0.5 px-1"
                            onClick={() => setCopiarDia({
                              type: 'consultorio',
                              roomId: cons.id,
                              consultorioNombre: cons.name,
                              dayFrom: dia,
                              etiqueta: DIAS_LABEL[DIAS.indexOf(dia)] ?? dia,
                            })}
                            title={isCerrada
                              ? `Semana cerrada: copie las ${asigs.length} asignaciones a otra semana`
                              : `Copiar las ${asigs.length} asignaciones de ${cons.name} a otro(s) día(s)`}
                          >
                            📋 copiar todas
                          </button>
                        )}
                        {/* Sin límite de turnos por día — las validaciones de
                            conflicto horario / tope diario del recurso / cobertura
                            de auxiliar siguen aplicando en el backend, así que no
                            hay riesgo de doble-asignar. */}
                        {canEdit && (
                          <div
                            className="slot-empty text-xs py-1"
                            onClick={() => {
                              const ctx = {
                                roomId: cons.id, room: cons, day: dia, weekId: semanaActual.id,
                                // Viniendo de "Mover la agenda". Solo se precarga
                                // cuando es el mismo médico el que recupera su
                                // agenda; si se hace cargo otro, se deja elegir.
                                recursoPrecargado: quienAtiende === 'mismo' ? caso?.ausencia?.resource?.id : undefined,
                                recursoPrecargadoNombre: quienAtiende === 'mismo' ? caso?.ausencia?.resource?.name : undefined,
                                cubreAusenciaId: caso?.ausencia?.id,
                                franjaCaida: caso?.franjas?.[0],
                                pacientesPorReprogramar: caso?.cuenta?.pacientes_pendientes,
                              }
                              // Si tiene servicio alternativo, primero pedir cuál usar
                              if (cons.alt_specialty) setPickerServicio(ctx)
                              else setModalData(ctx)
                            }}
                          >
                            <span className="text-gray-300">+ asignar</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda: tres colores, tres estados. Nada más. */}
      <div className="mt-3 space-y-1">
        <div className="flex gap-4 flex-wrap">
          {[
            { bg: 'bg-emerald-50 border-emerald-300', label: 'Asignación normal' },
            { bg: 'bg-blue-50 border-blue-400',       label: 'Reprogramación' },
            { bg: 'bg-red-50 border-red-400',         label: 'Ausente' },
            { bg: 'bg-orange-50 border-orange-400',   label: 'Contingencia' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded border-2 ${l.bg}`} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-gray-400">
          Pase el mouse por una casilla para ver el detalle completo.
        </div>
      </div>

      {pickerServicio && (
        <PickerServicioModal
          consultorio={pickerServicio.room}
          onClose={() => setPickerServicio(null)}
          onPick={(especialidad) => {
            const esAlt = especialidad !== pickerServicio.room.specialty
            setModalData({ ...pickerServicio, especialidadOverride: esAlt ? especialidad : undefined })
            setPickerServicio(null)
          }}
        />
      )}

      {modalData && (
        <AsignacionModal
          data={modalData}
          asignacion={modalData.assignment}
          sedeId={sedeId}
          onClose={() => setModalData(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['asignaciones'] })
            // El contador del caso se quedaba viejo: la grilla ya mostraba los
            // turnos nuevos y el aviso seguía diciendo "faltan N". También las
            // ausencias de la semana, que son las que pintan las casillas rojas.
            qc.invalidateQueries({ queryKey: ['contexto-reemplazo'] })
            qc.invalidateQueries({ queryKey: ['ausencias-de-la-semana'] })
            setModalData(null)
          }}
        />
      )}

      {verCambios && semanaActual && (
        <CambiosSemanaModal semanaId={semanaActual.id} sedeId={sedeId} onClose={() => setVerCambios(false)} />
      )}

      {verAvisoAusentes && (
        <AvisoAusentesSemanaAnterior
          datos={ausentesPrev}
          cargando={loadAusentesPrev}
          onClose={() => setVerAvisoAusentes(false)}
          onProgramar={canEdit ? programarReposicion : undefined}
        />
      )}

      {copiarDia && (() => {
        // La "próxima semana" es la siguiente cuya fecha_inicio > fecha_fin de la actual.
        // Si no existe (no se ha creado todavía), el botón aparece deshabilitado.
        const siguiente = semanaActual
          ? semanas.find((s) => parseFechaLocal(s.start_date) > parseFechaLocal(semanaActual.end_date))
          : null
        return (
          <CopiarDiaModal
            info={copiarDia}
            semanaId={semanaActual?.id}
            sedeId={sedeId}
            semanaSiguienteId={siguiente?.id}
            origenCerrada={isCerrada && !isSupervisor && !libre}
            onClose={() => setCopiarDia(null)}
            onSaved={() => { qc.invalidateQueries({ queryKey: ['asignaciones'] }); setCopiarDia(null) }}
          />
        )
      })()}

      {showCierre && semanaActual && (() => {
        // Calcular resumen para el modal
        const consActivos = consultorios.filter((c) => c.active)
        const consConAsig = new Set(asignaciones.map((a) => a.room_id))
        const consSinAsig = consActivos.filter((c) => !consConAsig.has(c.id))
        const pacientesProg = asignaciones.reduce((acc, a) => acc + (a.patient_capacity ?? 0), 0)
        const ociososList = recursos.filter((r) => utilizacionSemanal(r).ociosa)
        const resumen = {
          label_semana: semanaLabel(semanaBase),
          ocupacion_proyectada: ocupacion,
          consultorios_asignados: consActivos.length - consSinAsig.length,
          consultorios_totales: consActivos.length,
          asignaciones_total: asignaciones.length,
          pacientes_programados: pacientesProg,
          consultorios_sin_asignar: consSinAsig,
          recursos_ociosos: ociososList,
        }
        return (
          <CerrarSemanaModal
            semana={semanaActual}
            resumen={resumen}
            sedeId={sedeId}
            sedeNombre={sedeActivaNombre}
            onClose={() => setShowCierre(false)}
            onIrAConsultorio={irAConsultorio}
            onAsignarRecurso={asignarRecursoOcioso}
          />
        )
      })()}

      {boRecursoOcioso && (
        <AsignarBackofficeModal
          auxiliar={boRecursoOcioso}
          onClose={() => setBoRecursoOcioso(null)}
        />
      )}

      {/* Panel lateral: buscador de recurso en la semana visible.
          Overlay ligero (bg-black/10) — el panel es angosto (360px) para que
          la grilla quede a la vista y el coord pueda comparar mientras salta
          entre apariciones. No se cierra al hacer click en un resultado.
          Estructura: header → input + contador → lista agrupada por persona. */}
      {panelBusquedaAbierto && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setPanelBusquedaAbierto(false)}
            aria-hidden
          />
          <aside
            className="fixed right-0 top-0 h-full w-full sm:w-[360px] z-50 bg-white shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Buscar recurso en la semana"
          >
            <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
              <span className="text-lg" aria-hidden>🔎</span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-800 leading-tight">Buscar recurso</h2>
                <p className="text-xs text-gray-500 leading-tight">
                  Semana {semanaLabel(semanaBase)}
                  {esBusquedaGlobal && <span className="ml-1 text-brand-700">· 🌐 todas las sedes</span>}
                </p>
              </div>
              <button
                onClick={() => setPanelBusquedaAbierto(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
                title="Cerrar"
                aria-label="Cerrar panel"
              >×</button>
            </header>

            <div className="px-4 py-3 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                className="input w-full"
                placeholder="Nombre del doctor, auxiliar, técnico…"
                value={busquedaRecurso}
                onChange={(e) => setBusquedaRecurso(e.target.value)}
              />
              <div className="text-xs mt-2 flex items-center justify-between gap-2">
                <span className="text-gray-500">
                  {esBusquedaGlobal && cargandoGlobal
                    ? 'Cargando asignaciones de todas las sedes…'
                    : busquedaRecurso.trim().length === 0
                      ? 'Escriba al menos 2 letras.'
                      : normalizarTexto(busquedaRecurso).length < 2
                        ? 'Escriba al menos 2 letras.'
                        : resultadosBusqueda.length === 0
                          ? 'Sin resultados en esta semana.'
                          : `${resultadosBusqueda.length} aparicion${resultadosBusqueda.length === 1 ? '' : 'es'} · ${resultadosAgrupados.length} ${resultadosAgrupados.length === 1 ? 'persona' : 'personas'}`}
                </span>
                {busquedaRecurso && (
                  <button
                    onClick={() => setBusquedaRecurso('')}
                    className="text-brand-600 hover:underline"
                  >Limpiar</button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {resultadosAgrupados.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-8 px-4">
                  {busquedaRecurso.trim().length === 0
                    ? 'Empieza a escribir un nombre para ver dónde está asignado esta semana.'
                    : normalizarTexto(busquedaRecurso).length < 2
                      ? null
                      : 'Este recurso no tiene asignaciones activas en la semana visible.'}
                </div>
              ) : (
                resultadosAgrupados.map((grupo) => (
                  <section key={grupo.name} className="mb-3">
                    <div className="text-xs font-semibold text-gray-700 px-2 py-1.5 bg-gray-50 rounded flex items-center justify-between gap-2">
                      <span className="truncate" title={grupo.name}>{grupo.name}</span>
                      <span className="text-brand-700 bg-brand-50 border border-brand-100 rounded px-1.5 py-0.5 text-xs whitespace-nowrap">
                        {grupo.apariciones.length}× esta semana
                      </span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {grupo.apariciones.map((r, idx) => {
                        const esOtraSede = esBusquedaGlobal && r.siteId && r.siteId !== sedeId
                        return (
                          <li key={`${r.asigId}-${idx}`}>
                            <button
                              onClick={() => saltarACelda(r.asigId, r.roomId, r.siteId)}
                              className={`w-full text-left text-xs bg-white hover:bg-blue-50 border rounded-md px-2 py-1.5 transition-colors ${
                                asigResaltada === r.asigId ? 'border-brand-400 bg-blue-50' : 'border-gray-200'
                              }`}
                              title={esOtraSede ? `Cambiar a ${r.sedeNombre} y saltar a esta celda` : 'Saltar a esta celda'}
                            >
                              <div className="font-medium text-gray-800 flex items-center gap-1 flex-wrap">
                                <span>{r.diaLabel}</span>
                                <span className="text-gray-400">·</span>
                                <span className="truncate">{r.consultorioNombre}</span>
                                {esBusquedaGlobal && r.sedeNombre && (
                                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                                    esOtraSede
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}>
                                    📍 {r.sedeNombre}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-500 text-xs flex items-center gap-2 mt-0.5">
                                <span>{r.startTime}–{r.endTime}</span>
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                                  {r.rolLabel}
                                </span>
                                {esOtraSede && (
                                  <span className="text-brand-600 text-xs">→ cambia sede</span>
                                )}
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

const DIAS_TODOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_TODOS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const ESPECIALIDAD_LABEL = {
  oftalmologia:   'Oftalmología',
  optometria:     'Optometría',
  anestesiologia: 'Anestesiología',
  diagnostico:    'Métodos diagnósticos',
  asesoria:       'Asesoría',
}

/**
 * Mini-modal que aparece cuando el consultorio tiene servicio alternativo.
 * Pide al coordinador qué servicio va a programar antes de abrir el modal real.
 */
function PickerServicioModal({ consultorio, onClose, onPick }) {
  const principal = consultorio.specialty
  const alternativo = consultorio.alt_specialty
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">¿Qué servicio va a programar?</h2>
            <p className="text-xs text-gray-500 mt-0.5">{consultorio.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <button
            className="w-full text-left px-4 py-3 border border-gray-200 hover:border-brand-600 hover:bg-brand-50 rounded-lg transition-colors group"
            onClick={() => onPick(principal)}
          >
            <div className="text-sm font-medium text-gray-900 group-hover:text-brand-700">{ESPECIALIDAD_LABEL[principal] ?? principal}</div>
            <div className="text-xs text-gray-500 mt-0.5">Servicio principal</div>
          </button>
          <button
            className="w-full text-left px-4 py-3 border border-gray-200 hover:border-brand-600 hover:bg-brand-50 rounded-lg transition-colors group"
            onClick={() => onPick(alternativo)}
          >
            <div className="text-sm font-medium text-gray-900 group-hover:text-brand-700">
              {ESPECIALIDAD_LABEL[alternativo] ?? alternativo}
              <span className="ml-2 inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium uppercase tracking-wide">
                Alternativo
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Servicio secundario del consultorio</div>
          </button>
        </div>
      </div>
    </div>
  )
}

function CopiarDiaModal({ info, semanaId, sedeId, semanaSiguienteId, origenCerrada = false, onClose, onSaved }) {
  const [destinos, setDestinos] = useState([])
  // Si la semana ORIGEN está cerrada, forzamos destino = próxima semana (no se
  // puede modificar la cerrada). El supervisor sí puede elegir cualquier opción.
  const [destinoEsSiguiente, setDestinoEsSiguiente] = useState(origenCerrada)
  const toggle = (d) => setDestinos((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])

  // info.tipo determina qué endpoint usar:
  //   'dia'          → copiar TODAS las asignaciones del día
  //   'consultorio'  → copiar todas las del consultorio+día
  //   'asignacion'   → copiar UNA asignación específica
  const tipo = info.type ?? 'dia'

  // ID de la semana donde se van a crear las asignaciones copiadas.
  // Si el usuario marcó "Próxima semana", usamos el ID de la siguiente; si no, la actual.
  const semanaDestinoId = destinoEsSiguiente && semanaSiguienteId ? semanaSiguienteId : null

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (tipo === 'asignacion') {
        return asignacionService.copiarAsignacion(info.assignmentId, destinos, semanaDestinoId)
      }
      if (tipo === 'consultorio') {
        return asignacionService.copiarConsultorio({
          weekId: semanaId,
          roomId: info.roomId,
          dayFrom: info.dayFrom,
          targetDays: destinos,
          targetWeekId: semanaDestinoId,
        })
      }
      return asignacionService.copiarDia({
        weekId: semanaId,
        siteId: sedeId,
        dayFrom: info.dayFrom,
        targetDays: destinos,
        targetWeekId: semanaDestinoId,
      })
    },
    onSuccess: (res) => {
      const copiadas = res?.copied ?? 0
      const omitidas = res?.skipped ?? 0
      const errores = res?.errors ?? []
      if (omitidas > 0 && copiadas === 0) {
        // Todo falló — mostrar el motivo del primer error para que el coord entienda.
        const primer = errores[0]
        const motivo = primer?.message ?? 'conflicto'
        toast.error(`No se pudo copiar (${omitidas} ${omitidas === 1 ? 'día' : 'días'}): ${motivo}`, { duration: 8000 })
      } else if (omitidas > 0) {
        const primer = errores[0]
        const motivo = primer?.message ? ` · Motivo: ${primer.message}` : ''
        toast(`${copiadas} copiadas, ${omitidas} omitidas${motivo}`, { duration: 7000, icon: '⚠️' })
      } else {
        toast.success(`${copiadas} asignaciones copiadas`)
      }
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al copiar'),
  })

  // Si destino es la misma semana, no permitimos repetir el día origen.
  // Si destino es la próxima, sí podemos copiar al mismo día (ej. martes → martes).
  const diasDisponibles = destinoEsSiguiente
    ? DIAS_TODOS
    : DIAS_TODOS.filter((d) => d !== info.dayFrom)
  const titulo = tipo === 'asignacion'
    ? '📋 Copiar turno'
    : tipo === 'consultorio'
    ? `📋 Copiar ${info.consultorioNombre}`
    : '📋 Copiar día completo'
  const descripcion = tipo === 'asignacion'
    ? <>Va a copiar el turno de <strong>{info.etiqueta}</strong> a los días seleccionados.</>
    : tipo === 'consultorio'
    ? <>Va a copiar todas las asignaciones de <strong>{info.consultorioNombre}</strong> del <strong>{info.etiqueta}</strong> a los días seleccionados.</>
    : <>Va a copiar <strong>todas las asignaciones</strong> de <strong>{info.etiqueta}</strong> a los días seleccionados.</>

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-gray-600">
            {descripcion}
          </div>
          <div>
            <label className="label">¿A qué semana? <span className="text-red-600">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { if (!origenCerrada) { setDestinoEsSiguiente(false); setDestinos([]) } }}
                disabled={origenCerrada}
                title={origenCerrada ? 'Esta semana está cerrada — solo puede copiar a otra semana' : ''}
                className={`text-xs py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${!destinoEsSiguiente ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
              >
                Esta semana {origenCerrada && '(cerrada)'}
              </button>
              <button
                type="button"
                onClick={() => { if (semanaSiguienteId) { setDestinoEsSiguiente(true); setDestinos([]) } }}
                disabled={!semanaSiguienteId}
                title={!semanaSiguienteId ? 'No existe semana próxima creada — créela primero' : ''}
                className={`text-xs py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${destinoEsSiguiente ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
              >
                Próxima semana {!semanaSiguienteId && '(no creada)'}
              </button>
            </div>
            {origenCerrada && (
              <div className="text-[11px] text-amber-700 mt-1">
                La semana origen está cerrada. Las asignaciones se replicarán en la próxima semana abierta.
              </div>
            )}
          </div>
          <div>
            <label className="label">¿A qué día(s)? <span className="text-red-600">*</span></label>
            <div className="border border-gray-200 rounded-lg p-2 space-y-1">
              {diasDisponibles.map((d) => {
                const label = DIAS_TODOS_LABEL[DIAS_TODOS.indexOf(d)]
                const esMismoDia = d === info.dayFrom
                return (
                  <label key={d} className="flex items-center gap-2 text-sm hover:bg-gray-50 px-1 py-1 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={destinos.includes(d)}
                      onChange={() => toggle(d)}
                    />
                    {label}{destinoEsSiguiente && esMismoDia && <span className="text-[10px] text-blue-600 ml-1">(mismo día próxima sem.)</span>}
                  </label>
                )
              })}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
            💡 Si en algún día destino hay conflicto (mismo recurso ya asignado a otra hora), se omite y se reporta. Las demás sí se copian.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={destinos.length === 0 || isPending}
          >
            {isPending ? <Spinner size="sm" /> : `Copiar a ${destinos.length} día(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
