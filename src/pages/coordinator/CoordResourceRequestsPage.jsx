import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { solicitudRecursoService, sedeService, recursoService, semanaService } from '@/services/api'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { TIPOS_RECURSO, parseFechaLocal } from '@/utils/helpers'
import { useDirtyClose } from '@/hooks/useDirtyClose'

const ESTADO_LABEL = {
  pendiente:  { label: 'Pendiente',  variant: 'amber' },
  aprobada:   { label: 'Aprobada',   variant: 'green' },
  ejecutada:  { label: 'Ejecutada',  variant: 'green' },
  rechazada:  { label: 'Rechazada',  variant: 'red'   },
  cancelled:  { label: 'Cancelada',  variant: 'gray'  },
}

/**
 * Página del coordinador: lista sus solicitudes de recurso + permite crear nuevas.
 */
export default function SolicitudesRecursoCoordPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ['solicitudes-recurso-coord'],
    queryFn: () => solicitudRecursoService.list(),
  })

  const { mutate: cancelar } = useMutation({
    mutationFn: (id) => solicitudRecursoService.cancelar(id),
    onSuccess: () => {
      toast.success('Solicitud cancelada')
      qc.invalidateQueries({ queryKey: ['solicitudes-recurso-coord'] })
    },
    onError: (err) => toast.error(err?.message ?? 'Error al cancelar'),
  })

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Solicitudes de recurso</h1>
          <p className="text-xs text-gray-500">Pide al supervisor un recurso para una sede que no coordinas</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nueva solicitud</button>
      </div>

      <div className="card">
        <SectionHeader title="Mis solicitudes" action={<span className="text-xs text-gray-400">{solicitudes.length} total</span>} />
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : solicitudes.length === 0 ? (
          <EmptyState icon="📨" title="Sin solicitudes" description="Cuando necesites un recurso fuera de tu sede, crea una solicitud." />
        ) : (
          <div className="space-y-2">
            {solicitudes.map((s) => {
              const est = ESTADO_LABEL[s.status] ?? { label: s.status, variant: 'gray' }
              return (
                <div key={s.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={est.variant}>{est.label}</Badge>
                        <span className="text-xs text-gray-400">
                          {format(parseFechaLocal(s.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-800">
                        {s.request_type === 'prestamo'
                          ? <>Préstamo de <strong>{s.resource?.name ?? '(recurso)'}</strong></>
                          : <>Alta nueva: <strong>{s.new_resource_type}</strong>{s.specialty ? <span className="text-gray-500"> · {s.specialty}</span> : null}</>}
                        {' '}para sede <strong>{s.target_site?.name}</strong>
                      </div>
                      <div className="text-xs text-gray-600 italic mt-1">"{s.justification}"</div>
                      {s.decision_reason && (
                        <div className="text-xs text-amber-700 mt-1">
                          <strong>Respuesta:</strong> {s.decision_reason}
                        </div>
                      )}
                    </div>
                    {s.status === 'pendiente' && (
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => {
                          if (confirm('¿Cancelar esta solicitud?')) cancelar(s.id)
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NuevaSolicitudModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['solicitudes-recurso-coord'] })
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

function NuevaSolicitudModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    requestType: 'prestamo',
    targetSiteId: '',
    resourceId: '',
    newResourceType: '',
    specialty: '',
    startWeekId: '',
    endWeekId: '',
    justification: '',
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-solicitud'],
    queryFn: () => sedeService.list(),
  })
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-solicitud'],
    queryFn: () => recursoService.list({ active: true }),
    enabled: form.requestType === 'prestamo',
  })
  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas-solicitud'],
    queryFn: () => semanaService.list(),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => solicitudRecursoService.crear(form),
    onSuccess: () => {
      toast.success('Solicitud enviada al supervisor')
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al crear'),
  })

  const valida = form.targetSiteId && form.justification.trim().length >= 10 && (
    (form.requestType === 'prestamo' && form.resourceId) ||
    (form.requestType === 'alta_nueva' && form.newResourceType)
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Nueva solicitud de recurso</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">

          <div>
            <label className="label">Tipo de solicitud *</label>
            <select className="input" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value, resourceId: '', newResourceType: '' })}>
              <option value="prestamo">Préstamo de un recurso existente</option>
              <option value="alta_nueva">Alta de un recurso nuevo (no existe en el sistema)</option>
            </select>
          </div>

          <div>
            <label className="label">Sede destino *</label>
            <select className="input" value={form.targetSiteId} onChange={(e) => setForm({ ...form, targetSiteId: e.target.value })}>
              <option value="">— Elige la sede donde necesitas el recurso —</option>
              {sedes.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.city}</option>
              ))}
            </select>
          </div>

          {form.requestType === 'prestamo' ? (
            <div>
              <label className="label">Recurso a prestar *</label>
              <select className="input" value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>
                <option value="">— Elige el recurso —</option>
                {recursos.sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
                  const t = TIPOS_RECURSO.find((x) => x.value === r.type)
                  return <option key={r.id} value={r.id}>{r.name} ({t?.label ?? r.type})</option>
                })}
              </select>
              <div className="text-xs text-gray-400 mt-1">Verás todos los recursos del sistema. El supervisor decide si autoriza.</div>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Tipo de recurso nuevo *</label>
                <select className="input" value={form.newResourceType} onChange={(e) => setForm({ ...form, newResourceType: e.target.value })}>
                  <option value="">— Elige el tipo —</option>
                  {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Especialidad (opcional)</label>
                <input className="input" placeholder="Ej: para optometría, retina, biometría..." value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Semana desde (opcional)</label>
              <select className="input text-xs" value={form.startWeekId} onChange={(e) => setForm({ ...form, startWeekId: e.target.value })}>
                <option value="">Sin fecha</option>
                {semanas.map((s) => <option key={s.id} value={s.id}>{(s.start_date ?? '').slice(0, 10)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Semana hasta (opcional)</label>
              <select className="input text-xs" value={form.endWeekId} onChange={(e) => setForm({ ...form, endWeekId: e.target.value })}>
                <option value="">Sin fecha</option>
                {semanas.map((s) => <option key={s.id} value={s.id}>{(s.start_date ?? '').slice(0, 10)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Justificación * <span className="text-gray-400">(mín 10 caracteres)</span></label>
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Explica brevemente por qué necesitas este recurso en esa sede"
              value={form.justification}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
            />
            <div className="text-xs text-gray-400 mt-1">{form.justification.length}/2000 caracteres</div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
            💡 Tu solicitud llega al supervisor por notificación. Cuando la apruebe o rechace, te avisaremos.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" disabled={!valida || isPending} onClick={() => mutate()}>
            {isPending ? <Spinner size="sm" /> : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
