import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { authService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader, Avatar } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

const ESTADOS = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada',  label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
]

/**
 * Panel del supervisor para gestionar solicitudes de registro (autorregistro).
 * Aprobar → crea Usuario + Recurso + envía email con contraseña provisional.
 * Rechazar → requiere motivo y notifica por email al solicitante.
 */
export default function AdminSolicitudesPage() {
  const qc = useQueryClient()
  const [estado, setEstado] = useState('pendiente')
  const [rechazar, setRechazar] = useState(null) // {id, nombre, email}
  const [motivo, setMotivo] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['solicitudes-registro', estado],
    queryFn: () => authService.listSolicitudes({ status: estado }),
  })

  const { mutate: aprobar, isPending: aprobando } = useMutation({
    mutationFn: (id) => authService.aprobarSolicitud(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes-registro'] })
      toast.success('Solicitud aprobada — email enviado al solicitante con la contraseña provisional')
    },
    onError: (err) => toast.error(err?.message ?? 'Error al aprobar'),
  })

  const { mutate: doRechazar, isPending: rechazando } = useMutation({
    mutationFn: () => authService.rechazarSolicitud(rechazar.id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes-registro'] })
      toast('Solicitud rechazada', { icon: 'ℹ️' })
      setRechazar(null); setMotivo('')
    },
    onError: (err) => toast.error(err?.message ?? 'Error al rechazar'),
  })

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Solicitudes de registro</h1>
          <p className="text-xs text-gray-500">Autorregistros pendientes de aprobación</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${estado === e.value ? 'bg-white text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setEstado(e.value)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionHeader title={`${data.length} solicitud${data.length !== 1 ? 'es' : ''}`} />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : data.length === 0 ? (
          <EmptyState icon="📭" title="Sin solicitudes" description={`No hay solicitudes en estado "${ESTADOS.find((e) => e.value === estado)?.label.toLowerCase()}".`} />
        ) : (
          <div className="space-y-2">
            {data.map((s) => (
              <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <Avatar nombre={s.name} size="sm" color="blue" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      <Badge variant="gray">{s.role}</Badge>
                      {s.resource_type && <Badge variant="purple">{s.resource_type}</Badge>}
                      <Badge variant={s.status === 'pendiente' ? 'amber' : s.status === 'aprobada' ? 'green' : 'red'}>{s.status}</Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      📧 {s.email}{s.phone ? ` · 📱 ${s.phone}` : ''}
                    </div>
                    {s.specialty && <div className="text-xs text-gray-500">Especialidad: {s.specialty}</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      Solicitado el {format(parseISO(s.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                    </div>
                    {s.rejection_reason && (
                      <div className="text-xs text-red-700 italic mt-1">Motivo de rechazo: {s.rejection_reason}</div>
                    )}
                  </div>
                  {s.status === 'pendiente' && (
                    <div className="flex flex-col gap-1">
                      <button
                        className="btn-success text-xs"
                        onClick={() => aprobar(s.id)}
                        disabled={aprobando}
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        className="btn-danger text-xs"
                        onClick={() => setRechazar({ id: s.id, name: s.name, email: s.email })}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de rechazo — extraído a subcomponente para que el snapshot
          de useDirtyClose se capture al abrir el modal, no al montar la página */}
      {rechazar && (
        <RechazarModal
          solicitud={rechazar}
          motivo={motivo}
          setMotivo={setMotivo}
          rechazando={rechazando}
          doRechazar={doRechazar}
          onClose={() => { setRechazar(null); setMotivo('') }}
        />
      )}
    </div>
  )
}

function RechazarModal({ solicitud, motivo, setMotivo, rechazando, doRechazar, onClose }) {
  const { tryClose } = useDirtyClose({ reason: motivo }, onClose)
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Rechazar solicitud</h2>
          <p className="text-xs text-gray-500 mt-0.5">{solicitud.name} · {solicitud.email}</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">Motivo del rechazo (mínimo 5 caracteres) *</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. No corresponde al perfil descrito, datos incompletos, etc."
            />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800">
            ⚠️ El solicitante recibirá el motivo por email.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-danger flex-1 justify-center"
            onClick={() => doRechazar()}
            disabled={motivo.trim().length < 5 || rechazando}
          >
            {rechazando ? <Spinner size="sm" /> : 'Rechazar y notificar'}
          </button>
        </div>
      </div>
    </div>
  )
}
