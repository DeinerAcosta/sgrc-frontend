import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { parametroService } from '@/services/api'
import { Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { formatCOP } from '@/utils/helpers'
import { useDirtyClose } from '@/hooks/useDirtyClose'

// Etiquetas legibles para los tipos "clásicos". Los tipos personalizados
// muestran su slug capitalizado/limpiado.
const ETIQUETAS = {
  oftalmologia:   'Oftalmología',
  optometria:     'Optometría',
  anestesiologia: 'Anestesiología',
  diagnostico:    'Métodos diagnósticos',
}

const etiquetaDe = (slug) => ETIQUETAS[slug] ?? slug.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * HU-S-04: Supervisor configura los costos medios por tipo de consulta.
 * RN: El historial nunca se sobreescribe — cada cambio crea un nuevo registro
 *     con fecha de vigencia.
 *
 * El catálogo de tipos NO es fijo: el supervisor puede agregar tipos nuevos
 * (cirugía, examen OCT, etc.) desde "+ Nuevo tipo de consulta".
 */
export default function AdminParametrosPage() {
  const qc = useQueryClient()
  const [agregar, setAgregar] = useState(null)         // slug del tipo al que se le agrega nueva vigencia
  const [nuevoTipo, setNuevoTipo] = useState(false)    // modal para crear un tipo nuevo

  const { data: parametros = [], isLoading } = useQuery({
    queryKey: ['admin-parametros-costo'],
    queryFn: () => parametroService.list(),
  })

  // Agrupar por tipo (todos los tipos presentes en BD + los clásicos si no existen aún)
  const tiposEnBd = [...new Set(parametros.map((p) => p.visit_type))]
  const tiposClasicosSinDatos = Object.keys(ETIQUETAS).filter((t) => !tiposEnBd.includes(t))
  const todosTipos = [...tiposEnBd, ...tiposClasicosSinDatos].sort()

  const vigentes = todosTipos.map((slug) => {
    const lista = parametros.filter((p) => p.visit_type === slug).sort((a, b) => (b.effective_from ?? '').localeCompare(a.effective_from ?? ''))
    return { slug, label: etiquetaDe(slug), vigente: lista[0], historial: lista.slice(1) }
  })

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Parámetros de costo</h1>
          <p className="text-xs text-gray-500">Costos medios usados para calcular el impacto económico de las ausencias</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary whitespace-nowrap" onClick={() => setNuevoTipo(true)}>
            ＋ Nuevo tipo de consulta
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-4">
        ℹ️ Cada cambio crea un nuevo registro con fecha de vigencia. El historial nunca se sobrescribe — los cálculos de ausencias pasadas siguen usando el costo de la fecha de la ausencia.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {isLoading ? <div className="col-span-2 flex justify-center py-8"><Spinner /></div> :
          vigentes.map(({ slug, label, vigente, historial }) => (
            <div key={slug} className="card">
              <SectionHeader
                title={label}
                action={
                  <button className="btn text-xs" onClick={() => setAgregar(slug)}>
                    + Nueva vigencia
                  </button>
                }
              />

              {vigente ? (
                <>
                  <div className="mb-3">
                    <div className="text-xs text-gray-400">Costo operativo de reprogramación (COP) <span className="font-normal text-gray-400">(todo incluido: cita + quejas + jurídicos + logística)</span></div>
                    <div className="text-lg font-semibold text-gray-900">{formatCOP(vigente.reschedule_cost)}</div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Vigente desde {format(parseISO(vigente.effective_from), 'd MMM yyyy', { locale: es })}
                  </div>
                </>
              ) : (
                <EmptyState title="Sin parámetros configurados" description={`Agrega la primera vigencia para ${label}.`} />
              )}

              {historial.length > 0 && (
                <details className="mt-3 pt-3 border-t border-gray-100">
                  <summary className="text-xs text-gray-500 cursor-pointer">Historial ({historial.length})</summary>
                  <div className="mt-2 space-y-1">
                    {historial.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs text-gray-500 py-1">
                        <span>{format(parseISO(p.effective_from), 'd MMM yyyy', { locale: es })}</span>
                        <span>{formatCOP(p.reschedule_cost)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
      </div>

      {agregar && (
        <ParametroModal
          tipoFijo={agregar}
          onClose={() => setAgregar(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-parametros-costo'] }); setAgregar(null) }}
        />
      )}

      {nuevoTipo && (
        <ParametroModal
          esNuevoTipo
          onClose={() => setNuevoTipo(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-parametros-costo'] }); setNuevoTipo(false) }}
        />
      )}
    </div>
  )
}

function ParametroModal({ tipoFijo, esNuevoTipo, onClose, onSaved }) {
  const [tipoSlug, setTipoSlug] = useState('')
  // costoCita se eliminó del formulario (jul-2026). El backend usa el mismo
  // valor de costoReprog para ambos campos internamente. Un solo "costo por
  // caso todo incluido" según acuerdo con gerencia.
  const [costoReprog, setCostoReprog] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState(format(new Date(), 'yyyy-MM-dd'))
  const dirtySnapshot = { tipoSlug, costoReprog, effectiveFrom: vigenteDesde }
  const { tryClose } = useDirtyClose(dirtySnapshot, onClose)
  const tipoLabel = tipoFijo ? etiquetaDe(tipoFijo) : (tipoSlug ? etiquetaDe(tipoSlug) : 'nuevo tipo')

  const { mutate, isPending } = useMutation({
    mutationFn: () => parametroService.create({
      visit_type: tipoFijo ?? tipoSlug.trim().toLowerCase(),
      reschedule_cost: parseInt(costoReprog),
      // costo_cita omitido — backend lo iguala a costo_reprogramacion.
      effective_from: vigenteDesde,
    }),
    onSuccess: () => { toast.success(esNuevoTipo ? `Tipo "${tipoLabel}" creado con su primera vigencia` : `Nueva vigencia agregada para ${tipoLabel}`); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  const slugValido = !esNuevoTipo || /^[a-z0-9_]{3,40}$/.test(tipoSlug)
  const valid = costoReprog && vigenteDesde && slugValido

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {esNuevoTipo ? 'Nuevo tipo de consulta' : 'Nueva vigencia de costo'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{tipoFijo ? tipoLabel : esNuevoTipo ? 'Define un tipo nuevo y su primera vigencia' : ''}</p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {esNuevoTipo && (
            <div>
              <label className="label">Identificador del tipo *</label>
              <input
                className="input"
                value={tipoSlug}
                onChange={(e) => setTipoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40))}
                placeholder="ej. cirugia_general, examen_oct"
              />
              <div className="text-xs text-gray-500 mt-1">
                Solo minúsculas, dígitos y guion bajo (3-40 caracteres). {tipoSlug && <span className="text-gray-700">Se mostrará como: <strong>{etiquetaDe(tipoSlug)}</strong></span>}
              </div>
            </div>
          )}
          <div>
            <label className="label">Costo operativo de reprogramación (COP) *</label>
            <input className="input" type="number" min="0" value={costoReprog} onChange={(e) => setCostoReprog(e.target.value)} placeholder="Ej. 15955" />
            <div className="text-xs text-gray-500 mt-1">
              Costo total todo incluido: cita perdida + quejas + costos jurídicos + logística de respuesta.
            </div>
          </div>
          <div>
            <label className="label">Vigente desde *</label>
            <input className="input" type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
            <div className="text-xs text-gray-500 mt-1">Las ausencias con fecha igual o posterior usarán este costo.</div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? <Spinner size="sm" /> : (esNuevoTipo ? 'Crear tipo' : 'Guardar vigencia')}
          </button>
        </div>
      </div>
    </div>
  )
}
