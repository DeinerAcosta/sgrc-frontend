import { useEffect, useRef, useCallback } from 'react'
import { useConfirm } from '@/contexts/ConfirmContext'

/**
 * Bloquea el cierre accidental de modales con cambios sin guardar.
 *
 * Uso típico:
 *   const [form, setForm] = useState({ campo1: '', campo2: '' })
 *   const { tryClose } = useDirtyClose(form, onClose)
 *
 *   // En el backdrop + X + Cancelar, usar tryClose en vez de onClose:
 *   <div onClick={(e) => e.target === e.currentTarget && tryClose()}>
 *     <button onClick={tryClose}>×</button>
 *     <button onClick={tryClose}>Cancelar</button>
 *     <button onClick={() => mutate()}>Guardar</button>  ← este sigue con onClose normal
 *
 * Cómo detecta "dirty":
 *   - Captura el snapshot inicial del form con JSON.stringify en el primer render
 *   - Compara contra el form actual en cada render
 *   - Si difieren → cualquier intento de cerrar muestra confirm() nativo
 *
 * Beneficio extra:
 *   - También bloquea refresh del navegador y cerrar pestaña cuando hay cambios
 *     mediante el evento beforeunload (con el mensaje genérico del browser).
 *
 * NO hace falta tocar onChange handlers — el hook hace diffing automático.
 */

export function useDirtyClose(form, onClose) {
  const confirm = useConfirm()
  // Captura snapshot del estado inicial en el primer render.
  // Si form cambia, ya no coincide con el snapshot → dirty = true.
  const initialRef = useRef(null)
  if (initialRef.current === null) {
    initialRef.current = JSON.stringify(form)
  }
  const dirty = JSON.stringify(form) !== initialRef.current

  // Bloquea refresh / cerrar pestaña / navegación del browser cuando hay cambios.
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = '' // requerido por Chrome
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Cierre con modal de confirmación custom (no el confirm() nativo del browser).
  const tryClose = useCallback(async () => {
    if (!dirty) {
      onClose()
      return
    }
    const ok = await confirm({
      title: '¿Está seguro?',
      message: 'La información diligenciada no se guardará en el sistema.',
      confirmLabel: 'Aceptar',
      cancelLabel: 'Cancelar',
      variant: 'warning',
    })
    if (ok) onClose()
  }, [dirty, onClose, confirm])

  // Marca el form como "limpio" manualmente — útil después de un Save exitoso
  // que NO desmonta el modal (raro). Para el caso normal el modal se desmonta y
  // no hace falta.
  const markClean = useCallback(() => {
    initialRef.current = JSON.stringify(form)
  }, [form])

  return { tryClose, dirty, markClean }
}
