import { Component } from 'react'
import { esErrorDeVersion, recargarUnaVez } from '@/utils/cargaDiferida'

/**
 * Atrapa el error de una pantalla para que no quede todo en blanco.
 *
 * 22-oct · Sin esto, cualquier fallo al pintar o al bajar una página desmontaba
 * la app entera y solo se arreglaba recargando. Ahora sale un aviso con
 * "Recargar" y el resto (menú, sesión) sigue en pie. Se reinicia al cambiar de
 * ruta: quien sale de la pantalla rota y entra a otra no ve el aviso viejo.
 */
export default class PantallaConError extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Un archivo de una versión anterior: recargar toma la nueva.
    if (esErrorDeVersion(error)) recargarUnaVez()
    console.error('[SGRC] Error en la pantalla:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.ruta !== this.props.ruta) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="p-6 flex justify-center">
        <div className="card max-w-md w-full text-center">
          <div className="text-sm font-semibold text-gray-900 mb-1">No se pudo abrir esta pantalla</div>
          <div className="text-xs text-gray-500 mb-4 break-words">{String(this.state.error?.message ?? '')}</div>
          <button className="btn-primary justify-center mx-auto" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
