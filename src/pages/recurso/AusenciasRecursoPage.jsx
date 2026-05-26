import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { historialAusenciasService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, KpiCard, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { TIPOS_AUSENCIA } from '@/utils/helpers'
import AusenciaFormModal from '@/pages/recurso/AusenciaFormModal'

const TIPO_LABEL = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

export default function AusenciasRecursoPage() {
  const { user } = useAuthStore()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [showAusencia, setShowAusencia] = useState(false)

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['historial-ausencias', user?.recurso_id],
    queryFn: () => historialAusenciasService.list(user?.recurso_id),
  })

  const filtradas = filtroTipo ? data.filter((a) => a.tipo === filtroTipo) : data
  const pendientes = data.filter((a) => a.estado === 'pendiente').length
  const totalDias = data.reduce((acc, a) => acc + (differenceInDays(parseISO(a.fecha_fin), parseISO(a.fecha_inicio)) + 1), 0)
  const pacientesImpactados = data.reduce((acc, a) => acc + (a.pacientes_impactados ?? 0), 0)

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Mis ausencias</h1>
          <p className="text-xs text-gray-500">Historial de ausencias reportadas</p>
        </div>
        <button className="btn-danger" onClick={() => setShowAusencia(true)}>
          ⚠️ Reportar ausencia
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <KpiCard label="Ausencias en 2026" value={data.length} />
        <KpiCard label="Días totales" value={totalDias} />
        <KpiCard label="Pacientes impactados" value={pacientesImpactados} color={pacientesImpactados > 0 ? 'danger' : 'default'} />
        <KpiCard label="Pendientes" value={pendientes} color={pendientes > 0 ? 'warning' : 'default'} />
      </div>

      <div className="card">
        <SectionHeader
          title="Historial completo"
          action={
            <select className="input w-auto text-xs" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_AUSENCIA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          }
        />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtradas.length === 0 ? (
          <EmptyState icon="📋" title="Sin ausencias registradas" description="No has reportado ausencias en este período." />
        ) : (
          <div className="space-y-2">
            {filtradas.map((a) => (
              <div key={a.id} className={`border rounded-lg p-3 ${a.estado === 'pendiente' ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900">{TIPO_LABEL[a.tipo] ?? a.tipo}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {format(parseISO(a.fecha_inicio), 'd MMM yyyy', { locale: es })}
                      {a.fecha_fin !== a.fecha_inicio && ` – ${format(parseISO(a.fecha_fin), 'd MMM yyyy', { locale: es })}`}
                    </div>
                    {a.motivo && <div className="text-xs text-gray-600 mt-1 italic">"{a.motivo}"</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={a.estado === 'confirmada' ? 'green' : a.estado === 'pendiente' ? 'amber' : 'red'}>
                      {a.estado}
                    </Badge>
                    {a.pacientes_impactados > 0 && (
                      <Badge variant="red">{a.pacientes_impactados} pac.</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAusencia && (
        <AusenciaFormModal
          recursoId={user?.recurso_id}
          esquemaPago={user?.esquema_pago}
          onClose={() => { setShowAusencia(false); refetch() }}
          horarioSemana={[]}
        />
      )}
    </div>
  )
}
