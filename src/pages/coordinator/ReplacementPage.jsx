import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ausenciaService, recursoService, asignacionService, usuarioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useConfirm } from '@/contexts/ConfirmContext'
import { Avatar, Spinner, EmptyState, Badge } from '@/components/ui'
import { GRUPOS_AUSENCIAS, TIPOS_RECURSO, parseFechaLocal, pacientesDelCaso, palabraDelRecurso, coordSoloVe } from '@/utils/helpers'
import { RAIZ_AUSENCIAS } from '@/config/nav'
import { horaDeCorte } from '@/utils/tramos'

// Los que reparte la líder. Los demás (técnicos, auxiliares, asesores) los
// reparte el coordinador de su sede.
const PROFESIONALES = new Set(GRUPOS_AUSENCIAS.find((g) => g.key === 'profesionales')?.tipos ?? [])

/**
 * PANTALLA DE REEMPLAZO (oct-2026)
 * ================================
 *
 * Hector: "debe ser una pantalla completa para el remplazo que debe mostrar el
 * dia la hora, las sedes los coordinadores y todo eso para que pueda ser
 * directo al programador".
 *
 * Reemplaza al modal "Buscar reemplazo", que solo sabía de UNA franja: había
 * que abrirlo una vez por cada hueco y nunca se veía el panorama. Una ausencia
 * de martes a jueves de alguien que rota por tres sedes son nueve huecos, y
 * decidir hueco por hueco es cómo se pierden agendas.
 *
 * Aquí se ven todas las franjas caídas a la vez, cada una con su sede,
 * consultorio, horario, pacientes y coordinador. Importa el conjunto: si el
 * mismo día hay alguien libre en otra sede, se cubre sin mover un solo
 * paciente — que es el caso que Hector quiere poder resolver primero.
 *
 * Al asignar, la asignación nace con `covered_absence_id`, así que aparece en
 * el Programador en índigo, apilada bajo la casilla roja del ausente. No hay
 * un paso extra: esta pantalla ESCRIBE en la programación.
 */
export default function ReemplazoPage() {
  const { ausenciaId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['contexto-reemplazo', ausenciaId],
    queryFn: () => ausenciaService.contextoReemplazo(ausenciaId),
    enabled: !!ausenciaId,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  if (error || !data?.ausencia) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la ausencia"
          description={error?.message ?? 'La ausencia no existe o no tienes acceso a ella.'}
        />
      </div>
    )
  }

  const { ausencia, semana, franjas, cuenta } = data
  const acompanaba = data.acompanaba ?? []
  const auxCubiertos = data.auxiliar_cubiertos ?? []
  const esDeAcompanar = acompanaba.length + auxCubiertos.length > 0
  const sinNada = franjas.length === 0 && (cuenta?.pacientes_impactados ?? 0) === 0
  // 21-oct · Hector: el coordinador ve la ausencia de un profesional, pero no
  // la gestiona (confirmar, cubrir, repartir son de la líder).
  const soloVe = coordSoloVe(user?.role, ausencia.resource?.type)

  // VOLVER A GESTIÓN DE AUSENCIAS, NO A LA PÁGINA ANTERIOR.
  // Antes era navigate(-1), o sea "atrás en el historial". A esta pantalla se
  // llega desde Gestión de ausencias, pero también desde el Programador cuando
  // se vuelve de mover una agenda — y ahí "atrás" devolvía al Programador, que
  // es de donde la persona acababa de salir. Se vuelve al sitio del que SALIÓ
  // el caso, con su grupo y la ausencia ya seleccionada.
  const grupoDeLaAusencia =
    GRUPOS_AUSENCIAS.find((g) => g.tipos.includes(ausencia.resource?.type))?.key ?? 'profesionales'
  const volverAGestion = () =>
    navigate(`${RAIZ_AUSENCIAS}?grupo=${grupoDeLaAusencia}&selected=${ausencia.id}`)

  return (
    <div className="p-3 sm:p-4 max-w-5xl mx-auto">
      <button
        onClick={volverAGestion}
        className="text-xs text-gray-500 hover:text-brand-600 mb-3"
      >
        ← Volver a Gestión de ausencias
      </button>

      <CabeceraAusencia ausencia={ausencia} semana={semana} cuenta={cuenta} />

      {ausencia.status === 'pendiente' && !soloVe && <ConfirmarAusencia ausencia={ausencia} />}

      {/* Sin agenda caída ni pacientes no hay caso que avanzar ni repartir:
          antes salía "Caso abierto · 0 de 0" y el formulario de reparto. */}
      {cuenta && !sinNada && <Avance cuenta={cuenta} ausencia={ausencia} />}

      {esDeAcompanar && <TurnosQueAcompanaba ausencia={ausencia} acompanaba={acompanaba} cubiertos={auxCubiertos} />}

      {franjas.length === 0 ? (
        !esDeAcompanar && <div className="mt-4">
          <EmptyState
            icon="📭"
            title="No hay nada que reemplazar"
            description={
              semana
                ? 'Este profesional no tenía ninguna franja programada los días de la ausencia, así que no se cayó ninguna agenda.'
                : 'Las fechas de la ausencia no caen en ninguna semana programada.'
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Jornadas Afectadas ({franjas.length})
            </h2>
            <div className="text-xs text-gray-500">
              {cuenta?.franjas_cubiertas ?? 0} de {franjas.length} con reemplazo
            </div>
          </div>

          <div className="space-y-3">
            {franjas.map((f) => (
              <TarjetaFranja key={f.assignment_id} franja={f} ausencia={ausencia} cuenta={cuenta} soloVe={soloVe} />
            ))}
          </div>
        </>
      )}

      {!sinNada && !soloVe && <AsignarReprogramador ausencia={ausencia} cuenta={cuenta} />}
    </div>
  )
}

/**
 * EL ULTIMO PASO: a quien se le pasa el caso.
 *
 * Hector: "ella selecciona el dia de la reprogramacion o el remplazo (...)
 * entonces asigna al reprogramador y asi despues que lo reprograme ya los
 * reprogramadores comienzan a llamar uno a uno a los pacientes".
 *
 * Las llamadas NO viven aqui: el SGRC no tiene pacientes, solo cuantos quedaron
 * impactados. Lo que queda registrado es quien decidio, a quien se lo paso,
 * cuando, con que indicaciones, y cuando esa persona lo dio por terminado.
 * Hasta ahi llega la cadena, que es exactamente lo que se pidio.
 */
function AsignarReprogramador({ ausencia, cuenta }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [elegido, setElegido] = useState(ausencia.rescheduler_id ?? '')
  const [notas, setNotas] = useState(ausencia.reschedule_notes ?? '')

  const asignada = ausencia.reschedule_status === 'asignada'
  const resuelta = ausencia.reschedule_status === 'resuelta'
  // Oct-2026 · PRIMERO CUBRIR, DESPUÉS REPARTIR (decisión de Hector). Sin nada
  // cubierto, quien recibe el encargo llamaría a los pacientes sin saber a
  // dónde mandarlos. El servidor también lo rechaza. Aquí el botón queda
  // apagado, sin aviso: Hector pidió quitar el recuadro amarillo que lo
  // explicaba.
  const hayCubierto = (cuenta?.pacientes_cubiertos ?? 0) > 0
  // Por confirmar → por cubrir → por repartir. Sin confirmar no se reparte.
  const sinConfirmar = ausencia.status !== 'confirmada'
  // Oct-2026 · SIN 'reprogramador'. Ese rol es el de quien RECIBE el encargo
  // —"este perfil es para las personas que Duarte asigna, no para Duarte"—, y
  // repartir no es lo suyo: la líder entra como supervisor.
  //
  // Va alineado con la ruta del servidor, que ya lo rechaza. Dejarlo aquí solo
  // le pintaba un botón que termina en 403.
  const puedeAsignar = ['coordinador', 'supervisor', 'gerencia'].includes(user?.role)
  // Lo cierra quien lo tiene asignado; supervision tambien, para destrabarlo
  // si esa persona no esta.
  const puedeCerrar = asignada && (ausencia.rescheduler_id === user?.id || ['supervisor', 'gerencia'].includes(user?.role))
  // 3744 · Técnicos y asesores no pasan por un reprogramador: su coordinador
  // (y la líder o gerencia) lo da por terminado sin asignar a nadie, igual que
  // el servidor. Antes el único cierre exigía tener a alguien asignado.
  const algoCubierto = hayCubierto || (cuenta?.franjas_cubiertas ?? 0) > 0
  const puedeTerminarSinAsignar = !asignada && !resuelta && !sinConfirmar && algoCubierto &&
    puedeAsignar && !PROFESIONALES.has(ausencia.resource?.type)

  const { data: reprogramadores = [] } = useQuery({
    queryKey: ['reprogramadores'],
    queryFn: () => usuarioService.listReprogramadores(),
    enabled: puedeAsignar,
    staleTime: 5 * 60 * 1000,
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
    qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
  }

  const { mutate: asignar, isPending: asignando } = useMutation({
    mutationFn: () => ausenciaService.asignarReprogramador(ausencia.id, {
      reschedulerId: elegido,
      notes: notas.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Reprogramación asignada. La persona fue notificada.'); refrescar() },
    onError: (err) => toast.error(err?.message ?? 'No se pudo asignar'),
  })

  const { mutate: cerrar, isPending: cerrando } = useMutation({
    mutationFn: () => ausenciaService.resolverReprogramacion(ausencia.id),
    onSuccess: () => { toast.success('Reprogramación marcada como resuelta.'); refrescar() },
    onError: (err) => toast.error(err?.message ?? 'No se pudo cerrar'),
  })

  // El nombre viene con la ausencia: quien recibió el caso puede no estar ya
  // en la lista de reprogramadores (cambió de rol).
  const nombreAsignado = ausencia.rescheduler_name ??
    reprogramadores.find((r) => r.id === ausencia.rescheduler_id)?.name

  // 21-oct · Hector: en técnicos (y el resto que no son profesionales) el
  // coordinador NO elige reprogramador: el proceso lo hace él mismo. Aquí solo
  // queda cerrarlo. Un caso viejo que ya tenía a alguien asignado sigue
  // mostrando el panel de siempre para poder cerrarlo.
  if (!PROFESIONALES.has(ausencia.resource?.type) && !asignada) {
    return (
      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Cierre del caso</h2>
          {resuelta ? <Badge variant="green">Terminado</Badge> : <Badge variant="gray">Abierto</Badge>}
        </div>
        {puedeTerminarSinAsignar && (
          <button className="btn-primary w-full justify-center mt-3" onClick={() => cerrar()} disabled={cerrando}>
            {cerrando ? <Spinner size="sm" /> : 'Dar por terminado'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-gray-900">Reprogramación de pacientes</h2>
        {resuelta && <Badge variant="green">Resuelta</Badge>}
        {asignada && <Badge variant="blue">Asignada</Badge>}
        {!asignada && !resuelta && <Badge variant="gray">Sin asignar</Badge>}
      </div>

      {(asignada || resuelta) && (
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs space-y-1 mb-4">
          <div>
            <span className="text-gray-400">Asignada a:</span>{' '}
            <strong className="text-gray-800">{nombreAsignado ?? 'otro usuario'}</strong>
          </div>
          {ausencia.assigned_at && (
            <div>
              <span className="text-gray-400">Cuándo:</span>{' '}
              {format(new Date(ausencia.assigned_at), "d 'de' MMM yyyy, HH:mm", { locale: es })}
            </div>
          )}
          {ausencia.reschedule_notes && (
            <div>
              <span className="text-gray-400">Indicaciones:</span> {ausencia.reschedule_notes}
            </div>
          )}
          {ausencia.reschedule_done_at && (
            <div className="text-green-700">
              Resuelta el {format(new Date(ausencia.reschedule_done_at), "d 'de' MMM yyyy, HH:mm", { locale: es })}
            </div>
          )}
        </div>
      )}

      {/* Una rechazada no tiene pacientes que repartir. */}
      {puedeAsignar && ausencia.status !== 'rechazada' && !resuelta && (
        <div className="space-y-3">
          <div>
            <label className="label">{asignada ? 'Reasignar a' : 'Asignar a'} <span className="text-red-600">*</span></label>
            <select className="input" value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">Seleccionar reprogramador...</option>
              {reprogramadores.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {reprogramadores.length === 0 && (
              <div className="text-[11px] text-amber-700 mt-1">
                No hay nadie con el rol de reprogramador. Hay que asignárselo primero desde Catálogos → Usuarios.
              </div>
            )}
          </div>

          <div>
            <label className="label">Indicaciones (opcional)</label>
            <textarea
              className="input resize-none text-xs"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Qué tiene que hacer con los pacientes: a qué día moverlos, a quién avisar..."
            />
          </div>

          <button
            className="btn-primary w-full justify-center"
            onClick={() => asignar()}
            disabled={!elegido || asignando || sinConfirmar || (!asignada && !hayCubierto)}
          >
            {asignando ? <Spinner size="sm" /> : asignada ? 'Reasignar' : 'Asignar reprogramación'}
          </button>
        </div>
      )}

      {puedeCerrar && (
        <button
          className="btn w-full justify-center mt-2"
          onClick={() => cerrar()}
          disabled={cerrando}
        >
          {cerrando ? <Spinner size="sm" /> : '✅ Marcar como resuelta'}
        </button>
      )}
    </div>
  )
}

/**
 * EL AVANCE DEL CASO — cuántos pacientes faltan por reubicar.
 *
 * Hector: "si son 100 pacientes, hasta que no cuente los 100 pacientes repro
 * no me deje salir del programador. Y cuando ya termine me debería salir a la
 * pantalla principal de que a quién asignó. Y al final después de guardar
 * ¿qué viene?"
 *
 * Eso era justo lo que faltaba: se asignaba un reemplazo y la pantalla quedaba
 * igual que antes, sin decir cuánto falta ni cuándo se terminó. Sin esto, el
 * caso se abandonaba a medias sin que nadie se enterara — que es exactamente
 * como se acumularon las 6 ausencias de 118 días.
 *
 * Los cubiertos salen de los turnos NUEVOS, no de las franjas caídas: quien
 * cubre puede atender más o menos pacientes que el ausente (otro intervalo,
 * otra franja), y lo que importa es a cuánta gente se le resolvió de verdad.
 */
function Avance({ cuenta, ausencia }) {
  const { pacientes_impactados: total, pacientes_cubiertos: cubiertos, pacientes_pendientes: faltan, resuelto } = cuenta
  const pct = total > 0 ? Math.min(100, Math.round((cubiertos / total) * 100)) : 0
  const quien = palabraDelRecurso(ausencia?.resource?.type)

  // Oct-2026 · Terminado sin un médico que cubra todo: los pacientes se
  // reubicaron por llamada. Antes esta pantalla decía "Caso abierto · faltan
  // 10" de un caso que la lista ya mostraba como gestionado.
  if (!resuelto && ausencia?.reschedule_status === 'resuelta') {
    return (
      <div className="card mt-4 border-emerald-300 bg-emerald-50/50">
        <h2 className="text-sm font-semibold text-emerald-900">✅ Caso terminado</h2>
        <p className="text-xs text-emerald-800 mt-0.5">
          Se dio por terminado
          {cubiertos > 0
            ? <> con <strong>{cubiertos} de {total}</strong> pacientes cubiertos por otro {quien}; el resto se gestionó por llamada.</>
            : ` sin un ${quien} que cubra la agenda: los pacientes se gestionaron por llamada.`}
        </p>
      </div>
    )
  }

  if (resuelto) {
    return (
      <div className="card mt-4 border-emerald-300 bg-emerald-50/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {/* "Agenda cubierta", no "caso resuelto": el caso termina cuando
                quien llama lo da por terminado (decisión de Hector). Tener a
                todos con médico es un paso, no el final. */}
            <h2 className="text-sm font-semibold text-emerald-900">✅ Agenda cubierta</h2>
            <p className="text-xs text-emerald-800 mt-0.5">
              Los <strong>{total} pacientes</strong> tienen {quien} o día nuevo.
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {cuenta.quienes_cubren.map((q, i) => (
            <div key={i} className="text-xs text-emerald-900">
              · <strong>{q.nombre}</strong> — {q.dia} {q.desde}–{q.hasta} · {q.pacientes} pacientes
            </div>
          ))}
        </div>
        <p className="text-xs text-emerald-800 mt-3">
          {ausencia?.reschedule_status === 'asignada'
            ? 'Ya está repartido: falta que quien llama avise a los pacientes y dé el caso por terminado.'
            : 'Siguiente paso: repartir abajo el caso a quien va a llamar a los pacientes.'}
        </p>
      </div>
    )
  }

  return (
    <div className="card mt-4 border-amber-300 bg-amber-50/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-900">Caso abierto</h2>
        <div className="text-xs text-amber-900">
          <strong>{cubiertos}</strong> de <strong>{total}</strong> pacientes reprogramados
          {faltan > 0 && <> · faltan <strong className="text-red-700">{faltan}</strong></>}
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-amber-100 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {cuenta.quienes_cubren.length > 0 && (
        <div className="mt-3 space-y-1">
          {cuenta.quienes_cubren.map((q, i) => (
            <div key={i} className="text-xs text-gray-700">
              · <strong>{q.nombre}</strong> — {q.dia} {q.desde}–{q.hasta} · {q.pacientes} pacientes
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** El encabezado: de quién es la ausencia, por qué y qué tan grande es. */
function CabeceraAusencia({ ausencia, semana, cuenta }) {
  const tipo = TIPOS_RECURSO.find((t) => t.value === ausencia.resource?.type)
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <Avatar nombre={ausencia.resource?.name} size="lg" color={tipo?.color ?? 'red'} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">{ausencia.resource?.name}</h1>
            <Badge variant={ausencia.status === 'pendiente' ? 'amber' : 'red'}>
              {ausencia.status === 'pendiente' ? 'Sin confirmar' : 'Ausencia confirmada'}
            </Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {tipo?.label ?? ausencia.resource?.type}
            {ausencia.resource?.specialty ? ` · ${ausencia.resource.specialty}` : ''}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
            {/* Oct-2026 · Hector: "eliminar días que cubre y agregar fecha
                desde y hasta". Con el día de la semana incluido, que es como se
                habla en la clínica: "falta del lunes 21 al miércoles 23". */}
            <Dato
              label="Fecha desde"
              valor={ausencia.start_date ? format(parseFechaLocal(ausencia.start_date), "EEEE d 'de' MMM", { locale: es }) : '—'}
            />
            <Dato
              label="Fecha hasta"
              valor={ausencia.end_date ? format(parseFechaLocal(ausencia.end_date), "EEEE d 'de' MMM", { locale: es }) : '—'}
            />
            <Dato label="Motivo" valor={ausencia.motivo_catalogo ?? ausencia.type ?? '—'} />
            <PacientesDelCaso ausencia={ausencia} cuenta={cuenta} />
          </div>

          {ausencia.motivo_texto && (
            <div className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2">
              {ausencia.motivo_texto}
            </div>
          )}

          {semana && (
            <div className="mt-3 text-[11px] text-gray-400">
              Semana {format(parseFechaLocal(semana.desde), 'd MMM', { locale: es })} –{' '}
              {format(parseFechaLocal(semana.hasta), 'd MMM yyyy', { locale: es })}
              {semana.estado === 'cerrada' && ' · cerrada'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * LOS PACIENTES DEL CASO — los pone la líder.
 *
 * Oct-2026 · Hector: "en el momento del proceso de repro, en líder es donde
 * pone los datos de los pacientes reales afectados". Eligió que sea aquí, en
 * el caso y antes de cubrir. Desde que los pone, ese número manda: la cuenta
 * "0 de N reprogramados", el tope al cubrir y la meta de llamadas. Quien
 * llama solo lo ve.
 *
 * Puede ponerlos la líder (supervisor) y gerencia; el coordinador, solo en lo
 * de su reparto —técnicos, auxiliares, asesores—. El servidor lo comprueba
 * igual, con la sede incluida.
 */
function PacientesDelCaso({ ausencia, cuenta }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const total = cuenta?.pacientes_impactados ?? pacientesDelCaso(ausencia)
  const estimado = ausencia.patients_affected ?? 0
  const corregido = ausencia.patients_confirmed != null
  // No puede quedar por debajo de lo que ya tiene médico o día nuevo.
  const minimo = cuenta?.pacientes_cubiertos ?? 0
  const puede = ausencia.status !== 'rechazada' && ausencia.reschedule_status !== 'resuelta' && (
    ['supervisor', 'gerencia'].includes(user?.role) ||
    (user?.role === 'coordinador' && !PROFESIONALES.has(ausencia.resource?.type))
  )
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: (n) => ausenciaService.corregirPacientes(ausencia.id, n),
    onSuccess: () => {
      toast.success('Pacientes reales guardados.')
      setEditando(false)
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudieron guardar los pacientes'),
  })

  const n = valor === '' ? null : Number(valor)
  const invalido = n == null || !Number.isInteger(n) || n < minimo || n > 1000

  if (editando) {
    return (
      <div>
        <div className="font-semibold text-gray-700">Pacientes reales <span className="text-red-600">*</span></div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <input
            type="number" min={minimo} max={1000} inputMode="numeric" autoFocus
            id={`pacientes-reales-${ausencia.id}`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !invalido) guardar(n) }}
            className="input w-20 py-1 tabular-nums"
          />
          <button className="btn-primary px-2 py-1 text-xs" disabled={invalido || isPending} onClick={() => guardar(n)}>
            {isPending ? <Spinner size="sm" /> : 'Guardar'}
          </button>
          <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          Estimado del sistema: {estimado}
          {minimo > 0 && <> · mínimo {minimo}, que ya están reprogramados</>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-gray-400">{corregido ? 'Pacientes reales' : 'Pacientes impactados'}</div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={total ? 'text-red-700 font-semibold' : 'text-gray-800 font-medium'}>{total}</span>
        {puede && (
          <button
            className="text-[11px] text-brand-600 hover:underline"
            onClick={() => { setValor(String(total)); setEditando(true) }}
          >
            {corregido ? 'Cambiar' : 'Poner los reales'}
          </button>
        )}
      </div>
      <div className="text-[11px] text-gray-400">
        {corregido ? `El sistema estimaba ${estimado}` : 'Estimado del sistema'}
      </div>
    </div>
  )
}

/**
 * CONFIRMAR LA AUSENCIA — el primer paso del proceso.
 *
 * Oct-2026 · Hector eligió "botón Confirmar en el caso". No había ningún
 * botón para confirmar en toda la app: se perdió cuando GESTIONAR pasó a
 * llevar directo a esta pantalla (antes lo hacía un modal), y una ausencia
 * sin confirmar se quedaba así para siempre aunque se cubriera. Cubrir y
 * repartir quedan bloqueados hasta confirmar, aquí y en el servidor: es el
 * orden que fijó él —por confirmar → por cubrir → por repartir—.
 */
function ConfirmarAusencia({ ausencia }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { user } = useAuthStore()
  const puede = ['coordinador', 'supervisor', 'gerencia'].includes(user?.role)

  const { mutate, isPending } = useMutation({
    mutationFn: () => ausenciaService.confirmar(ausencia.id, {}),
    onSuccess: () => {
      toast.success('Ausencia confirmada. Ya se puede cubrir la agenda.')
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      qc.invalidateQueries({ queryKey: ['ausencias-hub'] })
      qc.invalidateQueries({ queryKey: ['ausencias-de-la-semana'] })
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo confirmar la ausencia'),
  })

  const pedir = async () => {
    const si = await confirm({
      title: 'Confirmar la ausencia',
      message: `Confirmas que ${ausencia.resource?.name ?? 'el recurso'} no atendió esos días. Sus turnos quedan como no ejecutados y se le notifica.`,
      confirmLabel: 'Sí, confirmar',
      cancelLabel: 'Cancelar',
    })
    if (si) mutate()
  }

  return (
    <div className="card mt-4 border-amber-300 bg-amber-50/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-900">Esta ausencia no está confirmada</h2>
          <p className="text-xs text-amber-800 mt-0.5">
            Confírmala para empezar a cubrir la agenda y repartir el caso.
          </p>
        </div>
        {puede && (
          <button className="btn-primary" onClick={pedir} disabled={isPending}>
            {isPending ? <Spinner size="sm" /> : 'Confirmar ausencia'}
          </button>
        )}
      </div>
    </div>
  )
}

function Dato({ label, valor, destacado }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className={destacado ? 'text-red-700 font-semibold' : 'text-gray-800 font-medium'}>{valor}</div>
    </div>
  )
}

/**
 * 21-oct · Hector: "cambiar la capacidad de los pacientes en cada uno". Los
 * pacientes que atiende cada persona que cubre se editan aquí mismo; el tope
 * es lo que ya tenía más lo que le falta al caso (el servidor dice lo mismo).
 */
function PacientesDelTramo({ tramo, ausencia, editable, tope }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(tramo.patient_capacity ?? 0))
  const n = Number(valor)
  const valido = valor !== '' && Number.isInteger(n) && n >= 0 && n <= tope
  const { mutate, isPending } = useMutation({
    mutationFn: () => asignacionService.updatePacientesCapacidad(tramo.id, n),
    onSuccess: () => {
      toast.success('Pacientes actualizados.')
      setEditando(false)
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
    },
    onError: (e) => toast.error(e?.message ?? 'No se pudo guardar'),
  })
  if (!editando) {
    return (
      <>
        {tramo.patient_capacity ?? 0} pac.
        {editable && (
          <button type="button" className="ml-2 text-[11px] text-brand-600 hover:underline" onClick={() => { setValor(String(tramo.patient_capacity ?? 0)); setEditando(true) }}>
            Cambiar
          </button>
        )}
      </>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number" min="0" max={tope} inputMode="numeric"
        className="input py-0.5 px-1.5 w-16 text-xs tabular-nums"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
      />
      <span className="text-[11px] text-gray-500">de máx. {tope}</span>
      <button type="button" className="btn-primary text-[11px] px-2 py-0.5" disabled={!valido || isPending} onClick={() => mutate()}>
        {isPending ? <Spinner size="sm" /> : 'Guardar'}
      </button>
      <button type="button" className="text-[11px] text-gray-500 hover:underline" onClick={() => setEditando(false)}>Cancelar</button>
    </span>
  )
}

/**
 * Una franja caída: el hueco concreto a cubrir, con todo lo que hace falta
 * para decidir sin salir de la pantalla. Los candidatos solo se piden cuando
 * se abre — una ausencia de tres días en tres sedes son nueve consultas, y la
 * mayoría de las franjas se resuelven mirando dos.
 */
function TarjetaFranja({ franja, ausencia, cuenta, soloVe = false }) {
  // null = sin elegir · 'medico' = otro profesional cubre esta misma franja
  // · 'mover' = se despliega la pregunta de quién atiende esos pacientes
  const [camino, setCamino] = useState(null)
  const navigate = useNavigate()
  // Oct-2026 · La franja se cubre POR TRAMOS (decisión de Hector): cada médico
  // toma una parte del horario en el mismo consultorio. Antes, con el primer
  // médico ya salía "cubierta" aunque solo tomara una parte, y no había forma
  // de poner a otro para el resto.
  const yaResuelta = franja.cubierta ?? !!franja.reemplazo
  const tramos = franja.tramos ?? (franja.reemplazo ? [franja.reemplazo] : [])
  const huecos = franja.huecos ?? (yaResuelta ? [] : [{
    start_time: franja.start_time, end_time: franja.end_time, pacientes: franja.patient_capacity,
  }])
  const enParte = !yaResuelta && tramos.length > 0
  const faltanPac = huecos.reduce((n, h) => n + (h.pacientes ?? 0), 0)
  // Caso terminado: la franja se muestra, pero ya no se ofrece gestionarla.
  const casoCerrado = ausencia?.reschedule_status === 'resuelta'
  // Sin confirmar (o rechazada) no se cubre: el servidor también lo rechaza.
  const sinConfirmar = ausencia?.status !== 'confirmada'
  // Todos los pacientes del caso ya tienen médico o día nuevo (por ejemplo,
  // se movieron a otro horario): esta jornada ya no tiene a quién reubicar, y
  // ofrecer "Cambiar de médico" llevaba a una ventana con 0 pacientes.
  const sinPendientes = (cuenta?.pacientes_impactados ?? 0) > 0 && (cuenta?.pacientes_pendientes ?? 0) === 0

  // 21-oct · Hector: "no me deja editar la persona que cubre y ya queda como
  // bloqueado". Una jornada con el horario completo salía "Cubierta" sin
  // ningún botón: no se podía cambiar a quien cubre, y si la líder subía los
  // pacientes reales por encima de lo cubierto, los que faltaban no tenían por
  // dónde salir. Ahora cada tramo se puede quitar (y la jornada se reabre), y
  // mientras al caso le falten pacientes se puede mover la agenda.
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { user } = useAuthStore()
  const editable = !casoCerrado && !sinConfirmar && !soloVe
  const puedeQuitar = editable && ['coordinador', 'supervisor'].includes(user?.role)
  const faltanEnCaso = (cuenta?.pacientes_impactados ?? 0) > 0 ? (cuenta?.pacientes_pendientes ?? 0) : 0
  const cubiertaConFaltantes = yaResuelta && editable && faltanEnCaso > 0
  const { mutate: quitar, isPending: quitando } = useMutation({
    mutationFn: (id) => asignacionService.remove(id),
    onSuccess: (r) => {
      toast.success(r?.cancelled ? 'Tenía ejecución registrada: quedó cancelada.' : 'Quitado. La jornada quedó libre para cubrirla de nuevo.')
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
    onError: (e) => toast.error(e?.message ?? 'No se pudo quitar'),
  })
  const pedirQuitar = async (t) => {
    const si = await confirm({
      title: 'Quitar a quien cubre',
      message: `${t.resource?.name ?? 'Esta persona'} deja de cubrir ${t.start_time}–${t.end_time}. Luego puedes elegir a otra.`,
      confirmLabel: 'Sí, quitar',
      cancelLabel: 'Cancelar',
    })
    if (si) quitar(t.id)
  }

  return (
    <div className={`card ${yaResuelta ? 'border-indigo-200 bg-indigo-50/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 capitalize">{franja.weekday}</span>
            <span className="text-sm text-gray-700">{franja.start_time}–{franja.end_time}</span>
            {franja.patient_capacity > 0 && (
              <Badge variant="red">{franja.patient_capacity} pac.</Badge>
            )}
          </div>

          <div className="text-xs text-gray-600 mt-1">
            📍 <strong>{franja.site?.name ?? '—'}</strong>
            {franja.site?.city ? ` (${franja.site.city})` : ''} · {franja.room?.name ?? '—'}
          </div>

          <div className="text-xs text-gray-500 mt-1">
            Coordina:{' '}
            {franja.coordinadores?.length
              ? franja.coordinadores.map((c) => c.name).join(', ')
              : <span className="text-gray-300">sin coordinador asignado a la sede</span>}
          </div>

          {franja.assistant && (
            <div className="text-xs text-gray-500 mt-0.5">Auxiliar: {franja.assistant.name}</div>
          )}

          {/* Quién atiende cada tramo y qué falta. Es lo que se le dice al
              paciente por teléfono: "a su hora, lo atiende el Dr. X". */}
          {tramos.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {tramos.map((t) => (
                <div key={t.id} className="text-xs text-indigo-900">
                  ✓ <span className="tabular-nums">{t.start_time}–{t.end_time}</span>
                  {' · '}<strong>{t.resource?.name}</strong>
                  {' · '}
                  <PacientesDelTramo
                    tramo={t}
                    ausencia={ausencia}
                    editable={editable && ['coordinador', 'supervisor', 'gerencia'].includes(user?.role)}
                    tope={(t.patient_capacity ?? 0) + faltanEnCaso}
                  />
                  {puedeQuitar && (
                    <button
                      type="button"
                      className="ml-2 text-[11px] text-red-600 hover:underline disabled:opacity-50"
                      disabled={quitando}
                      onClick={() => pedirQuitar(t)}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {!yaResuelta && huecos.map((h) => (
                <div key={h.start_time} className="text-xs text-amber-800">
                  ○ <span className="tabular-nums">{h.start_time}–{h.end_time}</span>
                  {' · '}falta cubrir · {h.pacientes ?? 0} pac.
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          {yaResuelta ? (
            <div className="text-right">
              <div className="text-[11px] text-indigo-500 uppercase tracking-wide font-semibold">🔄 Cubierta</div>
              <div className="text-sm font-medium text-indigo-900">
                {tramos.map((t) => t.resource?.name).filter(Boolean).join(' · ')}
              </div>
              {cubiertaConFaltantes && (
                <div className="mt-1.5 flex flex-col gap-1 items-end">
                  <div className="text-[11px] text-amber-700 font-semibold">Faltan {faltanEnCaso} pac. del caso</div>
                  <button
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      camino === 'mover' ? 'border-brand-400 bg-blue-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setCamino((c) => (c === 'mover' ? null : 'mover'))}
                  >
                    🔀 Mover la agenda
                  </button>
                </div>
              )}
            </div>
          ) : soloVe ? null : casoCerrado ? (
            <div className="text-right">
              <div className="text-[11px] text-emerald-600 uppercase tracking-wide font-semibold">✓ Caso terminado</div>
              <div className="text-xs text-gray-500">Se gestionó por llamada</div>
            </div>
          ) : sinPendientes ? (
            <div className="text-[11px] text-emerald-600 uppercase tracking-wide font-semibold sm:text-right">
              ✓ Pacientes reprogramados
            </div>
          ) : sinConfirmar ? (
            <div className="text-xs text-amber-800 sm:text-right max-w-[14rem]">
              {ausencia?.status === 'pendiente'
                ? 'Confirma la ausencia para cubrir esta jornada.'
                : 'Ausencia rechazada: no hay que cubrirla.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:items-end">
              {enParte && (
                <div className="text-[11px] text-amber-700 font-semibold sm:text-right">
                  Cubierta en parte · faltan {faltanPac} pac.
                </div>
              )}
              {/* Dos caminos, y la diferencia la decide el paciente: cambiar de
                  médico no lo mueve de día; mover la agenda sí, y por eso hay
                  que ir a ver dónde hay hueco antes de prometerle nada. */}
              <button
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  camino === 'medico'
                    ? 'border-brand-400 bg-blue-50 text-brand-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setCamino((c) => (c === 'medico' ? null : 'medico'))}
              >
                👤 Cambiar de {palabraDelRecurso(ausencia?.resource?.type)}
              </button>
              <button
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  camino === 'mover'
                    ? 'border-brand-400 bg-blue-50 text-brand-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setCamino((c) => (c === 'mover' ? null : 'mover'))}
              >
                🔀 Mover la agenda
              </button>
            </div>
          )}
        </div>
      </div>

      {camino === 'medico' && !yaResuelta && !sinConfirmar && !sinPendientes && huecos[0] && (
        <Candidatos
          key={huecos[0].start_time}
          franja={franja}
          ausencia={ausencia}
          hueco={huecos[0]}
          // Lo que falta en todo el caso. El servidor no deja que un tramo tome
          // más: si parte ya se reprogramó en otro horario, el tramo se queda
          // con lo que sobra, y la pantalla tiene que decir lo mismo.
          faltanEnElCaso={(cuenta?.pacientes_impactados ?? 0) > 0 ? cuenta.pacientes_pendientes : null}
          onListo={(completa) => { if (completa) setCamino(null) }}
        />
      )}

      {camino === 'mover' && (!yaResuelta || cubiertaConFaltantes) && !sinConfirmar && !sinPendientes && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-2">
            ¿Quién va a atender esos pacientes en el día nuevo?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/app/programador?caso=${ausencia.id}&quien=mismo`)}
            >
              <div className="text-xs font-semibold text-gray-800">El mismo {ausencia.resource?.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Recupera su propia agenda otro día. Va precargado en el Programador.
              </div>
            </button>
            <button
              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/app/programador?caso=${ausencia.id}&quien=otro`)}
            >
              <div className="text-xs font-semibold text-gray-800">Otro profesional</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Se hace cargo de esos pacientes. Lo eliges en el Programador.
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Los candidatos para lo que falta de la franja, separados por si tienen que
 * desplazarse.
 *
 * Oct-2026 · Hector: "cuando presiono Asignar ¿por qué toma como si fuera a
 * escoger todos? Me debe salir un modal diciendo cuántos pacientes puede, y
 * así poder seleccionar a más de uno". Antes había que acortar el horario
 * con Desde/Hasta antes de elegir; ahora se elige al médico y se dice cuántos
 * pacientes atiende. La hora sale sola (horaDeCorte): cada paciente conserva
 * la suya, y el siguiente médico sigue donde terminó el anterior.
 */
function Candidatos({ franja, ausencia, hueco, faltanEnElCaso, onListo }) {
  const qc = useQueryClient()
  const [elegido, setElegido] = useState(null)

  // Lo más que puede tomar un médico: lo que falta en esta franja, y nunca
  // más de lo que falta en todo el caso (el servidor pone el mismo tope).
  const pacHueco = hueco.pacientes ?? 0
  const tope = faltanEnElCaso != null ? Math.min(pacHueco, faltanEnElCaso) : pacHueco

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ['sugerir-reemplazo', franja.assignment_id, hueco.start_time, hueco.end_time],
    queryFn: () => recursoService.sugerirReemplazos({
      type: ausencia.resource?.type,
      day: franja.weekday,
      start_time: hueco.start_time,
      end_time: hueco.end_time,
      city: franja.site?.city,
      week_id: franja.week_id,
      room_id: franja.room_id,
    }),
  })

  const horaHasta = (n) => (n >= pacHueco
    ? hueco.end_time
    : horaDeCorte(franja.patient_capacity ?? 0,
      { desde: franja.start_time, hasta: franja.end_time }, hueco.start_time, n))

  const { mutate: asignar, isPending } = useMutation({
    mutationFn: ({ recursoId, n, motivo }) => asignacionService.create({
      week_id: franja.week_id,
      room_id: franja.room_id,
      resource_id: recursoId,
      assistant_id: franja.assistant_id,
      weekday: franja.weekday,
      start_time: hueco.start_time,
      end_time: horaHasta(n),
      expected_patients: n,
      is_replacement: true,
      covered_absence_id: ausencia.id,
      // Solo si la sede ya cerró esa semana: el servidor lo exige.
      ...(motivo ? { supervisor_reason: motivo } : {}),
    }, 'coordinador'),
    onSuccess: (_, { n }) => {
      toast.success('Reemplazo asignado. Ya aparece en el Programador.')
      setElegido(null)
      qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['ausencias-de-la-semana'] })
      qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
      // Si quedan pacientes en la franja, la lista sigue abierta para elegir
      // al siguiente médico.
      onListo(n >= pacHueco)
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo asignar el reemplazo'),
  })

  const mismaSede = candidatos.filter((c) => c.misma_sede)
  const otrasSedes = candidatos.filter((c) => !c.misma_sede)

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : candidatos.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded p-3">
          No hay nadie del mismo tipo libre en esa franja en {franja.site?.city ?? 'la ciudad'}.
          Toca reprogramar a los pacientes a otro día.
        </div>
      ) : (
        <>
          {mismaSede.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wider mb-2">
                Misma sede ({mismaSede.length})
              </div>
              <div className="space-y-2 mb-4">
                {mismaSede.map((r) => (
                  <Candidato key={r.id} r={r} onAsignar={() => setElegido(r)} disabled={isPending} />
                ))}
              </div>
            </>
          )}

          {otrasSedes.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2">
                Otras sedes de {franja.site?.city} ({otrasSedes.length})
              </div>
              <div className="space-y-2">
                {otrasSedes.map((r) => (
                  <Candidato key={r.id} r={r} onAsignar={() => setElegido(r)} disabled={isPending} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {elegido && (
        <CuantosPacientes
          medico={elegido}
          tope={tope}
          sedeCerrada={!!franja.sede_cerrada}
          guardando={isPending}
          onCancelar={() => setElegido(null)}
          onConfirmar={(n, motivo) => asignar({ recursoId: elegido.id, n, motivo })}
        />
      )}
    </div>
  )
}

/**
 * La ventana de Asignar: cuántos pacientes atiende este médico, y nada más
 * (Hector: "que me diga cuántos y ya"). La hora del tramo se calcula sola.
 * Si la sede ya cerró esa semana, pide además el motivo que exige el servidor.
 */
function CuantosPacientes({ medico, tope, sedeCerrada, guardando, onCancelar, onConfirmar }) {
  const [valor, setValor] = useState(String(tope))
  const [motivo, setMotivo] = useState('')
  const n = valor === '' ? 0 : Number(valor)
  const valido = Number.isInteger(n) && n >= 1 && n <= tope && (!sedeCerrada || motivo.trim().length >= 5)
  const confirmar = () => onConfirmar(n, sedeCerrada ? motivo.trim() : undefined)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !guardando && onCancelar()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Asignar a {medico.name}</h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          <label className="text-xs font-semibold text-gray-700 block" htmlFor="cuantos-pacientes">
            ¿Cuántos pacientes puede atender?
          </label>
          <div className="flex items-center gap-2">
            <input
              id="cuantos-pacientes"
              type="number" min={1} max={tope} inputMode="numeric" autoFocus
              value={valor}
              onChange={(e) => {
                // No deja escribir más de los que faltan.
                if (e.target.value !== '' && Number(e.target.value) > tope) return
                setValor(e.target.value)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && valido && !guardando) confirmar() }}
              className="input w-24 tabular-nums"
            />
            <span className="text-xs text-gray-500">de {tope} pacientes</span>
          </div>
          {sedeCerrada && (
            <div className="pt-2">
              <label className="text-xs font-semibold text-gray-700 block mb-1" htmlFor="motivo-sede-cerrada">
                Motivo (la sede ya cerró esta semana) <span className="text-red-600">*</span>
              </label>
              <input
                id="motivo-sede-cerrada"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="input text-xs"
                maxLength={300}
              />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn" onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={confirmar} disabled={!valido || guardando}>
            {guardando ? <Spinner size="sm" /> : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * CUBRIR A UNA AUXILIAR (PROYECTOS-3583 §4)
 *
 * La auxiliar no tiene agenda propia: acompaña los turnos de un médico. Lo que
 * se cae es la auxiliar de ESE turno, así que cubrirla es poner a otra en él.
 * Las candidatas salen en el orden de prioridad (su médico está ausente, no ha
 * completado sus 42 h, de otra jornada) y "Asignar" cambia la auxiliar del
 * turno con las validaciones de siempre. Cuando no queda ninguno, se da por
 * terminado: no pasa por un reprogramador.
 */
function TurnosQueAcompanaba({ ausencia, acompanaba, cubiertos }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const [abierto, setAbierto] = useState(null)
  const terminada = ausencia.reschedule_status === 'resuelta'
  const sinConfirmar = ausencia.status !== 'confirmada'
  const puedeTerminar = !terminada && !sinConfirmar && acompanaba.length === 0 && cubiertos.length > 0 &&
    ['coordinador', 'supervisor', 'gerencia'].includes(user?.role)

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['contexto-reemplazo', ausencia.id] })
    qc.invalidateQueries({ queryKey: ['ausencias-coord'] })
    qc.invalidateQueries({ queryKey: ['asignaciones'] })
  }
  const { mutate: terminar, isPending: terminando } = useMutation({
    mutationFn: () => ausenciaService.resolverReprogramacion(ausencia.id),
    onSuccess: () => { toast.success('Caso terminado.'); refrescar() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo terminar el caso'),
  })

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Turnos que acompañaba ({acompanaba.length + cubiertos.length})</h2>
        <div className="text-xs text-gray-500">{cubiertos.length} de {acompanaba.length + cubiertos.length} con reemplazo</div>
      </div>
      <div className="space-y-3">
        {cubiertos.map((c, i) => (
          <div key={`c${i}`} className="card p-3 text-xs border-emerald-200 bg-emerald-50/40">
            <div className="font-medium text-gray-900 capitalize">{c.weekday} {c.start_time}–{c.end_time} · {c.room} · con {c.medico}</div>
            <div className="text-emerald-800 mt-0.5">
              ✓ La cubre <strong>{c.nueva}</strong>
              {c.aviso_mismo_dia && <Badge variant="amber" className="ml-1">Aviso el mismo día</Badge>}
            </div>
          </div>
        ))}
        {acompanaba.map((t) => (
          <div key={t.assignment_id} className="card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900 capitalize">{t.weekday} {t.start_time}–{t.end_time} · {t.room?.name}</div>
                <div className="text-gray-500">{t.site?.name} · acompañaba a <strong>{t.medico}</strong></div>
              </div>
              {!terminada && !sinConfirmar && (
                <button className="btn text-xs" onClick={() => setAbierto(abierto === t.assignment_id ? null : t.assignment_id)}>
                  {abierto === t.assignment_id ? 'Cerrar' : 'Buscar reemplazo'}
                </button>
              )}
            </div>
            {abierto === t.assignment_id && (
              <CandidatasAuxiliar
                turno={t}
                ausencia={ausencia}
                onListo={() => { setAbierto(null); refrescar() }}
                confirm={confirm}
              />
            )}
          </div>
        ))}
      </div>
      {puedeTerminar && (
        <div className="mt-4 flex justify-end">
          <button className="btn-primary text-xs" disabled={terminando} onClick={() => terminar()}>
            {terminando ? <Spinner size="sm" /> : 'Dar por terminado'}
          </button>
        </div>
      )}
    </div>
  )
}

function CandidatasAuxiliar({ turno, ausencia, onListo, confirm }) {
  const { data: candidatas = [], isLoading } = useQuery({
    queryKey: ['sugerir-auxiliar', turno.assignment_id],
    queryFn: () => recursoService.sugerirReemplazos({
      type: ausencia.resource?.type,
      day: turno.weekday,
      start_time: turno.start_time,
      end_time: turno.end_time,
      city: turno.site?.city,
      week_id: turno.week_id,
      room_id: turno.room_id,
    }),
  })
  const { mutate: asignar, isPending } = useMutation({
    mutationFn: (r) => ausenciaService.cubrirAuxiliar(ausencia.id, turno.assignment_id, r.id),
    onSuccess: (_, r) => { toast.success(`${r.name} acompaña ese turno. Ya se le avisó.`); onListo() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo asignar'),
  })
  const elegir = async (r) => {
    if (r.aviso_mismo_dia) {
      const ok = await confirm({
        title: 'Aviso el mismo día',
        message: `${r.name} es de otra jornada y el turno es hoy. Llamarla el mismo día es una excepción y queda marcada.`,
        confirmLabel: 'Asignar igual',
      })
      if (!ok) return
    }
    asignar(r)
  }
  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!candidatas.length) {
    return <div className="mt-3 text-xs text-gray-500">No hay nadie libre para ese turno en {turno.site?.city ?? 'la ciudad'}.</div>
  }
  return (
    <div className="mt-3 space-y-2">
      {candidatas.map((r) => (
        <Candidato key={r.id} r={r} onAsignar={() => elegir(r)} disabled={isPending} />
      ))}
    </div>
  )
}

function Candidato({ r, onAsignar, disabled }) {
  const tipo = TIPOS_RECURSO.find((t) => t.value === r.type)
  const horas = r.horas_semana ?? r.assigned_hours ?? 0
  const max = r.max_hours_per_week ?? 42
  const pct = max ? Math.round((horas / max) * 100) : 0
  return (
    <div className="border border-gray-100 rounded-lg p-3 flex items-start gap-3 bg-white">
      <Avatar nombre={r.name} size="sm" color={tipo?.color ?? 'blue'} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
        <div className="text-xs text-gray-500">
          {tipo?.label}{r.specialty ? ' · ' + r.specialty : ''} · {horas}h de {max}h en la semana ({pct}%)
        </div>

        {/* 3583 · Auxiliares y asesores: el orden de prioridad y por qué. */}
        {r.prioridad && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge variant={r.prioridad === 1 ? 'green' : r.prioridad === 2 ? 'blue' : 'gray'}>
              Prioridad {r.prioridad} · {r.prioridad_motivo}
            </Badge>
            {r.aviso_mismo_dia && <Badge variant="amber">Aviso el mismo día · excepción</Badge>}
          </div>
        )}

        {/* Dónde está ese día, si ya tiene turnos. Hector pidió quitar "Tiene
            el día libre" y "Tiene que desplazarse a esta sede": sin turnos no
            se dice nada, y el desplazamiento ya lo dice el grupo en que sale. */}
        {(r.ocupacion_ese_dia ?? []).length > 0 && (
          <div className="text-xs text-gray-600 mt-1">
            <span className="text-gray-400">Ese día ya está en:</span>
            {(r.ocupacion_ese_dia ?? []).map((o, i) => (
              <div key={i} className="ml-1">
                · {o.start_time}–{o.end_time} · <strong>{o.site}</strong> / {o.room}
                {o.liberada && <span className="text-green-700"> · turno caído, está libre</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn-primary text-xs flex-shrink-0" onClick={onAsignar} disabled={disabled}>
        Asignar
      </button>
    </div>
  )
}
