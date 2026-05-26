import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { informeService } from '@/services/api'
import { KpiCard, Spinner, SectionHeader, Semaforo, Badge } from '@/components/ui'
import { formatCOP, formatPct, formatHoras } from '@/utils/helpers'

/**
 * HU-D-06: Comparativo semana actual vs anteriores (hasta 52 semanas).
 */
export default function ComparativoPage() {
  const [semanaB, setSemanaB] = useState('sem-anterior')

  const { data, isLoading } = useQuery({
    queryKey: ['comparativo', semanaB],
    queryFn: () => informeService.comparativo(semanaB),
  })

  if (isLoading || !data) {
    return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
  }

  // Fallback robusto cuando la BD aún no tiene semana de comparación
  const sinDatos = { label: '— (sin datos)', pacientes: 0, horas_ejec: 0, ocupacion: 0, ausencias: 0, costo_ausentismo: 0 }
  const a = data.semana_a ?? sinDatos
  const b = data.semana_b ?? sinDatos
  const hayComparacion = !!data.semana_a && !!data.semana_b
  const delta = (av, bv) => av - bv
  const pctDelta = (av, bv) => bv === 0 ? 0 : Math.round(((av - bv) / bv) * 100)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Comparativo semanal</h1>
          <p className="text-xs text-gray-500">Compara la semana actual contra cualquiera de las últimas 52</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">Comparar contra:</span>
          <select className="input w-auto text-xs" value={semanaB} onChange={(e) => setSemanaB(e.target.value)}>
            <option value="sem-anterior">Semana anterior</option>
            <option value="sem-mes-anterior">Misma semana del mes anterior</option>
            <option value="sem-trimestre-anterior">Misma semana del trimestre anterior</option>
          </select>
          <button className="btn text-xs">📥 PDF</button>
          <button className="btn text-xs">📊 Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card">
          <div className="text-xs text-gray-400 mb-1">A</div>
          <div className="text-sm font-medium text-gray-900">{a.label}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-400 mb-1">B (comparación)</div>
          <div className="text-sm font-medium text-gray-900">{b.label}</div>
        </div>
      </div>

      {!hayComparacion && (
        <div className="card mb-4 bg-amber-50 border-amber-100">
          <div className="text-xs text-amber-800">
            ⓘ La BD aún no tiene una segunda semana para comparar. La comparativa se irá llenando a medida que el coordinador cree y cierre nuevas semanas en el programador.
          </div>
        </div>
      )}

      {/* Tabla comparativa */}
      <div className="card mb-4">
        <SectionHeader title="Indicadores comparados" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-2 text-left">Indicador</th>
              <th className="px-3 py-2 text-right">A</th>
              <th className="px-3 py-2 text-right">B</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">% variación</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Pacientes programados" a={a.pacientes} b={b.pacientes} better="up" />
            <Row label="Horas ejecutadas" a={formatHoras(a.horas_ejec)} b={formatHoras(b.horas_ejec)} delta={delta(a.horas_ejec, b.horas_ejec)} pct={pctDelta(a.horas_ejec, b.horas_ejec)} unidad="h" better="up" />
            <Row label="Ocupación global" a={`${a.ocupacion}%`} b={`${b.ocupacion}%`} delta={delta(a.ocupacion, b.ocupacion)} pct={pctDelta(a.ocupacion, b.ocupacion)} unidad="pp" better="up" semaforoA={a.ocupacion} semaforoB={b.ocupacion} />
            <Row label="Ausencias" a={a.ausencias} b={b.ausencias} better="down" />
            <Row label="Costo de ausentismo" a={formatCOP(a.costo_ausentismo)} b={formatCOP(b.costo_ausentismo)} delta={delta(a.costo_ausentismo, b.costo_ausentismo)} pct={pctDelta(a.costo_ausentismo, b.costo_ausentismo)} unidad="$" better="down" />
          </tbody>
        </table>
      </div>

      {/* Tendencia 12 semanas */}
      <div className="card">
        <SectionHeader title="Tendencia · últimas 12 semanas" subtitle="Pacientes y ocupación" />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.ultimas_12}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="pacientes" stroke="#185FA5" name="Pacientes" />
            <Line yAxisId="right" type="monotone" dataKey="ocupacion" stroke="#22c55e" name="% Ocupación" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Row({ label, a, b, delta, pct, unidad, better, semaforoA, semaforoB }) {
  // Si no se pasan delta/pct, calcular si los valores son numéricos
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  const d = delta ?? (aNum !== null && bNum !== null ? aNum - bNum : null)
  const p = pct ?? (aNum !== null && bNum !== null && bNum !== 0 ? Math.round((d / bNum) * 100) : null)
  const positivo = d != null && d > 0
  const negativo = d != null && d < 0
  // El color depende de si "subir" es mejor o peor
  const colorDelta = d == null ? 'text-gray-500' :
    (positivo && better === 'up') || (negativo && better === 'down') ? 'text-green-700' :
    (negativo && better === 'up') || (positivo && better === 'down') ? 'text-red-700' :
    'text-gray-500'

  return (
    <tr className="border-b border-gray-50">
      <td className="px-3 py-2 text-xs text-gray-700">{label}</td>
      <td className="px-3 py-2 text-xs text-right font-medium text-gray-900">
        {a}
        {semaforoA != null && <Semaforo pct={semaforoA} metaVerde={80} />}
      </td>
      <td className="px-3 py-2 text-xs text-right text-gray-600">
        {b}
        {semaforoB != null && <Semaforo pct={semaforoB} metaVerde={80} />}
      </td>
      <td className={`px-3 py-2 text-xs text-right font-medium ${colorDelta}`}>
        {d == null ? '—' : (d > 0 ? `+${d}${unidad ?? ''}` : `${d}${unidad ?? ''}`)}
      </td>
      <td className={`px-3 py-2 text-xs text-right font-medium ${colorDelta}`}>
        {p == null ? '—' : (p > 0 ? `+${p}%` : `${p}%`)}
      </td>
    </tr>
  )
}
