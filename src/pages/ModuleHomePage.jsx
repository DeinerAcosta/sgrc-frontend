import { Navigate, useParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { buscarModulo } from '@/config/nav'
import { EmptyState } from '@/components/ui'

/**
 * Página de un módulo: lista sus opciones con una línea de qué hace cada una.
 *
 * Sep-2026 · Antes, pulsar un módulo padre en el menú te llevaba directo a su
 * PRIMERA opción. Eso confunde: entras a "Vista ejecutiva" y aterrizas en el
 * Dashboard sin saber qué más hay dentro. El menú de Biowel hace lo correcto —
 * "TM DE ADMINISTRACIÓN" abre una página que lista sus tablas maestras — y es
 * lo que se replica aquí.
 *
 * Es UNA sola página para todos los módulos: se arma leyendo `config/nav.js`
 * con la clave de la URL y el rol de quien mira. Así, un módulo nuevo no
 * necesita pantalla nueva — basta agregarlo al menú.
 *
 * El rol importa: dos roles pueden compartir clave y ver opciones distintas,
 * porque el módulo se busca dentro del menú de QUIEN mira. Y si alguien escribe
 * a mano la clave de un módulo que no le corresponde, no encuentra nada.
 */
export default function ModuleHomePage() {
  const { clave } = useParams()
  const { user } = useAuthStore()
  const modulo = buscarModulo(user?.role, clave)

  // Clave inexistente, o módulo de otro rol: de vuelta al inicio. No se muestra
  // un error porque no hay nada que el usuario pueda corregir.
  if (!modulo) return <Navigate to="/app" replace />

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-brand-800 flex items-center gap-2.5">
          <span className="text-2xl">{modulo.icon}</span>
          {modulo.label}
        </h1>
        {modulo.descripcion && (
          <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">{modulo.descripcion}</p>
        )}
      </div>

      {modulo.children.length === 0 ? (
        <EmptyState icon="📭" title="Este módulo no tiene opciones" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {modulo.children.map((h) => (
            <Link
              key={h.to}
              to={h.to}
              className="card group hover:border-brand-400 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 group-hover:text-brand-800">
                    {h.label}
                  </div>
                  {h.descripcion && (
                    <div className="text-xs text-gray-500 mt-1 leading-snug">{h.descripcion}</div>
                  )}
                </div>
                <span className="text-gray-300 group-hover:text-brand-600 transition-colors flex-shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
