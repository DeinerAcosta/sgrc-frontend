import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { sedeService } from '@/services/api'

/**
 * Hook para manejar la sede activa de un coordinador (multi-sede) o supervisor/gerencia.
 *
 * - Coordinador con 1 sede: la usa directamente (sin selector)
 * - Coordinador con 2+ sedes: muestra selector de SUS sedes
 * - Supervisor/gerencia (sin sedes propias): selector con TODAS las sedes
 *
 * Devuelve también un componente <Selector /> listo para usar en el header de la página.
 */
export function useSedeActiva() {
  const { user } = useAuthStore()
  const sedePropia = user?.sites?.length === 1 ? user.sites[0] : null
  const tieneVariasSedes = (user?.sites?.length ?? 0) > 1
  const primeraSede = user?.sites?.[0]

  // Inicialización síncrona: multi-sede arranca en su primera sede.
  // Antes: useState('') + useEffect(() => setSedeManual(user.sedes[0])) — eso
  // dejaba UN render con sedeManual='' que podía disparar queries con filtro
  // vacío y devolver ausencias de otras sedes (leak transitorio identificado
  // en verify Fase 2). Ahora el primer render ya tiene sede válida.
  const [sedeManual, setSedeManual] = useState(
    tieneVariasSedes ? (user?.sites?.[0] ?? '') : ''
  )

  // Si user.sedes cambia después (refresh de sesión / login viejo con menos
  // sedes que las actuales), reajustamos a la primera sede.
  useEffect(() => {
    if (tieneVariasSedes && (!sedeManual || !user.sites.includes(sedeManual))) {
      setSedeManual(user.sites[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneVariasSedes, primeraSede, user?.sites?.length])

  // Cargar SIEMPRE la lista de sedes. El coordinador con 1 sola sede también
  // necesita conocer el NOMBRE de su sede para renderizar toasts, headers y
  // textos informativos (bug ago-2026: toast "Cerraste undefined" al cerrar
  // la semana, porque el hook no exponía sedeNombre en esa configuración).
  const { data: todasSedes = [] } = useQuery({
    queryKey: ['sedes-multi'],
    queryFn: () => sedeService.list(),
  })

  const sedesDisponibles = tieneVariasSedes
    ? todasSedes.filter((s) => user.sites.includes(s.id))
    : todasSedes

  const sedeId = sedePropia || sedeManual
  const sedeNombre = todasSedes.find((s) => s.id === sedeId)?.name ?? null

  const Selector = ({ className = '' }) => {
    if (sedePropia) return null
    return (
      <div className={className}>
        {tieneVariasSedes && (
          <label className="text-xs text-gray-500 block mb-1">
            📍 Sede ({sedesDisponibles.length} disponibles):
          </label>
        )}
        <select
          className="input w-full sm:max-w-[320px]"
          value={sedeManual}
          onChange={(e) => setSedeManual(e.target.value)}
        >
          {!tieneVariasSedes && <option value="">Selecciona una sede…</option>}
          {sedesDisponibles.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    )
  }

  return { siteId: sedeId, sedeNombre, sedeManual, setSedeManual, tieneVariasSedes, sedesDisponibles, Selector }
}
