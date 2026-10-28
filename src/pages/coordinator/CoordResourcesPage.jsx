import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recursoService, backofficeService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, BarProgress, Spinner, EmptyState, SectionHeader, Avatar, usePaginacion, Paginacion } from '@/components/ui'
import { TIPOS_RECURSO, formatHoras, utilizacionSemanal } from '@/utils/helpers'
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

  // §6 · Los KPIs y las filas salen del MISMO cálculo (utilizacionSemanal).
  // Antes cada uno tenía su fórmula y en semanas con festivo el contador de
  // arriba y las etiquetas de abajo daban números distintos.
  const util = recursos.map((r) => ({ r, u: utilizacionSemanal(r) }))
  const ociosos = util.filter(({ u }) => u.ociosa).length
  const limite = util.filter(({ u }) => u.aplica && u.pct >= 90).length
  const liberadas = recursos.filter((r) => r.status_badge === 'liberada').length
  const extras = recursos.filter((r) => r.is_overtime).length
  const sinTope = util.filter(({ u }) => !u.aplica && !u.ausente).length

  // Lista larga → se pagina, igual que la grilla de Gestión de ausencias.
  const pag = usePaginacion(util, 15)

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

      {/* ====================================================================
          §6 · PROYECTOS-3398 — LA CONFIRMACIÓN DE RECURSOS EN SEDE VA EN LISTA.

          Antes era una pila de tarjetas: cada recurso ocupaba un bloque con
          avatar, badges y barra de progreso, así que un coordinador con 30
          personas tenía que bajar la rueda del mouse para repasarlas. Lo que
          hace cada mañana es un repaso de arriba abajo — quién está, cuántas
          horas tiene, a quién le falta carga — y para eso una tabla deja
          comparar la columna de una ojeada. La barra se queda, pero dentro de
          su celda.
          ==================================================================== */}
      <div className="card">
        <SectionHeader
          title={`Recursos (${recursos.length})`}
          subtitle={sinTope > 0 ? `${sinTope} cobra${sinTope === 1 ? '' : 'n'} por paciente — sin tope semanal` : undefined}
        />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : recursos.length === 0 ? (
          <EmptyState icon="👥" title="Sin recursos" description="No hay recursos asignados a esta sede" />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs min-w-[760px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="px-3 py-2 font-medium">Recurso</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Especialidad</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Horas semana</th>
                    <th className="px-3 py-2 font-medium w-40">Utilización</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {pag.visibles.map(({ r, u }) => {
                    const tipoInfo = TIPOS_RECURSO.find((t) => t.value === r.type)
                    const esApoyo = r.type === 'auxiliar' || r.type === 'auxiliar_admin' || r.type === 'asesor_servicios'
                    const puedeBackoffice = r.status_badge === 'liberada' || (esApoyo && u.ociosa)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/70">
                        <td className="px-3 py-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <Avatar nombre={r.name} size="sm" color={tipoInfo?.color ?? 'blue'} />
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 leading-5">{r.name}</div>
                              {/* La sugerencia de backoffice se queda pegada al
                                  nombre: es un consejo sobre esa persona, no una
                                  columna que tenga sentido comparar. */}
                              {esApoyo && (u.ociosa || r.status_badge === 'liberada') && tareaSugerida && (
                                <div className="text-[11px] text-blue-700 italic leading-4">
                                  Sugerencia: {tareaSugerida.name} ({tareaSugerida.estimated_minutes} min/u)
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100">
                          <Badge variant={tipoInfo?.color ?? 'gray'}>{tipoInfo?.label ?? r.type}</Badge>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-600">
                          {r.specialty ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-700 whitespace-nowrap">
                          {formatHoras(u.horas)}
                          {u.aplica ? (
                            <span className="text-gray-400"> / {formatHoras(u.tope)}</span>
                          ) : !u.ausente && (
                            <span className="text-gray-400"> · sin tope</span>
                          )}
                          {u.festivos > 0 && u.aplica && (
                            <span
                              className="text-blue-600 ml-1"
                              title={`${u.festivos} festivo${u.festivos > 1 ? 's' : ''} esta semana — tope ajustado de ${formatHoras(u.topeNominal)} a ${formatHoras(u.tope)}`}
                            >
                              🎉
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100">
                          {u.aplica ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-[72px]">
                                <BarProgress
                                  value={u.horas}
                                  max={u.tope}
                                  color={r.is_overtime ? 'red' : u.ociosa ? 'amber' : 'green'}
                                />
                              </div>
                              <span className="text-gray-500 tabular-nums w-9 text-right">{u.pct}%</span>
                            </div>
                          ) : u.ausente ? (
                            <span className="text-gray-400">Ausente toda la semana</span>
                          ) : (
                            /* Quien cobra por paciente no tiene tope semanal, así
                               que un porcentaje aquí sería un número inventado. */
                            <span className="text-gray-400">Por paciente</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100">
                          <div className="flex flex-wrap gap-1">
                            {u.diasAusente > 0 && (
                              <Badge variant="blue">{u.motivoAusencia ?? 'Ausente'}{u.ausente ? '' : ` · ${u.diasAusente} d`}</Badge>
                            )}
                            {u.ociosa && <Badge variant="amber">ociosa</Badge>}
                            {u.cerca && <Badge variant="red">cerca del límite</Badge>}
                            {r.is_overtime && <Badge variant="red">horas extras</Badge>}
                            {r.status_badge === 'liberada' && <Badge variant="yellow">liberada</Badge>}
                            {!u.ociosa && !u.cerca && !r.is_overtime && r.status_badge !== 'liberada' && !u.diasAusente && (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-right">
                          {puedeBackoffice && (
                            <button
                              className="btn text-[11px] whitespace-nowrap"
                              onClick={() => setBoAux(r)}
                              title={r.status_badge === 'liberada' ? 'Persona liberada por ausencia' : 'Persona con horas libres'}
                            >
                              Asignar backoffice
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Paginacion estado={pag} etiqueta="recursos" />
          </>
        )}
      </div>

      {boAux && <AsignarBackofficeModal auxiliar={boAux} onClose={() => setBoAux(null)} />}
    </div>
  )
}
