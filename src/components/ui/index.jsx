import { useState, useEffect, useMemo } from 'react'
import { initials } from '@/utils/helpers'

/**
 * Input de contraseña con botón de "mostrar/ocultar".
 * Acepta cualquier prop estándar de <input>. La clase por defecto es `input pr-10`.
 */
export function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`input pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
      >
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029M9.88 9.88a3 3 0 104.243 4.243M9.88 9.88L4.929 4.929M9.88 9.88l4.243 4.243m0 0L19.07 19.07M14.122 14.122a3 3 0 01-4.243-4.243m4.243 4.243L4.929 4.929M14.122 14.122L19.07 19.07M9.88 9.88a3 3 0 014.243 0M2 2l20 20" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function Badge({ children, variant = 'gray', className = '' }) {
  const variants = {
    green:  'bg-green-50 text-green-800',
    red:    'bg-red-50 text-red-800',
    amber:  'bg-amber-50 text-amber-800',
    blue:   'bg-blue-50 text-blue-800',
    purple: 'bg-purple-50 text-purple-800',
    yellow: 'bg-yellow-50 text-yellow-800',
    teal:   'bg-teal-50 text-teal-800',
    gray:   'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

export function Avatar({ nombre, size = 'sm', color = 'blue' }) {
  const sizes = { xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }
  const colors = {
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    amber:  'bg-amber-100 text-amber-800',
    teal:   'bg-teal-100 text-teal-800',
  }
  return (
    <div className={`${sizes[size]} ${colors[color]} rounded-full flex items-center justify-center font-medium flex-shrink-0`}>
      {initials(nombre)}
    </div>
  )
}

export function Semaforo({ pct, metaVerde = 80 }) {
  const color = pct >= metaVerde ? 'bg-green-500' : pct >= metaVerde - 10 ? 'bg-amber-400' : 'bg-red-500'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} title={`${Math.round(pct)}%`} />
}

export function KpiCard({ label, value, delta, deltaUp, color = 'default' }) {
  const colors = { danger: 'text-red-600', warning: 'text-amber-600', success: 'text-green-600', default: 'text-gray-900' }
  return (
    <div className="kpi-card">
      <div className={`text-2xl font-semibold leading-none mb-1 ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {delta && (
        <div className={`text-xs mt-1 ${deltaUp ? 'text-green-600' : 'text-red-500'}`}>{delta}</div>
      )}
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <div className={`${s[size]} border-2 border-gray-200 border-t-brand-600 rounded-full animate-spin`} />
  )
}

export function EmptyState({ icon = '📋', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="text-sm font-medium text-gray-700 mb-1">{title}</div>
      {description && <div className="text-xs text-gray-400 mb-4 max-w-xs">{description}</div>}
      {action}
    </div>
  )
}

export function AlertRow({ tipo, titulo, subtitulo, onAction, actionLabel }) {
  const dots = { rojo: 'bg-red-500', amarillo: 'bg-amber-400', verde: 'bg-green-500' }
  const dot = tipo === 'rojo' ? 'bg-red-500' : tipo === 'amarillo' ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0 last:pb-0">
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-800 leading-snug">{titulo}</div>
        {subtitulo && <div className="text-xs text-gray-400 mt-0.5">{subtitulo}</div>}
      </div>
      {actionLabel && (
        <button className="text-xs text-brand-600 hover:underline flex-shrink-0" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function BarProgress({ value, max = 100, color = 'green' }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const colors = {
    green:  'bg-green-500',
    amber:  'bg-amber-400',
    red:    'bg-red-500',
    blue:   'bg-blue-500',
    purple: 'bg-purple-500',
  }
  const barColor = pct >= 90 ? colors.green : pct >= 70 ? colors.amber : colors.red
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="text-sm font-medium text-gray-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// PAGINACIÓN DE LISTADOS
// ============================================================================
// Sep-2026 · pedido de dirección: las grillas largas (informes, usuarios,
// recursos…) se paginan de a 10 y muestran el total de registros, para poder
// cuadrar la contabilidad completa sin hacer scroll infinito.
//
// Se usa en pareja: el hook recorta la lista, el componente pinta el control.
// La lista que entra ya viene filtrada y ordenada por la página; acá solo se
// corta. Los KPIs y la exportación siguen calculándose sobre la lista COMPLETA.
//
//   const pag = usePaginacion(dataOrdenada)
//   ...
//   {pag.visibles.map(...)}
//   <Paginacion estado={pag} etiqueta="registros" />

/**
 * @param {Array} items         Lista COMPLETA ya filtrada/ordenada.
 * @param {number} porPaginaIni Tamaño de página inicial (10 por defecto).
 */
export function usePaginacion(items = [], porPaginaIni = 10) {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(porPaginaIni)

  const total = items.length
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  // Al cambiar un filtro la lista se acorta y la página actual puede quedar
  // fuera de rango: la tabla saldría vacía y parecería que no hay datos.
  useEffect(() => { setPagina(1) }, [total, porPagina])

  // Además de resetear, acotamos en el render: entre que cambia `total` y que
  // corre el efecto hay un render intermedio que pintaría la página vacía.
  const paginaSegura = Math.min(pagina, totalPaginas)
  const ini = (paginaSegura - 1) * porPagina

  const visibles = useMemo(() => items.slice(ini, ini + porPagina), [items, ini, porPagina])

  return {
    visibles,
    pagina: paginaSegura,
    setPagina,
    porPagina,
    setPorPagina,
    total,
    totalPaginas,
    desde: total === 0 ? 0 : ini + 1,
    hasta: Math.min(ini + porPagina, total),
  }
}

/** Control de paginación + contador. `estado` es lo que devuelve usePaginacion(). */
export function Paginacion({ estado, etiqueta = 'registros', opciones = [10, 25, 50, 100], className = '' }) {
  const { pagina, setPagina, porPagina, setPorPagina, total, totalPaginas, desde, hasta } = estado
  // Con una sola página se sigue mostrando el conteo (es el dato que se pide
  // para cuadrar), pero sin botones de navegación, que no harían nada.
  const navegable = totalPaginas > 1

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1 pt-3 ${className}`}>
      <div className="text-xs text-gray-500">
        {total === 0
          ? `Sin ${etiqueta}`
          : <>Mostrando <span className="font-medium text-gray-700">{desde}–{hasta}</span> de{' '}
             <span className="font-medium text-gray-700">{total}</span> {etiqueta}</>}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 hidden sm:inline">Por página:</label>
        <select
          className="input w-auto py-1 text-xs"
          value={porPagina}
          onChange={(e) => setPorPagina(Number(e.target.value))}
          aria-label="Registros por página"
        >
          {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {navegable && (
          <div className="flex items-center gap-1">
            <button className="btn px-2 py-1 text-xs" onClick={() => setPagina(1)} disabled={pagina === 1} aria-label="Primera página">«</button>
            <button className="btn px-2 py-1 text-xs" onClick={() => setPagina(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">‹</button>
            <span className="text-xs text-gray-600 px-1 whitespace-nowrap">{pagina} / {totalPaginas}</span>
            <button className="btn px-2 py-1 text-xs" onClick={() => setPagina(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Página siguiente">›</button>
            <button className="btn px-2 py-1 text-xs" onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas} aria-label="Última página">»</button>
          </div>
        )}
      </div>
    </div>
  )
}
