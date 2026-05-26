import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { recursoService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { KpiCard, Spinner, SectionHeader, Badge } from '@/components/ui'
import { formatCOP } from '@/utils/helpers'

export default function ProductividadRecursoPage() {
  const { user } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['productividad-recurso', user?.recurso_id],
    queryFn: () => recursoService.productividad(user?.recurso_id),
  })

  if (isLoading || !data) {
    return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
  }

  const promedio = data.promedio_4_semanas
  const variacionHoras = data.horas_semana_actual - promedio.horas
  const variacionPac = data.pacientes_semana - promedio.pacientes

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Mis estadísticas</h1>
        <p className="text-xs text-gray-500">Productividad personal y comparación contra el promedio</p>
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
              <Bar dataKey="pacientes" fill="#22c55e" radius={[4, 4, 0, 0]}>
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
    </div>
  )
}
