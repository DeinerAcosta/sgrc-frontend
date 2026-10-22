import { useState } from 'react'
import { addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, addDays, format, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const iso = (d) => format(d, 'yyyy-MM-dd')

/**
 * Calendario de selección múltiple (Oct-2026 · Hector: "que marque las fechas
 * que sean multiselect de fechas con calendario"). Un clic marca el día, otro
 * clic lo desmarca. `min` (YYYY-MM-DD) apaga los días anteriores.
 */
export default function CalendarioMultiple({ value = [], onChange, min, bloqueadas = null }) {
  const inicial = value[0] ?? min
  const [mes, setMes] = useState(() => startOfMonth(inicial ? new Date(`${inicial}T12:00:00`) : new Date()))
  const elegidas = new Set(value)
  const primero = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 })
  const ultimo = endOfMonth(mes)
  const dias = []
  for (let d = primero; d <= ultimo || dias.length % 7 !== 0; d = addDays(d, 1)) dias.push(d)

  const alternar = (f) => {
    const nuevo = new Set(elegidas)
    if (nuevo.has(f)) nuevo.delete(f)
    else nuevo.add(f)
    onChange([...nuevo].sort())
  }

  return (
    <div className="border border-gray-200 rounded-lg p-2 w-full max-w-xs">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" className="px-2 py-0.5 text-gray-500 hover:text-gray-800" onClick={() => setMes((m) => subMonths(m, 1))} aria-label="Mes anterior">‹</button>
        <span className="text-xs font-semibold text-gray-800 capitalize">{format(mes, 'MMMM yyyy', { locale: es })}</span>
        <button type="button" className="px-2 py-0.5 text-gray-500 hover:text-gray-800" onClick={() => setMes((m) => addMonths(m, 1))} aria-label="Mes siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d, i) => <div key={i} className="text-[10px] text-gray-400 font-medium py-0.5">{d}</div>)}
        {dias.map((d) => {
          const f = iso(d)
          const fuera = !isSameMonth(d, mes)
          // `bloqueadas` = { desde, hasta }: días que no se pueden marcar (la ausencia misma).
          const apagado = (!!min && f < min) || (!!bloqueadas?.desde && f >= bloqueadas.desde && f <= (bloqueadas.hasta || bloqueadas.desde))
          const marcado = elegidas.has(f)
          return (
            <button
              key={f}
              type="button"
              disabled={apagado || fuera}
              title={bloqueadas?.desde && f >= bloqueadas.desde && f <= (bloqueadas.hasta || bloqueadas.desde) ? 'Día de la ausencia' : undefined}
              onClick={() => alternar(f)}
              className={`text-xs h-7 rounded-md tabular-nums transition-colors ${
                fuera ? 'invisible' :
                marcado ? 'bg-brand-600 text-white font-semibold' :
                apagado ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-blue-50'
              }`}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
