import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recursoService, backofficeService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, BarProgress, Spinner, EmptyState, SectionHeader, Avatar } from '@/components/ui'
import { TIPOS_RECURSO, formatHoras } from '@/utils/helpers'
import AsignarBackofficeModal from '@/pages/coordinator/AssignBackofficeModal'
import { useSedeActiva } from '@/hooks/useActiveSite'

export default function RecursosCoordPage() {
  const { user } = useAuthStore()
  const { siteId: sedeId, Selector } = useSedeActiva()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [boAux, setBoAux] = useState(null)

  // El coordinador ve SU equipo COMPLETO (los recursos cuyo coordinador_lider_id = su ID),
  // sin filtro de sede — porque su equipo puede estar repartido en varias sedes
  // (ej: Rosa coordina técnicos de ayudas Dx que rotan entre 7 sedes).
  // Supervisor/gerencia ven todos los de la sede seleccionada.
  const esCoord = user?.role === 'coordinador'
  // activo:true para que NO aparezcan recursos desactivados (que el supervisor
  // ya marcó como inactivos por cambio de equipo, retiro, etc.).
  const params = esCoord
    ? {
        type: filtroTipo || undefined,
        lead_coordinator_id: user?.id,
        active: true,
      }
    : {
        type: filtroTipo || undefined,
        site_id: sedeId || undefined,
        active: true,
      }

  const { data: recursosRaw = [], isLoading } = useQuery({
    queryKey: ['recursos-sede-full', sedeId, filtroTipo, params.lead_coordinator_id],
    queryFn: () => recursoService.list(params),
  })

  // Filtro de búsqueda en cliente (no llama backend en cada tecla)
  const recursos = busqueda.trim()
    ? recursosRaw.filter((r) =>
        r.name.toLowerCase().includes(busqueda.trim().toLowerCase())
      )
    : recursosRaw

  // Tarea sugerida = primera tarea activa del catálogo (la que tenga menor tiempo
  // estimado, así "rinde" varias unidades). Solo se muestra para auxiliares ociosas.
  const { data: tareasActivas = [] } = useQuery({
    queryKey: ['tareas-bo-activas-sugerencia'],
    queryFn: () => backofficeService.tasks(),
  })
  const tareaSugerida = [...tareasActivas].sort((a, b) => (a.estimated_minutes ?? 60) - (b.estimated_minutes ?? 60))[0]

  const ociosos = recursos.filter((r) => ((r.assigned_hours ?? 0) / (r.max_hours_per_week ?? 42)) < 0.6).length
  const limite = recursos.filter((r) => ((r.assigned_hours ?? 0) / (r.max_hours_per_week ?? 42)) >= 0.9).length
  const liberadas = recursos.filter((r) => r.status_badge === 'liberada').length
  const extras = recursos.filter((r) => r.is_overtime).length

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Recursos de mi sede</h1>
          <p className="text-xs text-gray-500">Carga horaria semanal · alertas de utilización</p>
          <Selector className="mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="search"
            className="input w-full sm:w-56 text-xs"
            placeholder="🔍 Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="input w-auto text-xs" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-amber-600">{ociosos}</div>
          <div className="text-xs text-gray-500">Por debajo del 60%</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-red-600">{limite}</div>
          <div className="text-xs text-gray-500">Cerca del 90% del tope</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-yellow-700">{liberadas}</div>
          <div className="text-xs text-gray-500">Liberadas por ausencia</div>
        </div>
        <div className="kpi-card">
          <div className="text-2xl font-semibold text-red-700">{extras}</div>
          <div className="text-xs text-gray-500">Con horas extras</div>
        </div>
      </div>

      <div className="card">
        <SectionHeader title={`Recursos (${recursos.length})`} />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : recursos.length === 0 ? (
          <EmptyState icon="👥" title="Sin recursos" description="No hay recursos asignados a esta sede" />
        ) : (
          <div className="space-y-3">
            {recursos.map((r) => {
              const horas = r.assigned_hours ?? 0
              // Usa el tope ajustado por festivos si viene del backend, sino el nominal.
              const maxNominal = r.max_hours_per_week ?? 42
              const max = r.max_effective_hours ?? maxNominal
              const festivos = r.festivos_en_semana ?? 0
              const pct = Math.min(100, Math.round((horas / max) * 100))
              const ociosa = pct < 60
              const cerca = pct >= 90 && !r.is_overtime
              const tipoInfo = TIPOS_RECURSO.find((t) => t.value === r.type)
              return (
                <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar nombre={r.name} size="sm" color={tipoInfo?.color ?? 'blue'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{r.name}</span>
                        <Badge variant={tipoInfo?.color ?? 'gray'}>{tipoInfo?.label ?? r.type}</Badge>
                        {r.specialty && <span className="text-xs text-gray-500">· {r.specialty}</span>}
                        {ociosa && <Badge variant="amber">ociosa</Badge>}
                        {cerca && <Badge variant="red">cerca del límite</Badge>}
                        {r.is_overtime && <Badge variant="red">horas extras</Badge>}
                        {r.status_badge === 'liberada' && <Badge variant="yellow">liberada — disponible</Badge>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatHoras(horas)} / {formatHoras(max)} · {pct}%
                        {festivos > 0 && (
                          <span className="text-blue-600 ml-1" title={`${festivos} festivo${festivos>1?'s':''} esta semana — tope ajustado de ${formatHoras(maxNominal)} a ${formatHoras(max)}`}>
                            · 🎉 {festivos} festivo{festivos>1?'s':''} (tope ajustado)
                          </span>
                        )}
                      </div>
                      {/* Sugerencia de backoffice para auxiliares y asesores ociosas o liberadas */}
                      {(r.type === 'auxiliar' || r.type === 'auxiliar_admin' || r.type === 'asesor_servicios') && (ociosa || r.status_badge === 'liberada') && tareaSugerida && (
                        <div className="text-xs text-blue-700 mt-1 italic">
                          💡 Sugerencia: <strong>{tareaSugerida.name}</strong> ({tareaSugerida.estimated_minutes} min/u)
                        </div>
                      )}
                    </div>
                    {(r.status_badge === 'liberada' ||
                      ((r.type === 'auxiliar' || r.type === 'auxiliar_admin' || r.type === 'asesor_servicios') && ociosa)) && (
                      <button
                        className="btn text-xs whitespace-nowrap"
                        onClick={() => setBoAux(r)}
                        title={r.status_badge === 'liberada' ? 'Persona liberada por ausencia' : 'Persona con horas libres'}
                      >
                        🗂️ Asignar backoffice
                      </button>
                    )}
                  </div>
                  <BarProgress value={horas} max={max} color={r.is_overtime ? 'red' : ociosa ? 'amber' : 'green'} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {boAux && <AsignarBackofficeModal auxiliar={boAux} onClose={() => setBoAux(null)} />}
    </div>
  )
}
