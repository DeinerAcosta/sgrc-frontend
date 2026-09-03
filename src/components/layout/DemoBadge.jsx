import { DEMO_MODE } from '@/services/api'

/**
 * Distintivo permanente de MODO DEMO.
 *
 * En modo demo la aplicación sirve datos inventados de mock-data.js con la misma
 * shape que el backend real: sin este aviso, un despliegue mal configurado es
 * indistinguible de uno bueno. Va fijo abajo a la izquierda para no tapar la
 * cabecera ni desplazar el layout, y no se puede cerrar a propósito.
 *
 * Se monta en main.jsx, fuera del router, para que también aparezca en el login.
 */
export default function DemoBadge() {
  if (!DEMO_MODE) return null
  return (
    <div
      role="status"
      title="La aplicación no está conectada al backend: los datos que ves son de demostración."
      style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 9999,
        background: '#7f1d1d', color: '#fff',
        font: '600 11px/1.4 ui-sans-serif, system-ui, sans-serif',
        letterSpacing: '.08em', textTransform: 'uppercase',
        padding: '6px 11px', borderRadius: 999,
        boxShadow: '0 2px 10px rgba(0,0,0,.3)', pointerEvents: 'none',
      }}
    >
      Modo demo · datos ficticios
    </div>
  )
}
