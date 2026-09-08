import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { quejaService, recursoService, sedeService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { titleCase } from '@/utils/helpers'

/**
 * PROYECTOS-3255 #4.1 · Módulo Queja (MVP).
 *
 * Lista + crear + cambiar estado. Coordinador ve solo sus sedes; supervisor,
 * gerencia y directivo ven todas.
 *
 * NOTA: Este modulo se implemento con supuestos razonables (Fase 6 sep-2026)
 * pendiente de confirmar con Maremys el flujo exacto. Fields ajustables:
 * origen, prioridad, estados, notificaciones.
 */

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', variant: 'amber' },
  { value: 'en_atencion', label: 'En atención', variant: 'blue' },
  { value: 'resuelta', label: 'Resuelta', variant: 'green' },
  { value: 'desestimada', label: 'Desestimada', variant: 'gray' },
]
const PRIORIDADES = [
  { value: 'baja', label: 'Baja', variant: 'gray' },
  { value: 'media', label: 'Media', variant: 'amber' },
  { value: 'alta', label: 'Alta', variant: 'red' },
]
const ORIGENES = [
  { value: 'paciente', label: 'Paciente' },
  { value: 'interno', label: 'Interno' },
  { value: 'directivo', label: 'Directivo' },
]

const estadoInfo = (v) => ESTADOS.find((e) => e.value === v) ?? { label: v, variant: 'gray' }
const prioridadInfo = (v) => PRIORIDADES.find((p) => p.value === v) ?? { label: v, variant: 'gray' }

export default function ComplaintsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState('')
  const [filtroSede, setFiltroSede] = useState('')
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false)

  const { data: quejas = [], isLoading } = useQuery({
    queryKey: ['quejas', filtroEstado, filtroPrioridad, filtroSede],
    queryFn: () => quejaService.list({
      ...(filtroEstado && { status: filtroEstado }),
      ...(filtroPrioridad && { priority: filtroPrioridad }),
      ...(filtroSede && { site_id: filtroSede }),
    }),
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-quejas'],
    queryFn: () => sedeService.list(),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ id, status }) => quejaService.actualizar(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quejas'] })
      toast.success('Estado actualizado')
    },
    onError: (e) => toast.error(e.response?.data?.error ?? 'Error al actualizar'),
  })

  const totales = {
    pendiente: quejas.filter((q) => q.status === 'pendiente').length,
    en_atencion: quejas.filter((q) => q.status === 'en_atencion').length,
    resuelta: quejas.filter((q) => q.status === 'resuelta').length,
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quejas</h1>
          <p className="text-sm text-gray-500 mt-1">Registro de incidentes sobre recursos y ausencias.</p>
        </div>
        <button className="btn-primary" onClick={() => setModalCrearAbierto(true)}>
          + Registrar queja
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Total</div><div className="text-2xl font-bold text-gray-900">{quejas.length}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Pendientes</div><div className="text-2xl font-bold text-amber-600">{totales.pendiente}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">En atención</div><div className="text-2xl font-bold text-blue-600">{totales.en_atencion}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Resueltas</div><div className="text-2xl font-bold text-green-600">{totales.resuelta}</div></div>
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <select className="input text-sm max-w-[180px]" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <select className="input text-sm max-w-[180px]" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {(user?.role !== 'coordinador') && (
          <select className="input text-sm max-w-[220px]" value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{titleCase(s.name)}</option>)}
          </select>
        )}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : quejas.length === 0 ? (
          <EmptyState icon="✅" title="Sin quejas para los filtros seleccionados" description="No hay incidentes registrados con estos filtros. Puedes registrar una nueva desde el botón superior." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Recurso</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Sede</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Origen</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Prioridad</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Descripción</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {quejas.map((q) => {
                  const ei = estadoInfo(q.status)
                  const pi = prioridadInfo(q.priority)
                  return (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {q.createdAt ? format(parseISO(q.createdAt), 'dd/MM/yy', { locale: es }) : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{titleCase(q.resource?.name ?? '—')}</td>
                      <td className="px-3 py-2 text-gray-700">{titleCase(q.site?.name ?? '—')}</td>
                      <td className="px-3 py-2 text-gray-700 capitalize">{q.source}</td>
                      <td className="px-3 py-2"><Badge variant={pi.variant}>{pi.label}</Badge></td>
                      <td className="px-3 py-2 text-gray-700 max-w-md truncate" title={q.description}>{q.description}</td>
                      <td className="px-3 py-2"><Badge variant={ei.variant}>{ei.label}</Badge></td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {q.status !== 'resuelta' && q.status !== 'desestimada' && (
                          <select
                            className="input text-xs py-1"
                            value={q.status}
                            onChange={(e) => cambiarEstado.mutate({ id: q.id, status: e.target.value })}
                            disabled={cambiarEstado.isPending}
                          >
                            {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCrearAbierto && (
        <CrearQuejaModal
          sedes={sedes}
          userRole={user?.role}
          onClose={() => setModalCrearAbierto(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['quejas'] })
            setModalCrearAbierto(false)
            toast.success('Queja registrada')
          }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------
// Modal de crear queja
// ----------------------------------------------------------
function CrearQuejaModal({ sedes, userRole, onClose, onCreated }) {
  const [siteId, setSiteId] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [source, setSource] = useState('paciente')
  const [priority, setPriority] = useState('media')
  const [description, setDescription] = useState('')

  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-queja', siteId],
    queryFn: () => recursoService.list(siteId ? { site_id: siteId, active: true } : { active: true }),
    enabled: !!siteId,
  })

  const crear = useMutation({
    mutationFn: () => quejaService.crear({
      siteId, resourceId, source, priority, description: description.trim(),
    }),
    onSuccess: onCreated,
    onError: (e) => toast.error(e.response?.data?.error ?? 'Error al registrar'),
  })

  const puedeEnviar = siteId && resourceId && description.trim().length >= 3

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Registrar queja</h2>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}>✕</button>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700">Sede</label>
          <select className="input mt-1" value={siteId} onChange={(e) => { setSiteId(e.target.value); setResourceId('') }}>
            <option value="">Seleccionar sede</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{titleCase(s.name)}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700">Recurso</label>
          <select className="input mt-1" value={resourceId} onChange={(e) => setResourceId(e.target.value)} disabled={!siteId}>
            <option value="">Seleccionar recurso</option>
            {recursos.map((r) => <option key={r.id} value={r.id}>{titleCase(r.name)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Origen</label>
            <select className="input mt-1" value={source} onChange={(e) => setSource(e.target.value)}>
              {ORIGENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Prioridad</label>
            <select className="input mt-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700">Descripción</label>
          <textarea
            className="input mt-1 min-h-[100px]"
            placeholder="Detalle del incidente (mínimo 3 caracteres)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
          <p className="text-xs text-gray-400 mt-1">{description.length} / 2000</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={() => crear.mutate()}
            disabled={!puedeEnviar || crear.isPending}
          >
            {crear.isPending ? 'Enviando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
