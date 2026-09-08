import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { historialAusenciasService, reposicionService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, KpiCard, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { TIPOS_AUSENCIA, parseFechaLocal } from '@/utils/helpers'
import AusenciaFormModal from '@/pages/resource/AbsenceFormModal'
import RegistrarReposicionModal from '@/pages/resource/LogMakeupModal'

const TIPO_LABEL = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

export default function AusenciasRecursoPage() {
  const { user } = useAuthStore()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [showAusencia, setShowAusencia] = useState(false)
  const [reponerAusencia, setReponerAusencia] = useState(null)  // ausencia seleccionada para proponer reposición

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['historial-ausencias', user?.resource_id],
    queryFn: () => historialAusenciasService.list(user?.resource_id),
  })

  // Reposiciones del profesional (para saber si una ausencia ya tiene propuesta).
  const { data: reposiciones = [] } = useQuery({
    queryKey: ['reposiciones-recurso', user?.resource_id],
    queryFn: () => reposicionService.list(),
    enabled: user?.role === 'recurso',
    staleTime: 60 * 1000,
  })
  // Índice: ausencia_id → última reposición en estado != rechazada
  const repoPorAusencia = new Map()
  for (const r of reposiciones) {
    const key = r.absence_id
    const prev = repoPorAusencia.get(key)
    // Preferimos solicitada > aprobada > rechazada para mostrar el estado más útil.
    if (!prev || (prev.status === 'rechazada' && r.status !== 'rechazada')) {
      repoPorAusencia.set(key, r)
    }
  }

  const filtradas = filtroTipo ? data.filter((a) => a.type === filtroTipo) : data
  const pendientes = data.filter((a) => a.status === 'pendiente').length
  const totalDias = data.reduce((acc, a) => acc + (differenceInDays(parseFechaLocal(a.end_date), parseFechaLocal(a.start_date)) + 1), 0)
  const pacientesImpactados = data.reduce((acc, a) => acc + (a.patients_affected ?? 0), 0)

  return (
    <div className="p-3 sm:p-4 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Mis ausencias</h1>
          <p className="text-xs text-gray-500">Historial de ausencias reportadas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-danger" onClick={() => setShowAusencia(true)}>
            ⚠️ Reportar ausencia
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
            {filtradas.map((a) => {
              const repo = repoPorAusencia.get(a.id)
              const puedeProponer = a.status === 'confirmada' && (!repo || repo.status === 'rechazada')
              return (
              <div key={a.id} className={`border rounded-lg p-3 ${a.status === 'pendiente' ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900">{TIPO_LABEL[a.type] ?? a.type}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {format(parseFechaLocal(a.start_date), 'd MMM yyyy', { locale: es })}
                      {a.end_date !== a.start_date && ` – ${format(parseFechaLocal(a.end_date), 'd MMM yyyy', { locale: es })}`}
                    </div>
                    {a.reason && <div className="text-xs text-gray-600 mt-1 italic">"{a.reason}"</div>}
                    {repo && (
                      <div className="mt-2 text-xs">
                        <span className="text-gray-500">🔁 Reposición: </span>
                        <span className={
                          repo.status === 'aprobada'   ? 'text-green-700 font-medium' :
                          repo.status === 'rechazada'  ? 'text-red-700 font-medium' :
                          'text-amber-700 font-medium'
                        }>
                          {repo.status}
                        </span>
                        <span className="text-gray-500"> · {format(parseFechaLocal(repo.makeup_date), "d MMM yyyy", { locale: es })}
                          · {repo.start_time}–{repo.end_time}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={a.status === 'confirmada' ? 'green' : a.status === 'pendiente' ? 'amber' : 'red'}>
                      {a.status}
                    </Badge>
                    {a.patients_affected > 0 && (
                      <Badge variant="red">{a.patients_affected} pac.</Badge>
                    )}
                    {puedeProponer && (
                      <button
                        type="button"
                        onClick={() => setReponerAusencia(a)}
                        className="text-[11px] px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-800 transition"
                      >
                        🔁 Proponer reposición
                      </button>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {showAusencia && (
        <AusenciaFormModal
          recursoId={user?.resource_id}
          esquemaPago={user?.pay_scheme}
          onClose={() => { setShowAusencia(false); refetch() }}
          horarioSemana={[]}
        />
      )}

      {reponerAusencia && (
        <RegistrarReposicionModal
          ausencia={reponerAusencia}
          onClose={() => setReponerAusencia(null)}
        />
      )}
    </div>
  )
}
