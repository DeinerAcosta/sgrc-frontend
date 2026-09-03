import { createContext, useContext, useState, useCallback } from 'react'

/**
 * Confirmación estilizada (reemplaza window.confirm()).
 *
 * Uso desde cualquier componente:
 *   const confirm = useConfirm()
 *   const ok = await confirm({
 *     title: '¿Está seguro?',
 *     message: 'La información no se guardará.',
 *     confirmLabel: 'Aceptar',   // opcional, default 'Aceptar'
 *     cancelLabel: 'Cancelar',   // opcional, default 'Cancelar'
 *     variant: 'warning',        // 'warning' (ámbar) | 'danger' (rojo) | 'info' (azul)
 *   })
 *   if (ok) doSomething()
 *
 * El provider va una sola vez en el árbol (main.jsx). El diálogo se renderiza
 * globalmente, sin importar dónde se haga la llamada.
 */

const ConfirmContext = createContext(null)

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  }
  return confirm
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({
        title: options.title ?? '¿Está seguro?',
        message: options.message ?? 'Esta acción no se puede deshacer.',
        confirmLabel: options.confirmLabel ?? 'Aceptar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        variant: options.variant ?? 'warning',
        resolve,
      })
    })
  }, [])

  const finish = (result) => {
    if (state?.resolve) state.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          variant={state.variant}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel }) {
  // Variantes visuales del círculo del icono
  const variants = {
    warning: {
      ring:    'bg-amber-50 ring-2 ring-amber-200',
      icon:    'text-amber-500',
      confirm: 'bg-brand-600 hover:bg-brand-800 text-white',
    },
    danger:  {
      ring:    'bg-red-50 ring-2 ring-red-200',
      icon:    'text-red-500',
      confirm: 'bg-red-600 hover:bg-red-700 text-white',
    },
    info:    {
      ring:    'bg-blue-50 ring-2 ring-blue-200',
      icon:    'text-blue-500',
      confirm: 'bg-brand-600 hover:bg-brand-800 text-white',
    },
  }
  const v = variants[variant] ?? variants.warning

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl relative">
        <button
          onClick={onCancel}
          className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="px-6 pt-7 pb-5 text-center">
          {/* Icono circular */}
          <div className={`w-16 h-16 rounded-full ${v.ring} mx-auto mb-4 flex items-center justify-center`}>
            <span className={`text-3xl font-bold ${v.icon}`}>!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1.5">{title}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${v.confirm}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
