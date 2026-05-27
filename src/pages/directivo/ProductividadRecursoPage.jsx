import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { recursoService } from '@/services/api'
import { KpiCard, Spinner, SectionHeader, EmptyState } from '@/components/ui'
import { formatCOP, TIPOS_RECURSO } from '@/utils/helpers'

const tipoLabel = (tipo) => TIPOS_RECURSO.find((t) => t.value === tipo)?.label ?? tipo

/**
 * Productividad por recurso (HU-R-08 reubicada a gestión).
 * El directivo/supervisor filtra por tipo y/o busca por nombre, elige un recurso
 * y ve sus estadísticas de desempeño. Antes era "Mi productividad" del recurso.
 */
export default function ProductividadRecursoPage() {
  const [recursoId, setRecursoId] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)

  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-para-productividad'],
    queryFn: () => recursoService.list({ activo: true }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['productividad-recurso', recursoId],
    queryFn: () => recursoService.productividad(recursoId),
    enabled: !!recursoId,
  })

  const recursoSel = recursos.find((r) => r.id === recursoId)
  const filtrados = recursos.filter((r) =>
    (!tipoFiltro || r.tipo === tipoFiltro) &&
    r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const seleccionar = (r) => {
    setRecursoId(r.id)
    setBusqueda(r.nombre)
    setAbierto(false)
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Productividad por recurso</h1>
        <p className="text-xs text-gray-500">Filtra por tipo o busca por nombre, y elige un recurso para ver su desempeño</p>
      </div>

      {/* Filtro por tipo + buscador con desplegable (compacto, no ocupa espacio fijo) */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Filtrar por tipo</label>
            <select
              className="input"
              value={tipoFiltro}
              onChange={(e) => { setTipoFiltro(e.target.value); setAbierto(true) }}
            >
              <option value="">Todos los tipos</option>
              {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Buscar por nombre</label>
            <div className="relative">
              <input
                className="input"
                placeholder="Escribe un nombre…"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setAbierto(true) }}
                onFocus={() => setAbierto(true)}
              />
              {abierto && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1">
                    <div className="px-3 py-1 text-[11px] text-gray-400 border-b border-gray-50">
                      {filtrados.length} resultado(s)
                    </div>
                    {filtrados.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
                    ) : (
                      filtrados.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-gray-50 ${r.id === recursoId ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                          onClick={() => seleccionar(r)}
                        >
                          <span>{r.nombre}</span>
                          <span className="text-xs text-gray-400">{tipoLabel(r.tipo)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {!recursoId ? (
        <EmptyState icon="📈" title="Selecciona un recurso" description="Usa el filtro o el buscador y elige un recurso para ver su productividad." />
      ) : isLoading || !data ? (
        <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
      ) : (
        <Detalle data={data} recurso={recursoSel} />
      )}
    </div>
  )
}

/** Vista detallada de KPIs + gráficos para el recurso seleccionado. */
function Detalle({ data, recurso }) {
  const promedio = data.promedio_4_semanas
  const variacionHoras = data.horas_semana_actual - promedio.horas
  const variacionPac = data.pacientes_semana - promedio.pacientes

  return (
    <>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Estadísticas de {recurso?.nombre ?? 'recurso'}
          {recurso?.tipo ? <span className="text-gray-400 font-normal"> · {tipoLabel(recurso.tipo)}</span> : null}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Horas esta semana"
          value={`${data.horas_semana_actual}h`}
          delta={variacionHoras >= 0 ? `+${variacionHoras}h vs promedio` : `${variacionHoras}h vs promedio`}
          deltaUp={variacionHoras >= 0}
        />
        <KpiCard label="Horas del mes" value={`${data.horas_mes}h`} />
        <KpiCard
          label="Pacientes esta semana"
          value={data.pacientes_semana}
          delta={variacionPac >= 0 ? `+${variacionPac} vs promedio` : `${variacionPac} vs promedio`}
          deltaUp={variacionPac >= 0}
        />
        <KpiCard label="Pacientes del mes" value={data.pacientes_mes} />
      </div>

      {data.incentivo_acumulado != null && (
        <div className="card mb-4 bg-green-50 border-green-100">
          <div className="text-xs text-green-700 font-medium">Incentivo estimado del período</div>
          <div className="text-2xl font-semibold text-green-800 mt-1">{formatCOP(data.incentivo_acumulado)}</div>
          <div className="text-xs text-green-600 mt-1">Calculado con base en pacientes atendidos</div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <SectionHeader title="Horas por semana — últimas 4" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.ultimas_4_semanas}>
              <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="horas" fill="#185FA5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <SectionHeader title="Pacientes por semana — últimas 4" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.ultimas_4_semanas}>
              <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="pacientes" radius={[4, 4, 0, 0]}>
                {data.ultimas_4_semanas.map((d, i) => (
                  <Cell key={i} fill={d.pacientes >= promedio.pacientes ? '#22c55e' : '#f59e0b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card mt-4">
        <SectionHeader title="Promedio de las últimas 4 semanas" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">Horas promedio</div>
            <div className="text-xl font-semibold text-gray-900">{promedio.horas}h</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Pacientes promedio</div>
            <div className="text-xl font-semibold text-gray-900">{promedio.pacientes}</div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400 mt-3">
        * Los datos provienen del registro de ejecución confirmado por el coordinador.
      </div>
    </>
  )
}
