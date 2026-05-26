import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ausenciaService, sedeService, asignacionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, Avatar } from '@/components/ui'
import { TIPOS_AUSENCIA, formatCOP } from '@/utils/helpers'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import RegistrarAusenciaCoordModal from '@/pages/coordinador/RegistrarAusenciaCoordModal'
import SugeridorReemplazosModal from '@/pages/coordinador/SugeridorReemplazosModal'

const TIPO_LABEL = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

export default function AusenciasCoordPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const sedeId = user?.sedes?.[0]
  const [tab, setTab] = useState('pendientes')
  const [selected, setSelected] = useState(null)
  const [notaConfirm, setNotaConfirm] = useState('')
  const [showRegistrar, setShowRegistrar] = useState(false)
  const [showSugerir, setShowSugerir] = useState(null)

  // Cargar sede para obtener ciudad (para el sugeridor de reemplazos)
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-list-ausencias'],
    queryFn: () => sedeService.list(),
  })
  const sedeActual = sedes.find((s) => s.id === sedeId)

  const { data: ausencias = [], isLoading } = useQuery({
    queryKey: ['ausencias-coord', sedeId, tab],
    queryFn: () => ausenciaService.list({ sede_id: sedeId, estado: tab === 'pendientes' ? 'pendiente' : undefined }),
  })

  const { mutate: confirmar, isPending: confirmando } = useMutation({
    mutationFn: (id) => ausenciaService.confirmar(id, { nota_coordinador: notaConfirm }),
    onSuccess: () => {
      qc.invalidateQueries(['ausencias-coord'])
      toast.success('Ausencia confirmada. Recursos notificados.')
      setSelected(null)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al confirmar'),
  })

  const { mutate: rechazar } = useMutation({
    mutationFn: ({ id, motivo }) => ausenciaService.rechazar(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries(['ausencias-coord'])
      toast('Ausencia rechazada. El recurso fue notificado.', { icon: 'ℹ️' })
      setSelected(null)
    },
  })

  const pendientes = ausencias.filter((a) => a.estado === 'pendiente')
  const sel = ausencias.find((a) => a.id === selected)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-gray-900">Gestión de ausencias</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[['pendientes', `Pendientes (${pendientes.length})`], ['todas', 'Todas']].map(([k, label]) => (
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

      <div className="grid grid-cols-2 gap-4">
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
                  <Avatar nombre={a.recurso?.nombre} size="sm" color="blue" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">{a.recurso?.nombre}</div>
                    <div className="text-xs text-gray-500">{TIPO_LABEL[a.tipo] ?? a.tipo}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {format(parseISO(a.fecha_inicio), 'd MMM', { locale: es })}
                      {a.fecha_fin !== a.fecha_inicio && ` – ${format(parseISO(a.fecha_fin), 'd MMM', { locale: es })}`}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={a.estado === 'pendiente' ? 'amber' : a.estado === 'confirmada' ? 'green' : 'red'}>
                      {a.estado}
                    </Badge>
                    {a.pacientes_impactados > 0 && (
                      <Badge variant="red">{a.pacientes_impactados} pac.</Badge>
                    )}
                    {a.es_parcial && <Badge variant="blue">Parcial</Badge>}
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
                <Avatar nombre={sel.recurso?.nombre} size="md" color="blue" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{sel.recurso?.nombre}</div>
                  <div className="text-xs text-gray-500 capitalize">{sel.recurso?.tipo} · {sel.recurso?.especialidad}</div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <Row label="Tipo" value={TIPO_LABEL[sel.tipo] ?? sel.tipo} />
                <Row label="Fechas" value={`${format(parseISO(sel.fecha_inicio), 'd MMM yyyy', { locale: es })} ${sel.fecha_fin !== sel.fecha_inicio ? `— ${format(parseISO(sel.fecha_fin), 'd MMM yyyy', { locale: es })}` : ''}`} />
                {sel.es_parcial && <Row label="Horario ausencia" value={`${sel.hora_inicio_ausencia} – ${sel.hora_fin_ausencia}`} />}
                {sel.motivo && <Row label="Motivo" value={sel.motivo} />}
                <Row label="Reportado" value={format(parseISO(sel.reportado_en ?? sel.created_at), 'd MMM HH:mm', { locale: es })} />
                <Row label="Anticipación" value={`${sel.anticipacion_dias} días`} warn={sel.anticipacion_dias < 30 && ['academico','vacaciones'].includes(sel.tipo)} />
              </div>

              {sel.pacientes_impactados > 0 && (
                <div className="bg-red-50 rounded-lg p-3 space-y-1 text-xs">
                  <div className="font-medium text-red-800">Impacto calculado</div>
                  <Row label="Pacientes impactados" value={sel.pacientes_impactados} />
                  {sel.costo_oportunidad && <Row label="Costo de oportunidad" value={formatCOP(sel.costo_oportunidad)} />}
                  {sel.costo_personal_inactivo && <Row label="Costo personal inactivo" value={formatCOP(sel.costo_personal_inactivo)} />}
                </div>
              )}

              {sel.estado === 'pendiente' && (
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
                        rechazar({ id: sel.id, motivo: notaConfirm })
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

              {sel.estado === 'confirmada' && (
                <div className="pt-3 border-t border-gray-100">
                  <button
                    className="btn-primary w-full justify-center"
                    onClick={() => setShowSugerir(sel)}
                  >
                    🔍 Buscar reemplazo
                  </button>
                  <div className="text-xs text-gray-400 mt-2 text-center">
                    Sugiere recursos disponibles de cualquier sede de la ciudad
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRegistrar && (
        <RegistrarAusenciaCoordModal sedeId={sedeId} onClose={() => setShowRegistrar(false)} />
      )}

      {showSugerir && (
        <SugeridorReemplazosModal
          asignacionVacia={{
            recurso: showSugerir.recurso,
            dia_semana: 'lunes', // simplificación demo
            hora_inicio: '07:00',
            hora_fin: '13:00',
            semana_id: 'sem-actual',
          }}
          ausencia={showSugerir}
          ciudad={sedeActual?.ciudad}
          onClose={() => setShowSugerir(null)}
        />
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
