import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dropdown buscable. Drop-in replacement de <select>.
 *
 * Props:
 *  - value:        id seleccionado
 *  - onChange(id): callback al seleccionar
 *  - options:      array [{ id, label, sublabel? }]
 *  - placeholder:  texto cuando no hay selección
 *  - disabled
 *
 * Nov-2026 · Hector: un solo campo (antes se abría un segundo buscador debajo)
 * y la lista flota sobre la pantalla con el alto que haya disponible, para que
 * el scroll del modal no la corte cuando hay muchos.
 */

// Sin tildes ni mayúsculas: "maria" encuentra a "María".
const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Nov-2026 · `visibles`: cuántas opciones se ven a la vez; las demás salen con
 * el scroll de la lista. Hector lo pidió en 3 para el profesional y la auxiliar
 * del Programador. Sin el prop, la lista usa el alto disponible como antes.
 */
const ALTO_OPCION_REM = 2.25 // py-2 + text-sm (1.25rem de línea)

// `anchoLista`: ancho mínimo de la lista (px) cuando el campo es angosto, para
// que se lean los nombres completos.
export default function SearchableSelect({ value, onChange, options, placeholder = 'Seleccionar…', disabled, visibles, anchoLista }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activo, setActivo] = useState(0)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listaRef = useRef(null)

  const selected = options.find((o) => o.id === value)
  const q = normalizar(query.trim())
  const filtered = q
    ? options.filter((o) => normalizar(o.label).includes(q) || normalizar(o.sublabel).includes(q))
    : options

  const cerrar = () => { setOpen(false); setQuery('') }

  // Abajo si cabe; si no, hacia donde haya más espacio.
  const ubicar = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const abajo = window.innerHeight - r.bottom - 12
    const arriba = r.top - 12
    const haciaArriba = abajo < 240 && arriba > abajo
    const ancho = Math.max(r.width, anchoLista ?? 0)
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
      width: ancho,
      maxHeight: Math.min(420, haciaArriba ? arriba : abajo),
      ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [open])

  // Cerrar al hacer click fuera (del campo y de la lista, que vive en el body)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current?.contains(e.target) || listaRef.current?.contains(e.target)) return
      cerrar()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Que la opción marcada con las flechas no quede fuera de vista.
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  const abrir = () => {
    if (disabled || open) return
    setOpen(true)
    const i = options.findIndex((o) => o.id === value)
    setActivo(i >= 0 ? i : 0)
  }

  const pick = (id) => {
    onChange(id)
    cerrar()
    inputRef.current?.blur()
  }

  const onKeyDown = (e) => {
    // Cerrado (después de Escape) y se empieza a escribir: abre buscando eso.
    if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); abrir(); setQuery(e.key); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) abrir(); else setActivo((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && filtered[activo]) pick(filtered[activo].id) }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); cerrar() } }
    else if (e.key === 'Tab') cerrar()
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        className={`input w-full pr-8 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        placeholder={open && selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => { if (!open) abrir(); setQuery(e.target.value); setActivo(0) }}
        onFocus={abrir}
        onClick={abrir}
        onKeyDown={onKeyDown}
        disabled={disabled}
        readOnly={!open}
      />
      {/* Nov-2026 · Hector: la flecha abre y CIERRA la lista; antes era un
          dibujo y para cerrar había que pulsar en otra parte. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Cerrar lista' : 'Abrir lista'}
        disabled={disabled}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xs disabled:opacity-50"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) { cerrar(); inputRef.current?.blur() } else { abrir(); inputRef.current?.focus() }
        }}
      >
        {open ? '▲' : '▼'}
      </button>

      {open && pos && createPortal(
        <div
          ref={listaRef}
          className="fixed z-[80] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          <div
            className="overflow-y-auto flex-1 py-1"
            style={visibles ? { maxHeight: `calc(${visibles * ALTO_OPCION_REM}rem + 0.5rem)` } : undefined}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                Sin coincidencias para "{query}"
              </div>
            ) : (
              filtered.map((o, i) => (
                <button
                  type="button"
                  key={o.id}
                  data-i={i}
                  className={`w-full text-left px-3 py-2 flex items-baseline justify-between gap-3 ${visibles ? 'h-9' : ''} ${i === activo ? 'bg-blue-50' : ''}`}
                  onMouseEnter={() => setActivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.id)}
                >
                  <span className={`text-sm text-gray-800 truncate min-w-0 ${o.id === value ? 'font-semibold' : ''}`}>
                    {o.id === value ? '✓ ' : ''}{o.label}
                  </span>
                  {o.sublabel && <span className="text-xs text-gray-500 shrink-0 max-w-[50%] truncate text-right">{o.sublabel}</span>}
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 text-center flex-shrink-0">
            {filtered.length} de {options.length}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
