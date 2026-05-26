import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { auditoriaService } from '@/services/api'
import { Avatar, Badge, Spinner, EmptyState } from '@/components/ui'

const ACCION_LABEL = {
  modificar_semana_cerrada: { label: 'Modificó semana cerrada', color: 'red' },
  cambiar_parametro_costo:  { label: 'Cambió parámetros de costo', color: 'amber' },
  registrar_ausencia_por_recurso: { label: 'Registró ausencia en nombre del recurso', color: 'blue' },
  crear_usuario:            { label: 'Creó un usuario', color: 'green' },
  modificar_usuario:        { label: 'Modificó usuario', color: 'blue' },
  desactivar_usuario:       { label: 'Desactivó usuario', color: 'red' },
  exportar_informe:         { label: 'Exportó un informe', color: 'gray' },
  crear_parametro_costo:    { label: 'Creó nueva vigencia de costo', color: 'amber' },
}

/**
 * HU-S-05: Log de auditoría — acciones críticas del sistema.
 * Solo lectura. Exportable a Excel.
 */
export default function AdminAuditoriaPage() {
  const [filtroAccion, setFiltroAccion] = useState('')
  const [desde, setDesde] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['auditoria', filtroAccion, desde, hasta],
    queryFn: () => auditoriaService.list({
      accion: filtroAccion || undefined,
      desde: desde,
      hasta: hasta + ' 23:59:59',
    }),
  })

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Log de auditoría</h1>
          <p className="text-xs text-gray-500">{logs.length} eventos registrados — solo lectura</p>
        </div>
        <button className="btn text-xs">📊 Exportar Excel</button>
      </div>

      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Acción</label>
            <select className="input" value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)}>
              <option value="">Todas las acciones</option>
              {Object.entries(ACCION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon="🔍" title="Sin eventos" description="No hay registros para los filtros seleccionados" />
        ) : (
          <div className="space-y-3">
            {logs.map((l) => {
              const a = ACCION_LABEL[l.accion] ?? { label: l.accion, color: 'gray' }
              return (
                <div key={l.id} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                  <Avatar nombre={l.usuario_nombre} size="sm" color="blue" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-900">{l.usuario_nombre}</span>
                      <Badge variant={a.color}>{a.label}</Badge>
                      <span className="text-xs text-gray-400">· {l.entidad}#{l.entidad_id}</span>
                    </div>
                    {l.motivo && (
                      <div className="text-xs text-gray-600 mt-1 italic">"{l.motivo}"</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {format(parseISO(l.creada_en.replace(' ', 'T')), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                      {l.ip_address && ` · ${l.ip_address}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
