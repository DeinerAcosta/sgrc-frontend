import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { solicitudRecursoService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { TIPOS_RECURSO, parseFechaLocal } from '@/utils/helpers'

const ESTADO_LABEL = {
  pendiente:  { label: 'Pendiente',  variant: 'amber' },
  aprobada:   { label: 'Aprobada',   variant: 'green' },
  ejecutada:  { label: 'Ejecutada',  variant: 'green' },
  rechazada:  { label: 'Rechazada',  variant: 'red'   },
  cancelled:  { label: 'Cancelada',  variant: 'gray'  },
}

/**
 * Panel del supervisor: ve TODAS las solicitudes de recurso y las aprueba/rechaza.
 * Para alta_nueva aprobadas, además puede ir a Recursos y crear el recurso luego.
 */
export default function AdminSolicitudesRecursoPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [accionEn, setAccionEn] = useState(null)  // { id, accion: 'aprobar' | 'rechazar' }

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ['solicitudes-recurso-admin', filtroEstado],
    queryFn: () => solicitudRecursoService.list({ status: filtroEstado || undefined }),
  })

  const { mutate: aprobar, isPending: aprobando } = useMutation({
    mutationFn: ({ id, reason: motivo }) => solicitudRecursoService.aprobar(id, motivo),
    onSuccess: (_, vars) => {
      toast.success('Solicitud aprobada')
      qc.invalidateQueries({ queryKey: ['solicitudes-recurso-admin'] })
      qc.invalidateQueries({ queryKey: ['solicitudes-recurso-count-pendientes'] })
      setAccionEn(null)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al aprobar'),
  })

  const { mutate: rechazar, isPending: rechazando } = useMutation({
    mutationFn: ({ id, reason: motivo }) => solicitudRecursoService.rechazar(id, motivo),
    onSuccess: () => {
      toast.success('Solicitud rechazada')
      qc.invalidateQueries({ queryKey: ['solicitudes-recurso-admin'] })
      qc.invalidateQueries({ queryKey: ['solicitudes-recurso-count-pendientes'] })
      setAccionEn(null)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al rechazar'),
  })

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Solicitudes de recurso</h1>
          <p className="text-xs text-gray-500">Aprueba o rechaza las solicitudes que crean los coordinadores</p>
        </div>
        <select className="input max-w-xs" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="pendiente">Solo pendientes</option>
          <option value="aprobada">Aprobadas (pendientes de crear recurso)</option>
          <option value="ejecutada">Ejecutadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="">Todas</option>
        </select>
      </div>

      <div className="card">
        <SectionHeader title={`${filtroEstado === 'pendiente' ? 'Pendientes' : 'Solicitudes'}`} action={<span className="text-xs text-gray-400">{solicitudes.length} total</span>} />
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : solicitudes.length === 0 ? (
          <EmptyState icon="✅" title="Sin solicitudes" description="No hay solicitudes en este estado." />
        ) : (
          <div className="space-y-2">
            {solicitudes.map((s) => {
              const est = ESTADO_LABEL[s.status] ?? { label: s.status, variant: 'gray' }
              const tipoLabel = TIPOS_RECURSO.find((t) => t.value === s.new_resource_type)?.label
              return (
                <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={est.variant}>{est.label}</Badge>
                        <span className="text-xs text-gray-400">
                          {format(parseFechaLocal(s.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-800">
                        <strong>{s.requester?.name}</strong> solicita {s.request_type === 'prestamo'
                          ? <>el préstamo de <strong>{s.resource?.name ?? '(recurso)'}</strong></>
                          : <>el alta de un nuevo <strong>{tipoLabel ?? s.new_resource_type}</strong>{s.specialty ? <span className="text-gray-500"> · {s.specialty}</span> : null}</>}
                        {' '}para sede <strong>{s.target_site?.name}</strong>
                      </div>
                      <div className="text-xs text-gray-600 italic mt-1">"{s.justification}"</div>
                      {s.decision_reason && (
                        <div className="text-xs text-amber-700 mt-1">
                          <strong>Decisión:</strong> {s.decision_reason}
                          {s.decided_by && <span className="text-gray-400"> — por {s.decided_by.name}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {s.status === 'pendiente' && (
                    <div className="flex gap-2">
                      <button
                        className="btn text-xs text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => setAccionEn({ id: s.id, action: 'rechazar', solicitud: s })}
                      >
                        Rechazar
                      </button>
                      <button
                        className="btn-primary text-xs"
                        onClick={() => setAccionEn({ id: s.id, action: 'aprobar', solicitud: s })}
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                  {s.status === 'aprobada' && s.request_type === 'alta_nueva' && (
                    <div className="bg-amber-50 border border-amber-100 rounded p-2 text-xs text-amber-800 mt-2">
                      ⚠️ Falta crear el recurso. Ve a <button onClick={() => navigate('/app/admin/recursos')} className="underline">Recursos (catálogo)</button> y créalo. Luego vuelve y usa "Asociar recurso creado" para vincular.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {accionEn && (
        <DecisionModal
          solicitud={accionEn.solicitud}
          accion={accionEn.action}
          onClose={() => setAccionEn(null)}
          onConfirm={(motivo) => {
            if (accionEn.action === 'aprobar') aprobar({ id: accionEn.id, reason: motivo })
            else rechazar({ id: accionEn.id, reason: motivo })
          }}
          isPending={aprobando || rechazando}
        />
      )}
    </div>
  )
}

function DecisionModal({ solicitud, action: accion, onClose, onConfirm, isPending }) {
  const [motivo, setMotivo] = useState('')
  const requiereMotivo = accion === 'rechazar'
  const valido = !requiereMotivo || motivo.trim().length >= 5

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {accion === 'aprobar' ? '✅ Aprobar solicitud' : '✗ Rechazar solicitud'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-gray-700">
            {accion === 'aprobar'
              ? (solicitud?.request_type === 'prestamo'
                ? <>Vas a aprobar el préstamo de <strong>{solicitud?.resource?.name}</strong> a la sede <strong>{solicitud?.target_site?.name}</strong>. El recurso quedará vinculado a esa sede y el coord solicitante podrá asignarlo.</>
                : <>Vas a aprobar el alta de un nuevo recurso. Después de aprobar, debes ir a <em>Recursos (catálogo)</em> y crear el recurso. Luego vuelve aquí para asociarlo.</>)
              : <>Vas a rechazar la solicitud de <strong>{solicitud?.requester?.name}</strong>. Debes dar un motivo claro.</>}
          </div>
          <div>
            <label className="label">{requiereMotivo ? 'Motivo del rechazo *' : 'Comentario / nota (opcional)'}</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder={requiereMotivo ? 'Ej: la sede ya cubre con su equipo actual' : 'Ej: aprobado por 4 semanas'}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {requiereMotivo && motivo.length > 0 && motivo.length < 5 && (
              <div className="text-xs text-red-600 mt-1">Mínimo 5 caracteres</div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className={`flex-1 justify-center px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${accion === 'aprobar' ? 'bg-brand-600 hover:bg-brand-800 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
            disabled={!valido || isPending}
            onClick={() => onConfirm(motivo)}
          >
            {isPending ? <Spinner size="sm" /> : (accion === 'aprobar' ? 'Aprobar' : 'Rechazar')}
          </button>
        </div>
      </div>
    </div>
  )
}
