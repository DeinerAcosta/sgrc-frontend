import { useState, useRef, useEffect } from 'react'

/**
 * Dropdown buscable. Drop-in replacement de <select>.
 *
 * Props:
 *  - value:        id seleccionado
 *  - onChange(id): callback al seleccionar
 *  - options:      array [{ id, label, sublabel? }]
 *  - placeholder:  texto cuando no hay selección
 *  - disabled
 */
export default function SearchableSelect({ value, onChange, options, placeholder = 'Seleccionar…', disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => o.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q))
      )
    : options

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Auto-focus al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const pick = (id) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className={`input w-full text-left flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className={selected ? 'text-gray-800 truncate' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-gray-400 ml-2 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              className="input w-full text-xs"
              placeholder="🔍 Buscar por nombre…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); setQuery('') }
                if (e.key === 'Enter' && filtered.length === 1) pick(filtered[0].id)
              }}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">
                Sin coincidencias para "{query}"
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${o.id === value ? 'bg-blue-100 font-medium' : ''}`}
                  onClick={() => pick(o.id)}
                >
                  <div className="text-gray-800">{o.label}</div>
                  {o.sublabel && <div className="text-gray-400 text-xs">{o.sublabel}</div>}
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400 text-center flex-shrink-0">
            {filtered.length} de {options.length}
          </div>
        </div>
      )}
    </div>
  )
}
