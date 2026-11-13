import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx, debeDescontarAlmuerzo } from '@/utils/helpers'
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
// Hector: se ven 3 filas y las demás con el scroll de la tabla, sin que la
// pantalla tenga que bajar. Filas de alto fijo (nada se parte en dos líneas).
const FILAS_VISIBLES = 3
const ALTO_FILA_PX = 40
const ALTO_TITULOS_PX = 34

const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fmt = (h) => (h == null ? '—' : (Math.round(h * 10) / 10).toString().replace('.', ','))
const aMin = (h) => { const [a, b] = (h ?? '').split(':').map(Number); return a * 60 + b }
// Horas efectivas de una franja (misma regla de almuerzo que el backend).
// Con descanso marcado se descuenta ese descanso en vez del almuerzo.
const horasFranja = (ini, fin, descanso = null) => {
  const s = aMin(ini), e = aMin(fin), m = e - s
  if (!(m > 0)) return 0
  if (descanso?.ini && descanso?.fin) return Math.max(0, m - Math.max(0, aMin(descanso.fin) - aMin(descanso.ini))) / 60
  return (m - (debeDescontarAlmuerzo(m, s, e, 'auxiliar') ? 60 : 0)) / 60
}
// La fila con el turno que se está armando: su horario en este turno, y las
// horas del día y de la semana contándolo (si se edita, en lugar del guardado).
function conPlan(f0, plan) {
  if (!f0 || !plan) return f0
  const guardado = f0.horario.find((h) => h.este_turno)
  const delta = horasFranja(plan.ini, plan.fin, plan.descanso) - (guardado ? horasFranja(guardado.ini, guardado.fin, guardado.descanso) : 0)
  return {
    ...f0,
    horario: [...f0.horario.filter((h) => !h.este_turno), { ...plan, este_turno: true }].sort((a, b) => (a.ini < b.ini ? -1 : 1)),
    horasDia: (f0.horasDia ?? 0) + delta,
    horasSemana: (f0.horasSemana ?? 0) + delta,
    disponibles: f0.disponibles == null ? null : Math.max(0, f0.disponibles - delta),
    sedes: plan.sede && !f0.sedes.includes(plan.sede) ? [...f0.sedes, plan.sede] : f0.sedes,
  }
}
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
export function AuxiliarBar({ fila: fila0, abierto, onClick, cargando, placeholder, plan = null }) {
  const fila = conPlan(fila0, plan)
  const horario = plan ? `${plan.ini}–${plan.fin}` : null
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
            {horario && <span className="ml-1.5 text-xs font-semibold text-brand-700 tabular-nums">{horario}</span>}
            <span className="text-xs text-gray-400">
              {' · '}{fila.disponibles != null ? `le quedan ${fmt(fila.disponibles)}h` : `${fmt(fila.horasSemana)}h`}
              {fila.preseleccionada ? ' · Matrix' : ''}
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
export function AuxiliarTabla({ value, onChange, onClose, filas, excluir, dia = '', plan = null }) {
  // Hector: "¿la sede qué significa?". Los títulos dicen de qué día son.
  // El día va debajo del título, en pequeño, para que no se corte.
  const conDia = (t) => (
    <>
      <span className="block leading-tight">{t}</span>
      {dia && <span className="block text-[9px] font-normal normal-case leading-tight text-white/70">{dia.toLowerCase()}</span>}
    </>
  )
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  // Cada título ordena por su cuenta (▲ ascendente, ▼ descendente); sin
  // ninguno activo va el orden sugerido.
  const [orden, setOrden] = useState({ campo: null, dir: 'asc' })
  const ordenarPor = (campo) => setOrden((o) => (o.campo === campo
    ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { campo, dir: 'asc' }))
  const flecha = (campo) => (
    <span className={clsx('ml-1', orden.campo === campo ? 'text-white' : 'text-white/40')}>
      {orden.campo === campo ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  )

  const base = useMemo(() => filas.filter((f) => !excluir?.includes(f.id)), [filas, excluir])

  const lista = useMemo(() => {
    const q = normalizar(nombre.trim())
    const l = base
      .filter((f) => !q || normalizar(f.name).includes(q))
      .filter((f) => !estado || f.estado === estado)
    const porNombre = (a, b) => a.name.localeCompare(b.name, 'es')
    const dispo = (f) => f.disponibles ?? -Infinity
    const signo = orden.dir === 'asc' ? 1 : -1
    if (orden.campo === 'nombre') return l.sort((a, b) => signo * porNombre(a, b))
    if (orden.campo === 'horas') return l.sort((a, b) => signo * (dispo(a) - dispo(b)) || porNombre(a, b))
    // Arriba la pareja de la Matriz que se puede elegir, luego las elegibles
    // con más horas disponibles y al final las que no se pueden.
    const rango = (f) => (elegible(f.estado) ? (f.preseleccionada ? 0 : 1) : 2)
    return l.sort((a, b) => rango(a) - rango(b) || dispo(b) - dispo(a) || porNombre(a, b))
  }, [base, nombre, estado, orden])

  // Al abrirse dentro del formulario, que se vean sus filas sin buscarlas.
  const raiz = useRef(null)
  useEffect(() => { raiz.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [])

  const selCls = 'shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400'
  // Títulos en el azul marino de la marca, igual que la Matrix.
  const th = 'border border-white/20 px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-white bg-brand-600 whitespace-nowrap overflow-hidden text-ellipsis'
  const td = 'border border-gray-200 px-1.5 py-1 align-middle whitespace-nowrap overflow-hidden text-ellipsis'

  return (
    <div ref={raiz} className="mt-2 rounded-lg border border-gray-300 bg-white shadow-md overflow-hidden">
      {/* Hector: buscar, estado, orden alfabético y horas disponibles, cada
          uno en su campo; las flechas de los títulos hacen lo mismo. */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <input
          autoFocus
          className="input !py-1.5 flex-1 min-w-0"
          placeholder="Buscar por nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select
          className={selCls}
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado"
        >
          <option value="">Estado</option>
          {FILTROS.map((k) => <option key={k} value={k}>{ESTADOS_AUX[k].label}</option>)}
        </select>
        <select
          className={selCls}
          value={orden.campo === 'nombre' ? orden.dir : ''}
          onChange={(e) => setOrden(e.target.value ? { campo: 'nombre', dir: e.target.value } : { campo: null, dir: 'asc' })}
          aria-label="Orden alfabético"
        >
          <option value="">Nombre</option>
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>
        <select
          className={selCls}
          value={orden.campo === 'horas' ? orden.dir : ''}
          onChange={(e) => setOrden(e.target.value ? { campo: 'horas', dir: e.target.value } : { campo: null, dir: 'asc' })}
          aria-label="Horas disponibles"
        >
          <option value="">Horas</option>
          <option value="asc">Menos horas</option>
          <option value="desc">Más horas</option>
        </select>
        <button type="button" onClick={onClose} className="shrink-0 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 leading-none" aria-label="Cerrar">×</button>
      </div>

      <div className="overflow-auto" style={{ maxHeight: ALTO_TITULOS_PX + FILAS_VISIBLES * ALTO_FILA_PX + 2 }}>
        {/* Anchos fijos para que las 7 columnas quepan en la mitad del formulario. */}
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr style={{ height: ALTO_TITULOS_PX }}>
              <th className={clsx(th, 'cursor-pointer select-none hover:text-iris-blue')} onClick={() => ordenarPor('nombre')} title="Ordenar alfabéticamente">
                Auxiliar{flecha('nombre')}
              </th>
              <th className={th}>Estado</th>
              <th className={th}>Recurso par</th>
              <th className={clsx(th, 'text-center')} title={`Horas que ya tiene el ${dia.toLowerCase()}`}>{conDia('Horas')}</th>
              <th className={clsx(th, 'cursor-pointer select-none hover:text-iris-blue')} onClick={() => ordenarPor('horas')} title="Ordenar por horas disponibles">
                Semana{flecha('horas')}
              </th>
              <th className={th} title={`Horario que ya tiene el ${dia.toLowerCase()}`}>{conDia('Horario')}</th>
              <th className={th} title={`Sede donde trabaja el ${dia.toLowerCase()}`}>{conDia('Sede')}</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f0) => {
              const elegida = f0.id === value
              // Hector: la elegida muestra la hora en que va a estar en este
              // turno (en su horario, horas del día y de la semana).
              const f = elegida ? conPlan(f0, plan) : f0
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
                        {f.preseleccionada && <span className="block text-[10px] font-semibold leading-tight text-brand-600">Pareja en la Matrix</span>}
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
                    <span className="block truncate" title={f.horario.map((h) => `${h.ini}–${h.fin}${h.consultorio ? ` · ${h.consultorio}` : ''}${h.este_turno ? ' (este turno)' : ''}`).join(' · ')}>
                      {f.horario.length
                        ? f.horario.map((h, k) => (
                            <span key={k} className={h.este_turno ? 'font-semibold text-brand-700' : ''}>
                              {k > 0 && ', '}{h.ini}–{h.fin}
                            </span>
                          ))
                        : '—'}
                    </span>
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
