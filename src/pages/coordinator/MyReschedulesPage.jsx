import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ausenciaService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Spinner, EmptyState, Badge } from '@/components/ui'
import { TIPOS_RECURSO, parseFechaLocal } from '@/utils/helpers'

/**
 * MIS REPROGRAMACIONES (oct-2026)
 * ===============================
 *
 * Dos roles la usan y hacen cosas distintas. Confundirlo costó dos vueltas:
 *
 *   reprogramador — NO reprograma. Hector: "¿por qué el reprogramador debe
 *     reprogramar? El reprogramador solamente mira a qué profesional le
 *     asignaron y que él mismo ponga cuántos pacientes fueron los que llamó,
 *     cuáles contestaron y cuáles no, para así ver en el indicador de su
 *     personal". Ve sus encargos y anota el resultado de las llamadas. No
 *     mueve agendas ni busca reemplazos: ni siquiera entra a esa pantalla.
 *
 *   coordinador — sí resuelve. Los casos de técnicos, auxiliares y asesores
 *     de su sede son suyos de entrada, y los trabaja en la pantalla del caso.
 *
 * El recorte lo hace el servidor, no esta pantalla. Si estuviera aquí,
 * bastaría con mirar la respuesta de red para ver lo que no te toca.
 */

const TIPO_LABEL = Object.fromEntries(TIPOS_RECURSO.map((t) => [t.value, t.label]))

/** El rango de días del caso, dicho como lo diría una persona. */
function cuando(caso) {
  const ini = parseFechaLocal(caso.start_date)
  const fin = parseFechaLocal(caso.end_date)
  if (!ini) return 'sin fecha'
  const mismoDia = !fin || ini.getTime() === fin.getTime()
  if (mismoDia) return format(ini, "EEEE d 'de' MMMM", { locale: es })
  return `${format(ini, 'EEEE d', { locale: es })} al ${format(fin, "EEEE d 'de' MMMM", { locale: es })}`
}

/**
 * Las horas del caso.
 *
 * Una ausencia parcial trae su propio horario. Una de día completo no tiene
 * hora de ausencia y aun así los turnos tenían la suya, así que se muestran
 * las de las franjas que se cayeron: sin eso, "jueves" no dice si hay que
 * mover la mañana, la tarde o el día entero.
 */
function horario(caso) {
  if (caso.is_partial && caso.absence_start_time && caso.absence_end_time) {
    return `${caso.absence_start_time}–${caso.absence_end_time}`
  }
  const horas = [...new Set(caso.franjas.map((f) => `${f.start_time}–${f.end_time}`))]
  if (horas.length === 0) return null
  if (horas.length <= 2) return horas.join(' · ')
  return `${horas.length} turnos`
}

function Dato({ valor, etiqueta, color = 'text-gray-900' }) {
  return (
    <div className="card">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{valor}</div>
      <div className="text-xs text-gray-500">{etiqueta}</div>
    </div>
  )
}

/** Las franjas que se cayeron, dichas completas. */
function AgendaCaida({ caso }) {
  if (caso.sin_semana) {
    return (
      <p className="text-xs text-gray-500">
        Esa semana no quedó programada, así que no hay turnos registrados. Confírmalo con la líder antes de llamar.
      </p>
    )
  }
  if (caso.franjas.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No hay turnos cargados para esos días: puede que la agenda no se alcanzara a programar.
        Confírmalo con la líder antes de llamar.
      </p>
    )
  }
  return (
    <ul className="space-y-1">
      {caso.franjas.map((f, i) => (
        <li key={i} className="text-xs text-gray-700">
          <span className="capitalize">{f.weekday}</span>{' '}
          <strong className="tabular-nums">{f.start_time}–{f.end_time}</strong>
          {f.site && <> · {f.site}</>}
          {f.room && <> · {f.room}</>}
          {f.patient_capacity > 0 && <> · <strong>{f.patient_capacity}</strong> pacientes</>}
        </li>
      ))}
    </ul>
  )
}

/**
 * Qué pasó con esa agenda, y qué decirle al paciente.
 *
 * Hector: "hay que ser más explicativo para que los usuarios entiendan, que
 * diga que la agenda antes era del doc tal y lo reemplaza a tal hora". Quien
 * llama necesita la frase exacta, no deducirla de una barra de progreso.
 *
 * El mensaje cambia según el caso, que es lo que lo hace útil: no es lo mismo
 * "sigue igual, solo cambia el médico" que "hay que moverlo de día".
 */
function QuePaso({ caso }) {
  const cubren = caso.cuenta.quienes_cubren ?? []

  if (cubren.length === 0) {
    return (
      <div className="text-xs">
        <p className="text-amber-800">
          <strong>Todavía nadie cubre esta agenda.</strong>
        </p>
        <p className="text-gray-600 mt-1">
          {caso.reschedule_notes
            ? 'Al paciente hay que moverlo: sigue la indicación que te dejaron arriba.'
            : 'Consulta con la líder qué hacer con estos pacientes antes de llamar.'}
        </p>
      </div>
    )
  }

  // ¿El reemplazo cae en el mismo hueco? Entonces el paciente no mueve su
  // cita, y eso es lo primero que hay que decirle.
  const encaja = (c) => caso.franjas.some(
    (f) => f.weekday === c.dia && f.start_time === c.desde && f.end_time === c.hasta && f.site === c.sede
  )
  const todosEncajan = cubren.every(encaja)

  return (
    <div className="text-xs">
      <ul className="space-y-1">
        {cubren.map((c, i) => (
          <li key={i} className="text-emerald-900">
            Lo cubre <strong>{c.nombre}</strong> —{' '}
            <span className="capitalize">{c.dia}</span>{' '}
            <strong className="tabular-nums">{c.desde}–{c.hasta}</strong>
            {c.sede && <> · {c.sede}</>}
            {c.consultorio && <> · {c.consultorio}</>}
            {c.pacientes > 0 && <> · {c.pacientes} pacientes</>}
          </li>
        ))}
      </ul>
      {todosEncajan && (
        <p className="text-gray-700 mt-1.5">
          Mismo día, misma hora y misma sede: el paciente conserva su cita y solo cambia de profesional.
        </p>
      )}
    </div>
  )
}

/** El encargo: de quién viene y qué dijo. Es la mitad de la instrucción. */
function Encargo({ caso }) {
  if (!caso.asignada_por) return null
  return (
    <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
      <span className="text-blue-900">
        Asignado por <strong>{caso.asignada_por}</strong>
        {caso.assigned_at && <> · {format(new Date(caso.assigned_at), "d 'de' MMMM", { locale: es })}</>}
      </span>
      {caso.reschedule_notes && (
        <p className="text-blue-800 mt-0.5 italic">«{caso.reschedule_notes}»</p>
      )}
    </div>
  )
}

/**
 * El registro de llamadas. Es TODO el trabajo de quien recibe el encargo.
 *
 * Se piden dos números y el tercero se calcula. Pedir los tres deja meter
 * "llamé a 10, contestaron 8, no contestaron 5", que no quiere decir nada.
 */
function Llamadas({ caso, onGuardar, guardando }) {
  const ya = caso.llamadas ?? {}
  const sinEmpezar = ya.contestaron == null && ya.no_contestaron == null
  const [contestaron, setContestaron] = useState(ya.contestaron ?? '')
  const [noContestaron, setNoContestaron] = useState(ya.no_contestaron ?? '')

  // Oct-2026 · El número real de pacientes lo pone la líder en el caso; aquí
  // solo se ve. Hector: "en el momento del proceso de repro, en líder es
  // donde pone los datos de los pacientes reales afectados".
  const n = (v) => (v === '' ? 0 : Number(v))
  const llamados = n(contestaron) + n(noContestaron)
  const total = caso.cuenta.pacientes_oficiales ?? 0
  const faltan = Math.max(0, total - llamados)
  const sePasa = total > 0 && llamados > total
  const cambio =
    n(contestaron) !== (ya.contestaron ?? 0) ||
    n(noContestaron) !== (ya.no_contestaron ?? 0)

  return (
    <div className="border-t border-gray-100 pt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
        Tus llamadas
      </h4>
      <p className="text-xs text-gray-500 mb-2">
        {sinEmpezar
          ? `Anota cuántos de los ${total || 'los'} pacientes lograste contactar. Puedes guardar varias veces; escribe siempre el total que llevas.`
          : 'Actualiza los números cada vez que avances; se guarda el último valor, no se suma al anterior.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          <span className="block mb-1">Contestaron</span>
          <input
            type="number" min="0" inputMode="numeric"
            id={`contestaron-${caso.id}`}
            value={contestaron}
            onChange={(e) => setContestaron(e.target.value)}
            className="input w-24 tabular-nums"
            placeholder="0"
          />
        </label>
        <label className="text-xs text-gray-600">
          <span className="block mb-1">No contestaron</span>
          <input
            type="number" min="0" inputMode="numeric"
            id={`no-contestaron-${caso.id}`}
            value={noContestaron}
            onChange={(e) => setNoContestaron(e.target.value)}
            className="input w-24 tabular-nums"
            placeholder="0"
          />
        </label>

        {/* Oct-2026 · Solo para ver (Hector: "Pacientes reales (SOLO
            VISUAL)"). Los pone la líder en el caso. */}
        <label className="text-xs text-gray-600">
          <span className="block mb-1">Pacientes reales</span>
          <input
            type="number" readOnly tabIndex={-1}
            id={`oficiales-${caso.id}`}
            value={total}
            title="Los pone la líder en el caso"
            className="input w-24 tabular-nums bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </label>

        <div className="text-xs text-gray-600 pb-2">
          <strong className="text-gray-900 tabular-nums">{llamados}</strong> llamados
          {total > 0 && <> de <strong className="text-gray-900 tabular-nums">{total}</strong></>}
          {total > 0 && faltan > 0 && <> · <span className="text-amber-700">faltan {faltan}</span></>}
          {total > 0 && faltan === 0 && !sePasa && <> · <span className="text-emerald-700">completo</span></>}
        </div>

        <button
          type="button"
          disabled={guardando || sePasa || (!cambio && !sinEmpezar)}
          onClick={() => onGuardar({
            reached: n(contestaron),
            noAnswer: n(noContestaron),
          })}
          className="btn-primary ml-auto"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {sePasa && (
        <p className="text-xs text-red-700 mt-2">
          Son {llamados} llamadas sobre una agenda de {total} pacientes. Revisa los números.
        </p>
      )}
      {ya.registradas_en && !cambio && (
        <p className="text-xs text-gray-400 mt-2">
          Última anotación: {format(new Date(ya.registradas_en), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
        </p>
      )}
    </div>
  )
}

/** Avance del reemplazo. Es lo que mira el coordinador, que sí resuelve. */
function Avance({ cuenta }) {
  const total = cuenta.pacientes_impactados
  const hechos = Math.min(cuenta.pacientes_cubiertos, total)
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0

  if (total === 0) {
    return <p className="text-xs text-gray-400">Sin pacientes afectados · queda el turno por cubrir</p>
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-gray-600">
          <strong className="text-gray-900">{hechos}</strong> de <strong className="text-gray-900">{total}</strong> pacientes reprogramados
        </span>
        {cuenta.pacientes_pendientes > 0 && (
          <span className="text-red-700 font-semibold">faltan {cuenta.pacientes_pendientes}</span>
        )}
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${cuenta.resuelto ? 'bg-emerald-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * El estado de un caso, que es lo que decide su color en el cronograma.
 *
 * Hector: "si ya hizo las llamadas completas a todos los pacientes que se
 * muestre en un color". Verde solo cuando de verdad están todas: a medias es
 * azul, y sin empezar, ámbar. Un verde optimista es peor que ningún color.
 */
function estadoDeLlamadas(caso) {
  if (caso.reschedule_status === 'resuelta') return { clave: 'cerrada', label: 'Terminada', punto: 'bg-gray-400', fondo: 'bg-gray-50 border-gray-200' }
  if (caso.llamadas?.completa) return { clave: 'completa', label: 'Llamadas completas', punto: 'bg-emerald-500', fondo: 'bg-emerald-50 border-emerald-300' }
  if ((caso.llamadas?.llamados ?? 0) > 0) return { clave: 'curso', label: 'Llamando', punto: 'bg-blue-500', fondo: 'bg-blue-50 border-blue-300' }
  return { clave: 'sin', label: 'Sin llamar', punto: 'bg-amber-400', fondo: 'bg-amber-50 border-amber-300' }
}

/**
 * CRONOGRAMA · la cadena completa, por día.
 *
 * Hector: "que aparezca el cronograma pero solamente mediante el perfil las
 * reprogramaciones asignadas, así desde el que se ausentó hasta el que se
 * reprogramó".
 *
 * Cada fila es un día y dentro van sus casos: quién faltó, a qué hora, y
 * quién recogió esa agenda. El color dice en qué va el teléfono.
 */
function Cronograma({ casos, onIrALista }) {
  const porDia = new Map()
  for (const c of casos) {
    const k = String(c.start_date).slice(0, 10)
    if (!porDia.has(k)) porDia.set(k, [])
    porDia.get(k).push(c)
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        {['sin', 'curso', 'completa', 'cerrada'].map((k) => {
          const e = estadoDeLlamadas(
            k === 'cerrada' ? { reschedule_status: 'resuelta' }
              : k === 'completa' ? { llamadas: { completa: true } }
                : k === 'curso' ? { llamadas: { llamados: 1 } } : { llamadas: {} }
          )
          return (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${e.punto}`} />
              {e.label}
            </span>
          )
        })}
      </div>

      {dias.map(([dia, delDia]) => (
        <div key={dia}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 first-letter:uppercase">
            {format(parseFechaLocal(dia), "EEEE d 'de' MMMM", { locale: es })}
          </h3>
          <div className="space-y-2">
            {delDia.map((c) => {
              const e = estadoDeLlamadas(c)
              const cubren = c.cuenta.quienes_cubren ?? []
              const meta = c.cuenta.pacientes_oficiales
              const hechos = c.llamadas?.llamados ?? 0
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={onIrALista}
                  className={`w-full text-left border rounded-lg px-3 py-2.5 ${e.fondo} hover:shadow-sm transition-shadow`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.punto}`} />
                    <span className="text-sm font-medium text-gray-900">{c.resource?.name}</span>
                    <span className="text-xs text-gray-500">faltó</span>
                    {c.franjas[0] && (
                      <span className="text-xs text-gray-700 tabular-nums">
                        {c.franjas[0].start_time}–{c.franjas[0].end_time}
                      </span>
                    )}
                    {c.franjas[0]?.site && <span className="text-xs text-gray-500">· {c.franjas[0].site}</span>}
                  </div>

                  {/* La cadena: de quién era la agenda y quién la recogió. */}
                  <div className="mt-1 text-xs text-gray-700 pl-5">
                    {cubren.length > 0 ? (
                      <>
                        <span className="text-gray-400">↳ la cubre</span>{' '}
                        {cubren.map((q) => q.nombre).join(', ')}
                        {cubren[0] && (
                          <span className="tabular-nums"> · {cubren[0].desde}–{cubren[0].hasta}</span>
                        )}
                        {cubren[0]?.sede && <> · {cubren[0].sede}</>}
                      </>
                    ) : (
                      <span className="text-gray-400">↳ todavía sin reemplazo</span>
                    )}
                  </div>

                  <div className="mt-1 pl-5 text-xs">
                    <span className="text-gray-600 tabular-nums">{hechos} de {meta} pacientes llamados</span>
                    <span className="text-gray-400"> · {e.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Un rótulo de sección dentro de la tarjeta. Sin título deja el hueco en
 * pantalla ancha, para que su contenido quede a la altura del de al lado.
 */
function Seccion({ titulo, children }) {
  return (
    <div>
      {titulo
        ? <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{titulo}</h4>
        : <h4 aria-hidden="true" className="hidden sm:block invisible text-[11px] font-semibold mb-1.5">&nbsp;</h4>}
      {children}
    </div>
  )
}

/**
 * UNA TARJETA POR AUSENCIA (Hector, 21-oct, con boceto): arriba el médico
 * ausente; debajo, una fila por cada médico que cubre con sus columnas
 * Contestaron · No contestaron · Pacientes. Una ausencia siempre la lleva un
 * solo reprogramador, así que todo va en un solo bloque y un solo Guardar.
 * Las llamadas se guardan en cada turno; el caso queda con la suma.
 */
function TablaDeLlamadas({ caso, onGuardar, guardando }) {
  const cubren = caso.cuenta.quienes_cubren ?? []
  const [filas, setFilas] = useState(() => Object.fromEntries(cubren.map((c) => [c.id, {
    contestaron: c.contestaron ?? '', noContestaron: c.no_contestaron ?? '',
  }])))
  const n = (v) => (v === '' || v == null ? 0 : Number(v))
  const poner = (id, campo, v) => setFilas((f) => ({ ...f, [id]: { ...f[id], [campo]: v } }))
  const sePasa = (c) => n(filas[c.id]?.contestaron) + n(filas[c.id]?.noContestaron) > (c.pacientes ?? 0)
  const algunaSePasa = cubren.some(sePasa)
  const cambio = cubren.some((c) =>
    n(filas[c.id]?.contestaron) !== (c.contestaron ?? 0) || n(filas[c.id]?.noContestaron) !== (c.no_contestaron ?? 0) ||
    (c.contestaron == null && filas[c.id]?.contestaron !== '') || (c.no_contestaron == null && filas[c.id]?.noContestaron !== ''))
  const tot = cubren.reduce((a, c) => ({
    contestaron: a.contestaron + n(filas[c.id]?.contestaron),
    noContestaron: a.noContestaron + n(filas[c.id]?.noContestaron),
    pacientes: a.pacientes + (c.pacientes ?? 0),
  }), { contestaron: 0, noContestaron: 0, pacientes: 0 })
  const ya = caso.llamadas ?? {}
  const celda = 'px-2 py-1.5 border-b border-gray-100'
  const input = 'input w-20 py-1 text-xs tabular-nums'

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
              <th className={`${celda} font-semibold`}>Lo cubre</th>
              <th className={`${celda} font-semibold`}>Contestaron</th>
              <th className={`${celda} font-semibold`}>No contestaron</th>
              <th className={`${celda} font-semibold text-right`}>Pacientes</th>
            </tr>
          </thead>
          <tbody>
            {cubren.map((c) => (
              <tr key={c.id}>
                <td className={celda}>
                  <div className="font-medium text-gray-900">{c.nombre}</div>
                  <div className="text-gray-500">
                    <span className="capitalize">{c.dia}</span> <span className="tabular-nums">{c.desde}–{c.hasta}</span>
                    {c.sede && <> · {c.sede}</>}{c.consultorio && <> · {c.consultorio}</>}
                  </div>
                </td>
                <td className={celda}>
                  <input type="number" min="0" inputMode="numeric" className={input} placeholder="0"
                    value={filas[c.id]?.contestaron ?? ''} onChange={(e) => poner(c.id, 'contestaron', e.target.value)} />
                </td>
                <td className={celda}>
                  <input type="number" min="0" inputMode="numeric" className={input} placeholder="0"
                    value={filas[c.id]?.noContestaron ?? ''} onChange={(e) => poner(c.id, 'noContestaron', e.target.value)} />
                </td>
                <td className={`${celda} text-right tabular-nums ${sePasa(c) ? 'text-red-700 font-semibold' : 'text-gray-900'}`}>
                  {c.pacientes ?? 0}
                </td>
              </tr>
            ))}
            <tr className="font-semibold text-gray-900">
              <td className="px-2 py-1.5">Total</td>
              <td className="px-2 py-1.5 tabular-nums">{tot.contestaron}</td>
              <td className="px-2 py-1.5 tabular-nums">{tot.noContestaron}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{tot.pacientes}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {algunaSePasa && <span className="text-xs text-red-700">Hay una fila con más llamadas que pacientes.</span>}
        {(caso.cuenta.pacientes_pendientes ?? 0) > 0 && (
          <span className="text-xs text-amber-700">{caso.cuenta.pacientes_pendientes} pacientes todavía sin médico.</span>
        )}
        {ya.registradas_en && !cambio && (
          <span className="text-xs text-gray-400">
            Última anotación: {format(new Date(ya.registradas_en), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
          </span>
        )}
        <button
          type="button"
          className="btn-primary ml-auto"
          disabled={guardando || algunaSePasa || !cambio}
          onClick={() => onGuardar({
            tramos: cubren.map((c) => ({ assignmentId: c.id, reached: n(filas[c.id]?.contestaron), noAnswer: n(filas[c.id]?.noContestaron) })),
          })}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function Caso({ caso, llamador, onAbrir, onGuardar, onCerrar, guardando, cerrando }) {
  const cerrado = caso.reschedule_status === 'resuelta'
  const horas = horario(caso)
  const sedes = caso.sedes.map((s) => s.name).join(' · ')

  return (
    <li className="card">
      {/* Cabecera: de quién es la agenda y cuándo se cayó. Dos casos del mismo
          profesional solo se distinguen por la fecha, así que va arriba. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Agenda de {caso.resource?.name}
            </h3>
            <Badge variant="gray">{TIPO_LABEL[caso.resource?.type] ?? caso.resource?.type}</Badge>
            {caso.status === 'pendiente' && <Badge variant="amber">Ausencia por confirmar</Badge>}
            {cerrado && <Badge variant="green">Terminada</Badge>}
            {caso.is_partial && <Badge variant="blue">Falta solo parte del día</Badge>}
          </div>
          <p className="text-xs text-gray-600 mt-1 first-letter:uppercase">
            {cuando(caso)}
            {horas && <> · {horas}</>}
            {sedes && <> · {sedes}</>}
          </p>
          {caso.motivo_catalogo && (
            <p className="text-xs text-gray-400 mt-0.5">Motivo: {caso.motivo_catalogo}</p>
          )}
        </div>

        {/* Quien llama no abre la pantalla de reemplazo: no decide el
            reemplazo. Su única acción es dar el caso por terminado. */}
        {llamador ? (
          !cerrado && (
            <button
              type="button"
              onClick={() => onCerrar(caso.id)}
              disabled={cerrando}
              className="btn shrink-0"
            >
              {cerrando ? 'Cerrando…' : 'Dar por terminada'}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => onAbrir(caso.id)}
            className={cerrado ? 'btn shrink-0' : 'btn-primary shrink-0'}
          >
            {cerrado ? 'Ver detalles' : 'Trabajar'}
          </button>
        )}
      </div>

      <Encargo caso={caso} />

      {llamador && (caso.cuenta.quienes_cubren ?? []).length > 0 ? (
        <TablaDeLlamadas caso={caso} onGuardar={(datos) => onGuardar(caso.id, datos)} guardando={guardando === caso.id} />
      ) : llamador ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Seccion titulo="Jornadas afectadas">
              <AgendaCaida caso={caso} />
            </Seccion>
            <Seccion>
              <QuePaso caso={caso} />
            </Seccion>
          </div>
          <Llamadas caso={caso} onGuardar={(datos) => onGuardar(caso.id, datos)} guardando={guardando === caso.id} />
        </div>
      ) : caso.sin_semana ? (
        <p className="text-xs text-gray-400 mt-3">
          Esa semana no está programada, así que no hay agenda caída que reubicar.
        </p>
      ) : (
        <div className="mt-3"><Avance cuenta={caso.cuenta} /></div>
      )}
    </li>
  )
}

export default function MyReschedulesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [verCerradas, setVerCerradas] = useState(false)
  // La vista vive en la URL para que el menú pueda enlazar directo al
  // cronograma, igual que hacen las tarjetas de Gestión de ausencias.
  const [params, setParams] = useSearchParams()
  const cronograma = params.get('vista') === 'cronograma'
  const verLista = () => setParams({})

  // Quien recibe encargos llama y anota; no resuelve el reemplazo.
  const llamador = user?.role === 'reprogramador'

  const { data, isLoading } = useQuery({
    queryKey: ['mis-reprogramaciones', verCerradas],
    queryFn: () => ausenciaService.misReprogramaciones(verCerradas ? { incluir_cerradas: 'true' } : {}),
  })

  const guardar = useMutation({
    mutationFn: ({ id, datos }) => ausenciaService.registrarLlamadas(id, datos),
    onSuccess: () => {
      toast.success('Llamadas registradas')
      qc.invalidateQueries({ queryKey: ['mis-reprogramaciones'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'No se pudo guardar'),
  })

  const cerrar = useMutation({
    mutationFn: (id) => ausenciaService.resolverReprogramacion(id),
    onSuccess: () => {
      toast.success('Caso dado por terminado')
      qc.invalidateQueries({ queryKey: ['mis-reprogramaciones'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'No se pudo cerrar'),
  })

  const casos = data?.casos ?? []
  const resumen = data?.resumen ?? {}
  const ll = resumen.llamadas ?? {}

  const alcance = llamador
    ? 'Las agendas que te asignaron.'
    : user?.role === 'coordinador'
      ? 'Técnicos, auxiliares y asesores de tu sede. Las agendas de profesionales las reparte la líder.'
      : 'Todo el reparto: lo asignado a los reprogramadores y lo que llevan los coordinadores.'

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-lg font-semibold text-gray-900">
          {cronograma ? 'Cronograma de mis reprogramaciones' : 'Mis reprogramaciones'}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {llamador && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={verLista}
                className={`px-3 py-1.5 ${cronograma ? 'bg-white text-gray-600' : 'bg-gray-100 text-gray-900 font-medium'}`}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setParams({ vista: 'cronograma' })}
                className={`px-3 py-1.5 border-l border-gray-200 ${cronograma ? 'bg-gray-100 text-gray-900 font-medium' : 'bg-white text-gray-600'}`}
              >
                Cronograma
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              id="ver-cerradas"
              checked={verCerradas}
              onChange={(e) => setVerCerradas(e.target.checked)}
              className="rounded border-gray-300"
            />
            Mostrar las ya terminadas
          </label>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">{alcance}</p>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {/* El indicador de quien llama es otro que el de quien resuelve. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {llamador ? (
              <>
                <Dato valor={resumen.abiertos ?? 0} etiqueta="Agendas a su cargo" />
                <Dato
                  valor={`${ll.llamados ?? 0} / ${resumen.pacientes_impactados ?? 0}`}
                  etiqueta="Pacientes ya llamados"
                  color="text-blue-700"
                />
                <Dato
                  valor={ll.contestaron ?? 0}
                  etiqueta={ll.efectividad == null ? 'Contestaron · aún sin llamadas' : `Contestaron · ${ll.efectividad}% de sus llamadas`}
                  color="text-emerald-700"
                />
                <Dato valor={ll.por_llamar ?? 0} etiqueta="Por llamar" color="text-amber-700" />
              </>
            ) : (
              <>
                <Dato valor={resumen.abiertos ?? 0} etiqueta="Casos por trabajar" />
                <Dato valor={resumen.pacientes_pendientes ?? 0} etiqueta="Pacientes sin reprogramar" color="text-red-700" />
                <Dato valor={resumen.cerrados ?? 0} etiqueta="Ya gestionados" color="text-gray-400" />
              </>
            )}
          </div>

          {casos.length === 0 ? (
            <EmptyState
              icon="✅"
              title={llamador ? 'No tienes agendas asignadas' : 'No tienes agendas por reprogramar'}
              description={
                verCerradas
                  ? 'No hay casos a tu nombre, ni abiertos ni terminados.'
                  : llamador
                    ? 'Cuando la líder te asigne una agenda caída, el caso aparece acá con sus indicaciones.'
                    : 'Cuando alguien de tu reparto falte y deje pacientes sin atender, el caso aparece acá.'
              }
            />
          ) : cronograma ? (
            <Cronograma casos={casos} onIrALista={verLista} />
          ) : (
            <ul className="space-y-3">
              {casos.map((c) => (
                <Caso
                  key={c.id}
                  caso={c}
                  llamador={llamador}
                  onAbrir={(id) => navigate(`/app/reemplazo/${id}`)}
                  onGuardar={(id, datos) => guardar.mutate({ id, datos })}
                  onCerrar={(id) => cerrar.mutate(id)}
                  guardando={guardar.isPending ? guardar.variables?.id : null}
                  cerrando={cerrar.isPending && cerrar.variables === c.id}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
