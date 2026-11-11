import { useMemo, useState } from 'react'
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
 * Primero fue un globo flotante sobre el formulario; tapaba la cabecera y con
 * siete columnas no cabía ("se ve feo"). Ahora son dos piezas:
 *   · AuxiliarBar    la barra del formulario (muestra la elegida y su estado)
 *   · AuxiliarPicker el panel que ocupa el lado derecho de la pantalla de
 *                    asignar mientras se elige; al elegir vuelve la semana.
 *
 * Ausente y Asignado se ven pero no se pueden elegir.
 *
 * Filas: [{ id, name, estado, motivoAusencia, recursosPar, preseleccionada,
 *           horasDia, horasSemana, tope, disponibles, horario, sedes }]
 */

const ORDENES = [
  { value: 'sugerido', label: 'Matriz y más horas disponibles' },
  { value: 'alfabetico', label: 'Orden alfabético' },
  { value: 'horas_asc', label: 'Horas disponibles: menor a mayor' },
]
const FILTROS = ['disponible', 'sin_asignar', 'asignado', 'ausente']

const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fmt = (h) => (h == null ? '—' : (Math.round(h * 10) / 10).toString().replace('.', ','))
const iniciales = (n) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

// Columnas compartidas por el encabezado y las filas.
const COLUMNAS = 'grid grid-cols-[minmax(170px,1.5fr)_104px_minmax(110px,1fr)_56px_minmax(110px,1fr)_minmax(92px,0.8fr)_minmax(90px,0.9fr)] gap-3 items-center'

function EstadoPill({ estado, chico = false }) {
  const e = ESTADOS_AUX[estado]
  if (!e) return null
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap', e.cls, chico ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', e.dot)} />
      {e.label}
    </span>
  )
}

/** La barra del formulario. Al pulsarla se abre el panel de la derecha. */
export function AuxiliarBar({ fila, abierto, onClick, cargando, placeholder }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left transition-shadow',
        abierto ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {fila ? (
        <>
          <span className="h-8 w-8 shrink-0 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center">
            {iniciales(fila.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900 truncate">{fila.name}</span>
            <span className="block text-[11px] text-gray-500 truncate">
              {fila.preseleccionada ? 'Pareja en la Matriz · ' : ''}
              {fila.disponibles != null ? `le quedan ${fmt(fila.disponibles)}h esta semana` : `${fmt(fila.horasSemana)}h esta semana`}
            </span>
          </span>
          <EstadoPill estado={fila.estado} chico />
        </>
      ) : (
        <span className="flex-1 py-1 text-sm text-gray-400">{cargando ? 'Cargando auxiliares…' : placeholder}</span>
      )}
      <span className="text-xs text-brand-600 font-medium shrink-0">{abierto ? 'Eligiendo…' : fila ? 'Cambiar' : 'Elegir'}</span>
    </button>
  )
}

/** El panel para elegir. Ocupa el lado derecho de la pantalla de asignar. */
export function AuxiliarPicker({ titulo, subtitulo, value, onChange, onClose, filas, excluir }) {
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  const [orden, setOrden] = useState('sugerido')

  const base = useMemo(() => filas.filter((f) => f.id !== excluir), [filas, excluir])
  const conteo = useMemo(() => Object.fromEntries(FILTROS.map((k) => [k, base.filter((f) => f.estado === k).length])), [base])

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

  return (
    <div className="flex flex-col h-full min-h-[420px] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
            {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 -mr-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg leading-none" aria-label="Cerrar">×</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
            <input
              autoFocus
              className="input !pl-8 !py-1.5"
              placeholder="Buscar por nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Ordenar
            <select
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            >
              {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <FiltroChip activo={!estado} onClick={() => setEstado('')} label="Todos" n={base.length} />
          {FILTROS.map((k) => (
            <FiltroChip key={k} activo={estado === k} onClick={() => setEstado(estado === k ? '' : k)} label={ESTADOS_AUX[k].label} n={conteo[k]} dot={ESTADOS_AUX[k].dot} />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="min-w-[780px]">
          <div className={clsx(COLUMNAS, 'sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100')}>
            <span>Auxiliar</span>
            <span>Estado</span>
            <span>Recurso par</span>
            <span className="text-center">Día</span>
            <span>Semana</span>
            <span>Horario</span>
            <span>Sede</span>
          </div>

          <ul className="p-2 space-y-1">
            {lista.map((f) => {
              const elegida = f.id === value
              const puede = elegible(f.estado) || elegida
              const pct = f.tope ? Math.min(100, (f.horasSemana / f.tope) * 100) : 0
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={!puede}
                    onClick={() => onChange(f.id)}
                    title={f.estado === 'ausente' ? (f.motivoAusencia ?? 'Ausente') : undefined}
                    className={clsx(
                      COLUMNAS,
                      'w-full text-left rounded-lg px-3 py-2.5 transition-colors',
                      elegida ? 'bg-brand-50 ring-1 ring-brand-300' : puede ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={clsx(
                        'h-8 w-8 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center',
                        elegida ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600',
                      )}>
                        {elegida ? '✓' : iniciales(f.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-tight text-gray-900">{f.name}</span>
                        {f.preseleccionada && <span className="block text-[11px] font-medium text-brand-600">Pareja en la Matriz</span>}
                      </span>
                    </span>
                    <span><EstadoPill estado={f.estado} chico /></span>
                    <span className="text-xs leading-tight text-gray-600">{f.recursosPar.map((p) => p.name).join(', ') || <span className="text-gray-300">—</span>}</span>
                    <span className="text-sm text-center tabular-nums text-gray-800">{fmt(f.horasDia)}<span className="text-[10px] text-gray-400">h</span></span>
                    <span className="min-w-0">
                      <span className="block text-xs tabular-nums text-gray-700">
                        {fmt(f.horasSemana)}{f.tope != null && <span className="text-gray-400"> / {fmt(f.tope)}h</span>}
                      </span>
                      {f.tope != null && (
                        <span className="block h-1 mt-1 rounded-full bg-gray-100 overflow-hidden">
                          <span className={clsx('block h-full rounded-full', pct >= 100 ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                        </span>
                      )}
                      {f.disponibles != null && <span className="block text-[10px] text-gray-400 mt-0.5">quedan {fmt(f.disponibles)}h</span>}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {f.horario.length
                        ? f.horario.map((h, i) => (
                          <span key={i} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] tabular-nums text-gray-700">{h.ini}–{h.fin}</span>
                        ))
                        : <span className="text-gray-300 text-xs">—</span>}
                    </span>
                    <span className="text-xs leading-tight text-gray-600">{f.sedes.join(', ') || <span className="text-gray-300">—</span>}</span>
                  </button>
                </li>
              )
            })}
            {!lista.length && (
              <li className="py-10 text-center text-sm text-gray-400">Ninguna auxiliar coincide.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

function FiltroChip({ activo, onClick, label, n, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        activo ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', activo ? 'bg-white' : dot)} />}
      {label}
      <span className={clsx('tabular-nums', activo ? 'text-white/80' : 'text-gray-400')}>{n}</span>
    </button>
  )
}
