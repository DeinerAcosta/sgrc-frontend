import { useQuery } from '@tanstack/react-query'
import { ausenciaService } from '@/services/api'
import { Spinner, Badge } from '@/components/ui'

/**
 * FORMATO F-AA-126 — VISTA DE SOLO LECTURA (PROYECTOS-3398 §1)
 * ============================================================
 *
 * Reemplaza al PDF que se descargaba. No es "el PDF pero en HTML": el PDF
 * existía para imprimirse y llenarse a mano, así que traía 12 filas de meses
 * vacías, casillas por marcar y una línea para firmar. Aquí todo eso ya está
 * contestado en la base, así que el formato se LEE.
 *
 * Qué se conserva del formato oficial, porque es lo que la gente reconoce:
 * el encabezado con razón social y código/versión, el bloque de empresa, los
 * datos del prestador, fecha de salida y entrada, el motivo, "¿desea reponer?",
 * observaciones, la firma y el Vo Bo.
 *
 * Qué NO se conserva:
 *   · "Proceso que afecta" y "Tipo de novedad" — se retiraron del formato
 *     (v05) y las columnas ya no existen en la base.
 *   · Las 12 filas "PERÍODO DE AUSENCIA POR MES / día reprogramación", que
 *     iban en blanco para llenar a mano. En su lugar va el desglose de
 *     pacientes por día que el sistema calcula al confirmar.
 *
 * Imprimible: `window.print()` con reglas `print:` de Tailwind deja solo la
 * hoja. Quien necesite un papel lo saca del navegador, sin que el servidor
 * vuelva a generar archivos.
 */
export default function VistaFormatoAusencia({ ausenciaId, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ausencia-formato', ausenciaId],
    queryFn: () => ausenciaService.formato(ausenciaId),
    enabled: !!ausenciaId,
    staleTime: 60 * 1000,
  })

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl my-4 flex flex-col print:rounded-none print:my-0 print:max-w-none print:shadow-none">
        {/* Barra de acciones — fuera del formato, no se imprime */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 print:hidden">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Formato de ausencia</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {data ? `${data.codigo} · versión ${data.version} · solo lectura` : 'Cargando…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!data}
              className="btn text-xs"
            >
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 print:p-0">
          {isLoading && <div className="py-12 flex justify-center"><Spinner /></div>}
          {error && (
            <div className="py-10 text-center text-xs text-red-600">
              {error?.message ?? 'No se pudo cargar el formato'}
            </div>
          )}
          {data && <HojaFormato f={data} />}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// La hoja. Marco de 1px y bloques apilados, como el formato en papel: quien
// lleva años firmándolo lo ubica de inmediato.
// ============================================================================
function HojaFormato({ f }) {
  const a = f.ausencia
  const p = f.profesional

  return (
    <div className="border border-gray-800 text-[11px] text-gray-900 print:text-[10px]">
      {/* ---------- ENCABEZADO ---------- */}
      <div className="flex border-b border-gray-800">
        <div className="flex-1 border-r border-gray-800">
          <div className="border-b border-gray-800 px-2 py-2 text-center font-bold text-xs">
            {f.razon_social}
          </div>
          <div className="px-2 py-2 text-center font-semibold leading-tight">
            <div>{f.subtitulo}</div>
            <div>{f.especialidades}</div>
          </div>
        </div>
        <div className="w-40">
          <CeldaCodigo etiqueta="Código:" valor={f.codigo} />
          <CeldaCodigo etiqueta="Versión:" valor={f.version} />
          <CeldaCodigo etiqueta="Actualización:" valor="23/09/2026" ultima />
        </div>
      </div>

      {/* ---------- EMPRESA ---------- */}
      <Fila etiqueta="¿A qué empresa aplica la ausencia?">
        <div className="flex gap-6">
          {['foca', 'viu', 'ambas'].map((e) => (
            <Marca key={e} label={EMPRESA_LABEL[e]} activo={f.empresa === e} />
          ))}
          {!f.empresa && <span className="text-gray-400">Sin registrar</span>}
        </div>
      </Fila>

      {/* ---------- PRESTADOR + FECHAS ---------- */}
      <div className="flex border-b border-gray-800">
        <div className="flex-1 border-r border-gray-800 px-2 py-2">
          <div className="text-[10px] text-gray-500">Profesional quien presta el servicio</div>
          <div className="font-bold text-sm uppercase mt-0.5">{p.nombre}</div>
          <div className="text-[10px] text-gray-500 capitalize mt-0.5">
            {p.tipo}{p.especialidad ? ` · ${p.especialidad}` : ''}
          </div>
        </div>
        <div className="w-72">
          <div className="flex border-b border-gray-800">
            <div className="w-28 px-2 py-1.5 border-r border-gray-800 text-[10px] text-gray-500">Fecha de salida</div>
            <div className="flex-1 px-2 py-1.5 font-semibold">{a.fecha_salida}</div>
          </div>
          <div className="flex">
            <div className="w-28 px-2 py-1.5 border-r border-gray-800 text-[10px] text-gray-500">Fecha de entrada</div>
            <div className="flex-1 px-2 py-1.5 font-semibold">{a.fecha_entrada}</div>
          </div>
        </div>
      </div>

      {a.es_parcial && (
        <Fila etiqueta="Ausencia parcial">
          <span className="font-semibold">{a.hora_inicio} – {a.hora_fin}</span>
          <span className="text-gray-500 ml-2">(el resto del día sí atiende)</span>
        </Fila>
      )}

      {/* ---------- MOTIVO ---------- */}
      <Fila etiqueta="Motivo">
        <div>
          <span className="font-semibold">{a.motivo_catalogo ?? a.tipo}</span>
          {a.ciudad_regional && <span className="text-gray-600"> · {a.ciudad_regional}</span>}
          {a.motivo_texto && (
            <div className="text-gray-700 mt-1 whitespace-pre-wrap">{a.motivo_texto}</div>
          )}
        </div>
      </Fila>

      {/* ---------- ANTELACIÓN ---------- */}
      <Fila etiqueta="Antelación del aviso">
        <span className="font-semibold">{a.anticipacion_dias ?? 0} días</span>
        <span className="ml-3">
          <Badge variant={a.es_programada ? 'green' : 'amber'}>
            {a.es_programada ? 'Programada' : 'Imprevista'}
          </Badge>
        </span>
      </Fila>

      {/* ---------- ¿DESEA REPONER? ---------- */}
      <Fila etiqueta="¿Desea reponer?">
        <div className="flex gap-6">
          <Marca label="SÍ" activo={a.desea_reponer === true} />
          <Marca label="NO" activo={a.desea_reponer === false} />
          {a.desea_reponer == null && <span className="text-gray-400">Sin responder</span>}
        </div>
      </Fila>

      {(a.fecha_reposicion_propuesta || a.observaciones_reposicion) && (
        <Fila etiqueta="Reposición propuesta">
          <div>
            {a.fecha_reposicion_propuesta && (
              <div className="font-semibold">{a.fecha_reposicion_propuesta}</div>
            )}
            {a.observaciones_reposicion && (
              <div className="text-gray-700 whitespace-pre-wrap mt-0.5">{a.observaciones_reposicion}</div>
            )}
          </div>
        </Fila>
      )}

      {/* ---------- IMPACTO ----------
          Aquí iban las 12 filas de meses en blanco. Lo que el formato en papel
          pedía rellenar a mano ("día reprogramación") el sistema ya lo sabe:
          qué días caen dentro de la ausencia y cuántos pacientes había en cada
          uno. Solo existe después de confirmar, así que antes de eso el bloque
          no se dibuja. */}
      {Array.isArray(a.impacto_por_dia) && a.impacto_por_dia.length > 0 && (
        <div className="border-b border-gray-800">
          <div className="bg-gray-100 px-2 py-1 font-bold text-center uppercase tracking-wide">
            Período de ausencia del servicio prestado
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-gray-500 text-left border-b border-gray-300">
                <th className="px-2 py-1 font-medium">Día</th>
                <th className="px-2 py-1 font-medium text-right">Pacientes</th>
              </tr>
            </thead>
            <tbody>
              {a.impacto_por_dia.map((d, i) => (
                <tr key={i} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-2 py-1 capitalize">
                    {d.day}{d.date ? ` ${d.date}` : ''}{d.parcial ? ' (parcial)' : ''}
                  </td>
                  <td className="px-2 py-1 text-right">{d.pacientes ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 border-t border-gray-800 flex justify-between font-semibold">
            <span>Total pacientes impactados</span>
            <span>{a.pacientes_impactados ?? 0}</span>
          </div>
        </div>
      )}

      {/* ---------- GESTIÓN DE LA AGENDA (§6.1) ---------- */}
      {(a.accion_agenda || a.accion_tomada) && (
        <Fila etiqueta="Gestión realizada">
          <div>
            {a.accion_agenda && (
              <span className="font-semibold">{ACCION_AGENDA_LABEL[a.accion_agenda] ?? a.accion_agenda}</span>
            )}
            {a.accion_tomada && (
              <div className="text-gray-700 whitespace-pre-wrap mt-0.5">{a.accion_tomada}</div>
            )}
          </div>
        </Fila>
      )}

      {a.motivo_rechazo && (
        <Fila etiqueta="Motivo del rechazo">
          <span className="text-red-700 whitespace-pre-wrap">{a.motivo_rechazo}</span>
        </Fila>
      )}

      {/* ---------- FIRMA + DILIGENCIAMIENTO ---------- */}
      <div className="flex border-b border-gray-800">
        <div className="flex-1 border-r border-gray-800 px-2 py-2">
          <div className="text-[10px] text-gray-500">Firma del prestador</div>
          <div className="h-14 flex items-center justify-center">
            {p.firma_url ? (
              <img src={p.firma_url} alt={`Firma de ${p.nombre}`} className="max-h-14 object-contain" />
            ) : (
              <span className="font-bold text-xs uppercase">{p.nombre}</span>
            )}
          </div>
        </div>
        <div className="w-60 px-2 py-2">
          <div className="text-[10px] text-gray-500">Fecha de diligenciamiento</div>
          <div className="font-semibold mt-1">{formatearInstante(f.diligenciamiento.fecha)}</div>
          {f.diligenciamiento.por && (
            <div className="text-[10px] text-gray-500 mt-1">
              Registró: {f.diligenciamiento.por}
              {f.diligenciamiento.registrado_por_coordinador && ' (coordinación)'}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Vo Bo ---------- */}
      <div className="flex border-b border-gray-800">
        <div className="w-20 px-2 py-2 border-r border-gray-800 text-[10px] text-gray-500">Vo Bo</div>
        <div className="flex-1 px-2 py-2">
          {f.vo_bo ? (
            <>
              <span className="font-bold uppercase">{f.vo_bo.nombre ?? '—'}</span>
              <span className="text-gray-500 ml-2">{formatearInstante(f.vo_bo.fecha)}</span>
            </>
          ) : (
            <span className="text-gray-400">Pendiente de aprobación</span>
          )}
        </div>
      </div>

      {/* ---------- NOTA ---------- */}
      <div className="px-2 py-1.5 text-[10px]">
        <span className="font-bold">NOTA: </span>{f.nota}
      </div>
    </div>
  )
}

const EMPRESA_LABEL = { foca: 'FOCA', viu: 'VIU', ambas: 'AMBAS' }

const ACCION_AGENDA_LABEL = {
  reprogramada: 'La agenda se reprogramó',
  cubierta: 'Otro profesional cubrió la agenda',
  perdida: 'La agenda se perdió',
  sin_agenda: 'No tenía agenda ese día',
}

/** El backend manda `reported_at`/`confirmed_at` como instante ISO, no como día
 *  de calendario, así que se muestra con su hora en zona de Colombia. Las
 *  fechas de salida/entrada vienen ya formateadas del servidor justo para no
 *  volver a caer en el corrimiento de un día (lib/fechas.js). */
function formatearInstante(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
    })
  } catch {
    return '—'
  }
}

function CeldaCodigo({ etiqueta, valor, ultima = false }) {
  return (
    <div className={`flex ${ultima ? '' : 'border-b border-gray-800'}`}>
      <div className="flex-1 px-1.5 py-1 border-r border-gray-800 text-[10px] text-gray-500">{etiqueta}</div>
      <div className="w-16 px-1.5 py-1 font-bold text-[10px]">{valor}</div>
    </div>
  )
}

function Fila({ etiqueta, children }) {
  return (
    <div className="flex border-b border-gray-800">
      <div className="w-48 flex-shrink-0 px-2 py-2 border-r border-gray-800 text-[10px] text-gray-500">{etiqueta}</div>
      <div className="flex-1 px-2 py-2">{children}</div>
    </div>
  )
}

/** Casilla del formato. En papel se marcaba con lápiz; aquí refleja el dato
 *  guardado y nunca es editable — es justo lo que pide §1. */
function Marca({ label, activo }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`w-3 h-3 border border-gray-800 inline-flex items-center justify-center text-[9px] leading-none ${activo ? 'bg-gray-900 text-white' : 'bg-white'}`}
      >
        {activo ? '✓' : ''}
      </span>
      <span className={activo ? 'font-semibold' : 'text-gray-500'}>{label}</span>
    </span>
  )
}
