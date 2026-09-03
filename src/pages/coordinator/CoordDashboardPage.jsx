import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { ausenciaService, recursoService } from '@/services/api'
import { AlertRow, BarProgress, KpiCard, Spinner, SectionHeader } from '@/components/ui'
import { Badge } from '@/components/ui'
import { formatHoras } from '@/utils/helpers'
import { useNavigate } from 'react-router-dom'
import { useSedeActiva } from '@/hooks/useActiveSite'

export default function DashboardCoordPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { siteId: sedeId, Selector } = useSedeActiva()

  const { data: ausencias = [], isLoading: loadAus } = useQuery({
    queryKey: ['ausencias-pendientes', sedeId],
    queryFn: () => ausenciaService.list({ site_id: sedeId, status: 'pendiente' }),
  })

  // El coord-líder ve SU equipo completo (no solo el de la sede activa).
  // Si es supervisor/gerencia mirando, sí filtramos por la sede seleccionada.
  //
  // IMPORTANTE: el endpoint /recursos no soporta CSV de tipos (busca exact
  // match). Por eso traemos AUXILIARES y TÉCNICOS por separado y combinamos
  // en el cliente. Esto cubre tanto sedes quirúrgicas (auxiliares de enfermería)
  // como sedes diagnósticas (técnicos de diagnóstico — TIO, biometría, etc.).
  const esCoord = user?.role === 'coordinador'
  const baseParams = esCoord
    ? { lead_coordinator_id: user?.id, active: true }
    : { site_id: sedeId, active: true }

  const { data: auxiliares = [], isLoading: loadAux } = useQuery({
    queryKey: ['recursos-coord-dash-aux', esCoord ? user?.id : sedeId],
    queryFn: () => recursoService.list({ ...baseParams, type: 'auxiliar' }),
  })
  const { data: tecnicos = [], isLoading: loadTec } = useQuery({
    queryKey: ['recursos-coord-dash-tec', esCoord ? user?.id : sedeId],
    queryFn: () => recursoService.list({ ...baseParams, type: 'tecnico' }),
  })
  // Dedup por id (un técnico con tiposApoyo='auxiliar' puede aparecer en ambas).
  const recursos = useMemo(() => {
    const map = new Map()
    for (const r of [...auxiliares, ...tecnicos]) map.set(r.id, r)
    return [...map.values()]
  }, [auxiliares, tecnicos])
  const loadRec = loadAux || loadTec

  const ociosas = recursos.filter((r) => (r.assigned_hours ?? 0) < (r.max_hours_per_week ?? 44) * 0.6)
  const conExtras = recursos.filter((r) => r.is_overtime)
  // RN-24 (estado_badge='liberada') aplica solo a auxiliares de oftalmología,
  // así que el conteo natural sigue dando 0 para coords de técnicos. OK.
  const liberadas = recursos.filter((r) => r.status_badge === 'liberada')

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Dashboard operativo</h1>
          <p className="text-xs text-gray-500">{user?.name} · {user?.site_names?.join(', ')}</p>
          <Selector className="mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" onClick={() => navigate('/app/programador')}>
            📅 Ir al programador
          </button>
        </div>
      </div>

      {/* KPIs — incluyen auxiliares de enfermería + técnicos de diagnóstico */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Ausencias pendientes" value={ausencias.length} color={ausencias.length > 0 ? 'danger' : 'default'} />
        <KpiCard label="Aux./Téc. ociosos" value={ociosas.length} color={ociosas.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Con horas extras" value={conExtras.length} color={conExtras.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Auxiliares liberadas" value={liberadas.length} color={liberadas.length > 0 ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alertas */}
        <div className="card">
          <SectionHeader title="Alertas activas" action={<span className="text-xs text-gray-400">{ausencias.length + ociosas.length} total</span>} />
          {loadAus ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <>
              {ausencias.map((a) => (
                <AlertRow
                  key={a.id}
                  tipo="rojo"
                  titulo={`Ausencia sin confirmar — ${a.resource?.name}`}
                  subtitulo={`${a.patients_affected ?? '?'} pac. · ${a.type}`}
                  actionLabel="Ver"
                  onAction={() => navigate('/app/ausencias-coord')}
                />
              ))}
              {ociosas.map((r) => (
                <AlertRow
                  key={r.id}
                  tipo="amarillo"
                  titulo={`${r.name} · ${formatHoras(r.assigned_hours ?? 0)} / ${formatHoras((r.max_hours_per_week ?? 42))}`}
                  subtitulo="Costo fijo sin utilizar"
                  actionLabel="Asignar"
                  onAction={() => navigate('/app/programador')}
                />
              ))}
              {liberadas.map((r) => (
                <AlertRow
                  key={`lib-${r.id}`}
                  tipo="amarillo"
                  titulo={`${r.name} liberada por ausencia de médico`}
                  subtitulo="Disponible para reasignar o enviar a backoffice"
                  actionLabel="Reasignar"
                  onAction={() => navigate('/app/programador')}
                />
              ))}
              {ausencias.length === 0 && ociosas.length === 0 && liberadas.length === 0 && (
                <div className="py-4 text-center text-xs text-gray-400">Sin alertas activas ✓</div>
              )}
            </>
          )}
        </div>

        {/* Lista de auxiliares + técnicos del equipo del coord */}
        <div className="card">
          <SectionHeader title="Mi equipo — horas semana" action={<button className="text-xs text-brand-600 hover:underline" onClick={() => navigate('/app/recursos-coord')}>Ver todos</button>} />
          {loadRec ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <div className="space-y-2.5">
              {recursos.slice(0, 8).map((r) => {
                const horasEfec = r.assigned_hours ?? 0
                // horas_presencia_semana viene del backend (jul-2026): son las
                // horas brutas SIN descontar almuerzo. Sirve para explicar por
                // qué 6 turnos de 6h se ven como 30h (efectivas) y no 36h.
                const horasPres = r.weekly_presence_hours ?? horasEfec
                const tope = r.max_hours_per_week ?? 42
                const pct = Math.min(100, Math.round((horasEfec / tope) * 100))
                const isOciosa = pct < 60
                const isExtra = r.is_overtime
                const isLib = r.status_badge === 'liberada'
                const hoverExplicacion = horasPres > horasEfec
                  ? `${formatHoras(horasEfec)} efectivas · ${formatHoras(horasPres)} de presencia · tope ${formatHoras(tope)} (Ley 2101). El sistema compara EFECTIVAS vs. tope — la diferencia con presencia es el almuerzo descontado en turnos ≥ 6h que empiezan antes de las 12.`
                  : `${formatHoras(horasEfec)} de ${formatHoras(tope)} (tope semanal Ley 2101)`
                return (
                  <div key={r.id} title={hoverExplicacion}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-700 flex-1 truncate">{r.name}</span>
                      {isLib && <Badge variant="yellow" className="text-xs py-0">backoffice</Badge>}
                      {isOciosa && <Badge variant="amber" className="text-xs py-0">ociosa</Badge>}
                      {isExtra && <Badge variant="red" className="text-xs py-0">extras</Badge>}
                      <span className={`text-xs ${isExtra ? 'text-red-600' : isOciosa ? 'text-amber-600' : 'text-green-700'}`}>
                        {formatHoras(horasEfec)} / {formatHoras(tope)} · <strong>{pct}%</strong>
                      </span>
                    </div>
                    <BarProgress value={horasEfec} max={tope} />
                    {horasPres > horasEfec && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {formatHoras(horasPres)} presencia (−{formatHoras(horasPres - horasEfec)} almuerzo)
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/ausencias-coord')}>📋 Gestionar ausencias</button>
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/ejecucion')}>✅ Registrar ejecución</button>
        <button className="btn justify-start gap-2" onClick={() => navigate('/app/informes/ocupacion')}>📊 Ver informe de ocupación</button>
      </div>
    </div>
  )
}
