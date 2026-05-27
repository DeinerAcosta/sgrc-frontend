import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { parametroService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { formatCOP } from '@/utils/helpers'

const TIPOS = [
  { value: 'oftalmologia',  label: 'Oftalmología' },
  { value: 'optometria',    label: 'Optometría' },
  { value: 'anestesiologia', label: 'Anestesiología' },
  { value: 'diagnostico',   label: 'Métodos diagnósticos' },
]

/**
 * HU-S-04: Supervisor configura los costos medios por tipo de consulta.
 * RN: El historial nunca se sobreescribe — cada cambio crea un nuevo registro con fecha de vigencia.
 */
export default function AdminParametrosPage() {
  const qc = useQueryClient()
  const [agregar, setAgregar] = useState(null)

  const { data: parametros = [], isLoading } = useQuery({
    queryKey: ['admin-parametros-costo'],
    queryFn: () => parametroService.list(),
  })

  const vigentes = TIPOS.map((t) => {
    const lista = parametros.filter((p) => p.tipo_consulta === t.value).sort((a, b) => (b.vigente_desde ?? '').localeCompare(a.vigente_desde ?? ''))
    return { tipo: t, vigente: lista[0], historial: lista.slice(1) }
  })

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Parámetros de costo</h1>
        <p className="text-xs text-gray-500">Costos medios usados para calcular el impacto económico de las ausencias</p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-4">
        ℹ️ Cada cambio crea un nuevo registro con fecha de vigencia. El historial nunca se sobrescribe — los cálculos de ausencias pasadas siguen usando el costo de la fecha de la ausencia.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {isLoading ? <div className="col-span-2 flex justify-center py-8"><Spinner /></div> :
          vigentes.map(({ tipo, vigente, historial }) => (
            <div key={tipo.value} className="card">
              <SectionHeader
                title={tipo.label}
                action={
                  <button className="btn text-xs" onClick={() => setAgregar(tipo.value)}>
                    + Nueva vigencia
                  </button>
                }
              />

              {vigente ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-xs text-gray-400">Costo por cita</div>
                      <div className="text-lg font-semibold text-gray-900">{formatCOP(vigente.costo_cita)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Costo de reprogramación</div>
                      <div className="text-lg font-semibold text-gray-900">{formatCOP(vigente.costo_reprogramacion)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Vigente desde {format(parseISO(vigente.vigente_desde), 'd MMM yyyy', { locale: es })}
                  </div>
                </>
              ) : (
                <EmptyState title="Sin parámetros configurados" />
              )}

              {historial.length > 0 && (
                <details className="mt-3 pt-3 border-t border-gray-100">
                  <summary className="text-xs text-gray-500 cursor-pointer">Historial ({historial.length})</summary>
                  <div className="mt-2 space-y-1">
                    {historial.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs text-gray-500 py-1">
                        <span>{format(parseISO(p.vigente_desde), 'd MMM yyyy', { locale: es })}</span>
                        <span>Cita {formatCOP(p.costo_cita)} · Reprog {formatCOP(p.costo_reprogramacion)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
      </div>

      {agregar && <ParametroModal tipo={agregar} onClose={() => setAgregar(null)} onSaved={() => { qc.invalidateQueries(['admin-parametros-costo']); setAgregar(null) }} />}
    </div>
  )
}

function ParametroModal({ tipo, onClose, onSaved }) {
  const [costoCita, setCostoCita] = useState('')
  const [costoReprog, setCostoReprog] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState(format(new Date(), 'yyyy-MM-dd'))
  const tipoLabel = TIPOS.find((t) => t.value === tipo)?.label

  const { mutate, isPending } = useMutation({
    mutationFn: () => parametroService.create({
      tipo_consulta: tipo,
      costo_cita: parseInt(costoCita),
      costo_reprogramacion: parseInt(costoReprog),
      vigente_desde: vigenteDesde,
    }),
    onSuccess: () => { toast.success(`Nueva vigencia agregada para ${tipoLabel}`); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Nueva vigencia de costo</h2>
            <p className="text-xs text-gray-500 mt-0.5">{tipoLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Costo medio por cita (COP) *</label>
            <input className="input" type="number" min="0" value={costoCita} onChange={(e) => setCostoCita(e.target.value)} />
          </div>
          <div>
            <label className="label">Costo operativo de reprogramación (COP) *</label>
            <input className="input" type="number" min="0" value={costoReprog} onChange={(e) => setCostoReprog(e.target.value)} />
          </div>
          <div>
            <label className="label">Vigente desde *</label>
            <input className="input" type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
            <div className="text-xs text-gray-500 mt-1">Las ausencias con fecha igual o posterior usarán este costo.</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!costoCita || !costoReprog || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Guardar vigencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
