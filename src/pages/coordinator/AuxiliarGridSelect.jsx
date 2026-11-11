import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from '@/utils/helpers'
import { ESTADOS_AUX, elegible } from '@/utils/matriz'

/**
 * SELECTOR DE AUXILIAR EN CUADRÍCULA (nov-2026)
 * =============================================
 *
 * Hector: al pulsar la barra ya no sale la lista de nombres sino una
 * cuadrícula con Auxiliar · Estado · Recurso par · Horas día · Horas semana ·
 * Horario asignado · Sede, con filtros por nombre y estado y orden alfabético
 * u horas disponibles de menor a mayor. Arriba va la preseleccionada (la de
 * la Matriz) y después las que tienen más horas disponibles.
 *
 * Ausente y Asignado se ven pero no se pueden elegir.
 *
 * Props:
 *  - value / onChange(id)
 *  - filas: [{ id, name, estado, motivoAusencia, recursosPar, preseleccionada,
 *             horasDia, horasSemana, tope, disponibles, horario, sedes }]
 *  - excluir: id que no se ofrece (la otra auxiliar del turno)
 *  - cargando, placeholder
 */

const ORDENES = [
  { value: 'sugerido', label: 'Matriz y más horas disponibles' },
  { value: 'alfabetico', label: 'Orden alfabético' },
  { value: 'horas_asc', label: 'Horas disponibles de menor a mayor' },
]
// Tres filas a la vez y el resto con el scroll, como los otros buscadores.
const FILAS_VISIBLES = 3
const ALTO_FILA_PX = 46

const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fmt = (h) => (h == null ? '—' : (Math.round(h * 10) / 10).toString().replace('.', ','))

export default function AuxiliarGridSelect({ value, onChange, filas, excluir, cargando, placeholder = 'Seleccionar auxiliar…' }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  const [orden, setOrden] = useState('sugerido')
  const [pos, setPos] = useState(null)
  const barraRef = useRef(null)
  const panelRef = useRef(null)

  const sel = filas.find((f) => f.id === value)

  const visibles = useMemo(() => {
    const q = normalizar(nombre.trim())
    const lista = filas
      .filter((f) => f.id !== excluir)
      .filter((f) => !q || normalizar(f.name).includes(q))
      .filter((f) => !estado || f.estado === estado)
    const porNombre = (a, b) => a.name.localeCompare(b.name, 'es')
    const dispo = (f) => f.disponibles ?? -Infinity
    if (orden === 'alfabetico') return lista.sort(porNombre)
    if (orden === 'horas_asc') return lista.sort((a, b) => dispo(a) - dispo(b) || porNombre(a, b))
    // Sugerido: arriba la pareja de la Matriz que se puede elegir, luego las
    // elegibles con más horas disponibles y al final las que no se pueden.
    const rango = (f) => (elegible(f.estado) ? (f.preseleccionada ? 0 : 1) : 2)
    return lista.sort((a, b) => rango(a) - rango(b) || dispo(b) - dispo(a) || porNombre(a, b))
  }, [filas, excluir, nombre, estado, orden])

  const cerrar = () => setOpen(false)

  // La cuadrícula es más ancha que el formulario: se abre bajo la barra con el
  // ancho que haga falta, sin salirse de la pantalla.
  const ubicar = () => {
    const r = barraRef.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.min(940, window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8))
    const abajo = window.innerHeight - r.bottom
    const alto = 120 + FILAS_VISIBLES * ALTO_FILA_PX
    const haciaArriba = abajo < alto + 16 && r.top > abajo
    setPos({ left, width: ancho, ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
  }
  useLayoutEffect(() => {
    if (!open) return
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => { window.removeEventListener('resize', ubicar); window.removeEventListener('scroll', ubicar, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const fuera = (e) => {
      if (barraRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      cerrar()
    }
    const esc = (e) => e.key === 'Escape' && cerrar()
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [open])

  const elegir = (f) => {
    if (!elegible(f.estado) && f.id !== value) return
    onChange(f.id)
    cerrar()
  }

  return (
    <div className="relative" ref={barraRef}>
      <button
        type="button"
        className="input w-full pr-8 text-left flex items-center gap-2 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {sel ? (
          <>
            <span className="truncate">{sel.name}</span>
            <EstadoChip estado={sel.estado} />
            {sel.preseleccionada && <span className="text-[11px] text-brand-600 font-medium shrink-0">Matriz</span>}
          </>
        ) : (
          <span className="text-gray-400">{cargando ? 'Cargando auxiliares…' : placeholder}</span>
        )}
      </button>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{open ? '▲' : '▼'}</span>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[80] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        >
          <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-100 bg-gray-50">
            <input
              autoFocus
              className="input !py-1.5 flex-1 min-w-[160px]"
              placeholder="Buscar por nombre…"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <select className="input !py-1.5 !w-auto" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_AUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input !py-1.5 !w-auto" value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Orden">
              {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 32 + FILAS_VISIBLES * ALTO_FILA_PX }}>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2 font-semibold">Auxiliar</th>
                  <th className="px-2 py-2 font-semibold">Estado</th>
                  <th className="px-2 py-2 font-semibold">Recurso par</th>
                  <th className="px-2 py-2 font-semibold text-center">Horas día</th>
                  <th className="px-2 py-2 font-semibold text-center">Horas semana</th>
                  <th className="px-2 py-2 font-semibold">Horario asignado</th>
                  <th className="px-2 py-2 font-semibold">Sede</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const puede = elegible(f.estado) || f.id === value
                  return (
                    <tr
                      key={f.id}
                      onClick={() => elegir(f)}
                      title={f.estado === 'ausente' ? f.motivoAusencia ?? 'Ausente' : undefined}
                      className={clsx(
                        'border-b border-gray-50 align-top',
                        puede ? 'cursor-pointer hover:bg-brand-50' : 'cursor-not-allowed opacity-50',
                        f.id === value && 'bg-brand-50',
                      )}
                      style={{ height: ALTO_FILA_PX }}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {f.id === value && '✓ '}{f.name}
                        {f.preseleccionada && <div className="text-[10px] text-brand-600 font-semibold">Pareja en la Matriz</div>}
                      </td>
                      <td className="px-2 py-2"><EstadoChip estado={f.estado} /></td>
                      <td className="px-2 py-2 text-gray-700">{f.recursosPar.map((p) => p.name).join(', ') || '—'}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{fmt(f.horasDia)}</td>
                      <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">
                        {fmt(f.horasSemana)}{f.tope != null ? ` / ${fmt(f.tope)}` : ''}
                        {f.disponibles != null && <div className="text-[10px] text-gray-500">quedan {fmt(f.disponibles)}</div>}
                      </td>
                      <td className="px-2 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                        {f.horario.length ? f.horario.map((h, i) => <div key={i}>{h.ini}–{h.fin}</div>) : '—'}
                      </td>
                      <td className="px-2 py-2 text-gray-700">{f.sedes.join(', ') || '—'}</td>
                    </tr>
                  )
                })}
                {!visibles.length && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">Ninguna auxiliar coincide.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 text-center">
            {visibles.length} de {filas.filter((f) => f.id !== excluir).length}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function EstadoChip({ estado }) {
  const e = ESTADOS_AUX[estado]
  if (!e) return null
  return <span className={clsx('shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium', e.cls)}>{e.label}</span>
}
