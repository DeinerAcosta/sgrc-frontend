import { useNavigate } from 'react-router-dom'
import { Badge, Spinner, EmptyState } from '@/components/ui'

/**
 * AVISO DE AUSENTES DE LA SEMANA ANTERIOR (PROYECTOS-3398 §7)
 * ==========================================================
 *
 * Se abre cuando el coordinador trae la semana anterior al Programador, que es
 * el momento exacto en que el problema ocurre: copiar replica la semana COMO SE
 * PROGRAMÓ, no como pasó. Si un oftalmólogo faltó el miércoles, la copia le
 * vuelve a poner ese miércoles y la agenda que se cayó no la recupera nadie,
 * porque para cuando alguien se acuerda ya pasó la semana.
 *
 * El aviso separa dos situaciones que piden cosas distintas:
 *
 *   SIN PROGRAMAR — faltó y en la semana que se está armando no tiene ni una
 *   hora. Es el caso urgente: si no se agrega aquí, se queda fuera. Va arriba.
 *
 *   YA PROGRAMADO — faltó pero la copia ya le puso turnos. No hay nada que
 *   agregar; lo que falta es decidir si ahí mismo repone lo que se cayó. Su
 *   casilla queda resaltada en la grilla para poder revisarla.
 *
 * La fecha que el profesional propuso al registrar la ausencia (§4) se muestra
 * en grande: es el dato con el que el coordinador decide en qué día ubicarlo, y
 * hasta ahora vivía enterrado en un campo de texto libre.
 */
export default function AvisoAusentesSemanaAnterior({ datos, cargando, onClose }) {
  const navigate = useNavigate()

  const ausentes = datos?.ausentes ?? []
  const sinProgramar = ausentes.filter((a) => a.pendiente)
  const yaProgramados = ausentes.filter((a) => !a.pendiente)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl my-4 flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Ausencias de la semana anterior</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {datos?.semana_anterior
                ? `Semana del ${fechaCorta(datos.semana_anterior.desde)} al ${fechaCorta(datos.semana_anterior.hasta)}`
                : 'Revisando…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {cargando && <div className="py-10 flex justify-center"><Spinner /></div>}

          {!cargando && ausentes.length === 0 && (
            <EmptyState
              icon="✅"
              title="Nadie faltó la semana anterior"
              description="No hay agendas caídas que recuperar en esta programación."
            />
          )}

          {sinProgramar.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-amber-800 mb-1">
                Sin programar en esta semana ({sinProgramar.length})
              </h3>
              <p className="text-[11px] text-gray-500 mb-2">
                Faltaron la semana pasada y aquí no tienen ni una hora asignada. Si no se
                agregan ahora, quedan fuera de la programación.
              </p>
              <div className="space-y-2">
                {sinProgramar.map((a) => <FilaAusente key={a.absence_id} a={a} urgente />)}
              </div>
            </section>
          )}

          {yaProgramados.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-700 mb-1">
                Ya tienen horas en esta semana ({yaProgramados.length})
              </h3>
              <p className="text-[11px] text-gray-500 mb-2">
                La copia les puso turnos. Sus casillas quedan resaltadas en la grilla para
                que decidas si ahí reponen la agenda que se cayó.
              </p>
              <div className="space-y-2">
                {yaProgramados.map((a) => <FilaAusente key={a.absence_id} a={a} />)}
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            className="btn text-xs"
            onClick={() => { onClose(); navigate('/app/ausencias') }}
          >
            Ir a Gestión de ausencias
          </button>
          <button type="button" className="btn-primary text-xs" onClick={onClose}>
            Entendido, a programar
          </button>
        </div>
      </div>
    </div>
  )
}

function FilaAusente({ a, urgente = false }) {
  const r = a.resource
  return (
    <div className={`border rounded-lg p-3 ${urgente ? 'border-amber-300 bg-amber-50/60' : 'border-gray-150 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900">{r.name}</div>
          <div className="text-[11px] text-gray-500 capitalize">
            {r.type}{r.specialty ? ` · ${r.specialty}` : ''}
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            Faltó {a.desde === a.hasta
              ? `el ${fechaCorta(a.desde)}`
              : `del ${fechaCorta(a.desde)} al ${fechaCorta(a.hasta)}`}
            {a.es_parcial && ' (parcial)'} · {a.motivo}
          </div>
          {a.pacientes_impactados > 0 && (
            <div className="text-[11px] text-red-700 mt-0.5">
              {a.pacientes_impactados} paciente{a.pacientes_impactados === 1 ? '' : 's'} sin atender
            </div>
          )}
          {a.observaciones_reposicion && (
            <div className="text-[11px] text-gray-500 italic mt-1">"{a.observaciones_reposicion}"</div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          {/* §4 · La fecha que el profesional propuso para reponer. Es lo primero
              que el coordinador mira para saber dónde ubicarlo. */}
          {a.fecha_reposicion_propuesta ? (
            <>
              <div className="text-[10px] text-gray-500">Dijo que repondría</div>
              <div className="text-xs font-semibold text-gray-900">{fechaCorta(a.fecha_reposicion_propuesta)}</div>
            </>
          ) : a.desea_reponer === false ? (
            <Badge variant="gray">No repondrá</Badge>
          ) : (
            <span className="text-[11px] text-gray-400">Sin fecha propuesta</span>
          )}

          {a.reposicion_registrada && (
            <div className="mt-1">
              <Badge variant={a.reposicion_registrada.estado === 'aprobada' ? 'green' : 'amber'}>
                Reposición {a.reposicion_registrada.estado}
              </Badge>
            </div>
          )}

          {!a.pendiente && a.programado_en_destino.length > 0 && (
            <div className="text-[10px] text-gray-500 mt-1">
              {a.programado_en_destino.length} turno{a.programado_en_destino.length === 1 ? '' : 's'} esta semana
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Las fechas de ausencia son días de calendario (medianoche UTC): se formatean
 *  en UTC o se corren un día en Colombia. Es el mismo criterio de lib/fechas.js
 *  en el backend. */
function fechaCorta(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', timeZone: 'UTC',
    })
  } catch {
    return '—'
  }
}
