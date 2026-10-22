import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import toast from 'react-hot-toast'
import { informeService } from '@/services/api'
import { Spinner, SectionHeader, Semaforo, Badge } from '@/components/ui'
import { formatCOP, formatHoras, descargarCSV } from '@/utils/helpers'

/**
 * HU-D-06: Comparativo entre dos semanas cualesquiera de las últimas 52.
 *
 * 22-oct · Hector: "no le veo coherencia". Decía "cualquiera de las últimas 52"
 * pero solo había 3 atajos para B, y A era siempre la semana en curso (a
 * medias). Ahora A y B se eligen de la lista; por defecto el servidor pone la
 * última semana completa contra la anterior.
 */
export default function ComparativoPage() {
  // '' = lo que elija el servidor por defecto.
  const [semanaA, setSemanaA] = useState('')
  const [semanaB, setSemanaB] = useState('')
  const navigate = useNavigate()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['comparativo', semanaA, semanaB],
    queryFn: () => informeService.comparativo({ semanaA, semanaB }),
    placeholderData: (prev) => prev,
  })

  if (isLoading || !data) {
    return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
  }

  // Fallback robusto cuando la BD aún no tiene semana de comparación
  const sinDatos = { label: '— (sin datos)', pacientes: 0, horas_ejec: 0, ocupacion: 0, absences: 0, costo_ausentismo: 0 }
  const a = data.semana_a ?? sinDatos
  const b = data.semana_b ?? sinDatos
  const hayComparacion = !!data.semana_a && !!data.semana_b
  const delta = (av, bv) => av - bv
  const pctDelta = (av, bv) => bv === 0 ? 0 : Math.round(((av - bv) / bv) * 100)

  const exportarCSV = () => {
    try {
      const headers = ['Indicador', `A · ${a.label}`, `B · ${b.label}`, 'Δ', '% variación']
      const filas = [
        ['Pacientes programados', a.pacientes, b.pacientes, delta(a.pacientes, b.pacientes), `${pctDelta(a.pacientes, b.pacientes)}%`],
        ['Horas ejecutadas',      a.horas_ejec, b.horas_ejec, delta(a.horas_ejec, b.horas_ejec), `${pctDelta(a.horas_ejec, b.horas_ejec)}%`],
        ['Ocupación global (%)',  a.ocupacion, b.ocupacion, delta(a.ocupacion, b.ocupacion), `${pctDelta(a.ocupacion, b.ocupacion)}%`],
        ['Ausencias',             a.absences, b.absences, delta(a.absences, b.absences), `${pctDelta(a.absences, b.absences)}%`],
        ['Costo de ausentismo',   a.costo_ausentismo, b.costo_ausentismo, delta(a.costo_ausentismo, b.costo_ausentismo), `${pctDelta(a.costo_ausentismo, b.costo_ausentismo)}%`],
      ]
      // Tendencia 12 semanas como segundo bloque
      if (Array.isArray(data.ultimas_12) && data.ultimas_12.length) {
        filas.push([], ['Tendencia · últimas 12 semanas'])
        filas.push(['Semana', 'Pacientes', '% Ocupación'])
        for (const r of data.ultimas_12) filas.push([r.week, r.pacientes, `${r.ocupacion}%`])
      }
      descargarCSV(`comparativo_${new Date().toISOString().slice(0,10)}`, headers, filas)
      toast.success('Comparativo exportado a CSV')
    } catch (e) {
      toast.error(e?.message ?? 'Error al exportar')
    }
  }

  return (
    <div className="p-3 sm:p-4">
      <button className="text-xs text-brand-600 hover:underline mb-2" onClick={() => navigate('/app/dashboard')}>
        ← Volver al dashboard
      </button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Históricos de semanas</h1>
          <p className="text-xs text-gray-500">Compara dos semanas cualesquiera de las últimas 52</p>
        </div>
        <div className="flex gap-2 items-center">
          {isFetching && <Spinner size="sm" />}
          <button className="btn text-xs" onClick={exportarCSV}>📊 Exportar CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <SelectorSemana
          titulo="Semana A"
          semana={data.semana_a}
          semanas={data.semanas ?? []}
          excluir={data.semana_b?.id}
          onChange={(id) => { setSemanaA(id); setSemanaB('') }}
        />
        <SelectorSemana
          titulo="Semana B (comparación)"
          semana={data.semana_b}
          semanas={data.semanas ?? []}
          excluir={data.semana_a?.id}
          onChange={setSemanaB}
        />
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
        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm min-w-[640px]">
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
            <Row label="Horas ejecutadas" a={formatHoras(a.horas_ejec)} b={formatHoras(b.horas_ejec)} delta={delta(a.horas_ejec, b.horas_ejec)} pct={pctDelta(a.horas_ejec, b.horas_ejec)} formato={formatHoras} better="up" />
            <Row label="Ocupación global" a={`${a.ocupacion}%`} b={`${b.ocupacion}%`} delta={delta(a.ocupacion, b.ocupacion)} pct={pctDelta(a.ocupacion, b.ocupacion)} unidad="pp" better="up" semaforoA={a.ocupacion} semaforoB={b.ocupacion} />
            <Row label="Ausencias" a={a.absences} b={b.absences} better="down" />
            <Row label="Costo de ausentismo" a={formatCOP(a.costo_ausentismo)} b={formatCOP(b.costo_ausentismo)} delta={delta(a.costo_ausentismo, b.costo_ausentismo)} pct={pctDelta(a.costo_ausentismo, b.costo_ausentismo)} formato={formatCOP} better="down" />
          </tbody>
        </table>
        </div>
      </div>

      {/* Tendencia 12 semanas */}
      <div className="card">
        <SectionHeader title="Tendencia · últimas 12 semanas" subtitle="Pacientes y ocupación" />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.ultimas_12 ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
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

function SelectorSemana({ titulo, semana, semanas, excluir, onChange }) {
  return (
    <div className="card">
      <label className="label">{titulo}</label>
      <select className="input text-sm" value={semana?.id ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!semana && <option value="">— sin datos —</option>}
        {semanas.filter((s) => s.id !== excluir).map((s) => (
          <option key={s.id} value={s.id}>{s.label}{s.en_curso ? ' (en curso)' : ''}</option>
        ))}
      </select>
      {semana && (
        <div className="mt-1.5 flex gap-1.5">
          {semana.en_curso
            ? <Badge variant="amber">En curso</Badge>
            : <Badge variant="gray">Completa</Badge>}
          {semana.cerrada && <Badge variant="green">Cerrada</Badge>}
        </div>
      )}
    </div>
  )
}

function Row({ label, a, b, delta, pct, unidad, formato, better, semaforoA, semaforoB }) {
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
        {/* 22-oct · el Δ del costo salía "-382920$": horas y pesos usan el mismo formato que A y B. */}
        {d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${formato ? formato(Math.abs(d)) : `${Math.abs(d)}${unidad ?? ''}`}`}
      </td>
      <td className={`px-3 py-2 text-xs text-right font-medium ${colorDelta}`}>
        {p == null ? '—' : (p > 0 ? `+${p}%` : `${p}%`)}
      </td>
    </tr>
  )
}
