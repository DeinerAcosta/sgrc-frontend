import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from '@/utils/helpers'
import { ESTADOS_AUX, elegible } from '@/utils/matriz'

/**
 * ELEGIR AUXILIAR (nov-2026)
 * ==========================
 *
 * Hector: la auxiliar viene preseleccionada por la Matriz y, al pulsar la
 * barra, se elige viendo Auxiliar · Estado · Recurso par · Horas día · Horas
 * semana · Horario asignado · Sede, con filtros por nombre y estado y orden
 * alfabético u horas disponibles de menor a mayor.
 *
 * Tercera versión. Fue un globo flotante (tapaba la cabecera) y luego un panel
 * al lado; Hector: "no debe ser al lado, tiene que ser debajo… cuadrícula con
 * líneas y todo, y cuando ya seleccione se quite". Ahora:
 *   · AuxiliarBar   la barra de cada auxiliar en el formulario
 *   · AuxiliarTabla la cuadrícula con líneas que se abre DEBAJO de la barra;
 *                   al elegir se cierra.
 *
 * Ausente y Asignado se ven pero no se pueden elegir.
 *
 * Filas: [{ id, name, estado, motivoAusencia, recursosPar, preseleccionada,
 *           horasDia, horasSemana, tope, disponibles, horario, sedes }]
 */

const FILTROS = ['disponible', 'sin_asignar', 'asignado', 'ausente']
const ORDENES = [
  ['sugerido', 'Orden: sugerido'],
  ['alfabetico', 'Orden: alfabético'],
  ['horas_asc', 'Orden: horas disp. (menor a mayor)'],
]
// Hector: se ven 3 filas y las demás con el scroll de la tabla, sin que la
// pantalla tenga que bajar. Filas de alto fijo (nada se parte en dos líneas).
const FILAS_VISIBLES = 3
const ALTO_FILA_PX = 40
const ALTO_TITULOS_PX = 30

const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fmt = (h) => (h == null ? '—' : (Math.round(h * 10) / 10).toString().replace('.', ','))
const iniciales = (n) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

function EstadoPill({ estado }) {
  const e = ESTADOS_AUX[estado]
  if (!e) return null
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', e.cls)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', e.dot)} />
      {e.label}
    </span>
  )
}

/** La barra de una auxiliar en el formulario: una línea, del alto de un campo. */
export function AuxiliarBar({ fila, abierto, onClick, cargando, placeholder }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-left text-sm transition-shadow',
        abierto ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {fila ? (
        <>
          <span className="h-5 w-5 shrink-0 rounded-full bg-brand-50 text-brand-700 text-[9px] font-semibold flex items-center justify-center">
            {iniciales(fila.name)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-gray-900">{fila.name}</span>
            <span className="text-xs text-gray-400">
              {' · '}{fila.disponibles != null ? `le quedan ${fmt(fila.disponibles)}h` : `${fmt(fila.horasSemana)}h`}
              {fila.preseleccionada ? ' · Matriz' : ''}
            </span>
          </span>
          <EstadoPill estado={fila.estado} />
        </>
      ) : (
        <span className="flex-1 text-gray-400">{cargando ? 'Cargando auxiliares…' : placeholder}</span>
      )}
      <span className="text-gray-400 text-xs shrink-0">{abierto ? '▲' : '▼'}</span>
    </button>
  )
}

/** La cuadrícula con líneas, debajo de la barra. */
export function AuxiliarTabla({ value, onChange, onClose, filas, excluir }) {
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  const [orden, setOrden] = useState('sugerido')

  const base = useMemo(() => filas.filter((f) => !excluir?.includes(f.id)), [filas, excluir])

  const lista = useMemo(() => {
    const q = normalizar(nombre.trim())
    const l = base
      .filter((f) => !q || normalizar(f.name).includes(q))
      .filter((f) => !estado || f.estado === estado)
    const porNombre = (a, b) => a.name.localeCompare(b.name, 'es')
    const dispo = (f) => f.disponibles ?? -Infinity
    if (orden === 'alfabetico') return l.sort(porNombre)
    if (orden === 'horas_asc') return l.sort((a, b) => dispo(a) - dispo(b) || porNombre(a, b))
    // Arriba la pareja de la Matriz que se puede elegir, luego las elegibles
    // con más horas disponibles y al final las que no se pueden.
    const rango = (f) => (elegible(f.estado) ? (f.preseleccionada ? 0 : 1) : 2)
    return l.sort((a, b) => rango(a) - rango(b) || dispo(b) - dispo(a) || porNombre(a, b))
  }, [base, nombre, estado, orden])

  // Al abrirse dentro del formulario, que se vean sus filas sin buscarlas.
  const raiz = useRef(null)
  useEffect(() => { raiz.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [])

  const th = 'border border-gray-200 px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-50 whitespace-nowrap overflow-hidden text-ellipsis'
  const td = 'border border-gray-200 px-1.5 py-1 align-middle whitespace-nowrap overflow-hidden text-ellipsis'

  return (
    <div ref={raiz} className="mt-2 rounded-lg border border-gray-300 bg-white shadow-md overflow-hidden">
      {/* Hector: filtros por nombre y estado, orden alfabético y horas
          disponibles de menor a mayor, todo en esta barra. */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <input
          autoFocus
          className="input !py-1.5 flex-1 min-w-0"
          placeholder="Buscar por nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          {FILTROS.map((k) => <option key={k} value={k}>{ESTADOS_AUX[k].label}</option>)}
        </select>
        <select
          className="shrink-0 max-w-[40%] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          aria-label="Orden"
        >
          {ORDENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" onClick={onClose} className="shrink-0 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 leading-none" aria-label="Cerrar">×</button>
      </div>

      <div className="overflow-auto" style={{ maxHeight: ALTO_TITULOS_PX + FILAS_VISIBLES * ALTO_FILA_PX + 2 }}>
        {/* Anchos fijos para que las 7 columnas quepan en la mitad del formulario. */}
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: '27%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr style={{ height: ALTO_TITULOS_PX }}>
              <th className={clsx(th, 'cursor-pointer select-none hover:text-brand-700')} onClick={() => setOrden(orden === 'alfabetico' ? 'sugerido' : 'alfabetico')} title="Ordenar alfabéticamente">
                Auxiliar{orden === 'alfabetico' ? ' ▲' : ''}
              </th>
              <th className={th}>Estado</th>
              <th className={th}>Recurso par</th>
              <th className={clsx(th, 'text-center')}>Día</th>
              <th className={clsx(th, 'cursor-pointer select-none hover:text-brand-700')} onClick={() => setOrden(orden === 'horas_asc' ? 'sugerido' : 'horas_asc')} title="Horas disponibles de menor a mayor">
                Semana{orden === 'horas_asc' ? ' ▲' : ''}
              </th>
              <th className={th}>Horario</th>
              <th className={th}>Sede</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const elegida = f.id === value
              const puede = elegible(f.estado) || elegida
              const pct = f.tope ? Math.min(100, (f.horasSemana / f.tope) * 100) : 0
              return (
                <tr
                  key={f.id}
                  onClick={() => puede && onChange(f.id)}
                  title={f.estado === 'ausente' ? (f.motivoAusencia ?? 'Ausente') : undefined}
                  style={{ height: ALTO_FILA_PX }}
                  className={clsx(
                    'transition-colors',
                    elegida ? 'bg-brand-50' : puede ? 'cursor-pointer hover:bg-brand-50/60' : 'cursor-not-allowed bg-gray-50/60 text-gray-400',
                  )}
                >
                  <td className={td}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={clsx(
                        'h-6 w-6 shrink-0 rounded-full text-[10px] font-semibold flex items-center justify-center',
                        elegida ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600',
                      )}>
                        {elegida ? '✓' : iniciales(f.name)}
                      </span>
                      <span className="min-w-0">
                        <span className={clsx('block truncate text-[13px] font-medium leading-tight', puede ? 'text-gray-900' : 'text-gray-400')} title={f.name}>{f.name}</span>
                        {f.preseleccionada && <span className="block text-[10px] font-semibold leading-tight text-brand-600">Pareja en la Matriz</span>}
                      </span>
                    </span>
                  </td>
                  <td className={td}><EstadoPill estado={f.estado} /></td>
                  <td className={td}>
                    <span className="block truncate" title={f.recursosPar.map((p) => p.name).join(', ')}>{f.recursosPar.map((p) => p.name).join(', ') || '—'}</span>
                  </td>
                  <td className={clsx(td, 'text-center tabular-nums')}>{fmt(f.horasDia)}</td>
                  <td className={td}>
                    <span className="block tabular-nums">{fmt(f.horasSemana)}{f.tope != null && <span className="text-gray-400"> / {fmt(f.tope)}h</span>}</span>
                    {f.tope != null && (
                      <span className="block h-1 mt-1 w-full max-w-[64px] rounded-full bg-gray-100 overflow-hidden">
                        <span className={clsx('block h-full rounded-full', pct >= 100 ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </td>
                  <td className={clsx(td, 'tabular-nums whitespace-nowrap')}>
                    {f.horario.length ? f.horario.map((h) => `${h.ini}–${h.fin}`).join(', ') : '—'}
                  </td>
                  <td className={td}>
                    <span className="block truncate" title={f.sedes.join(', ')}>{f.sedes.join(', ') || '—'}</span>
                  </td>
                </tr>
              )
            })}
            {!lista.length && (
              <tr><td colSpan={7} className={clsx(td, 'py-6 text-center text-gray-400')}>Ninguna auxiliar coincide.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
