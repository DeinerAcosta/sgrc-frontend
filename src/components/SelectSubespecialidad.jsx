import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subespecialidadService } from '@/services/api'

/** Clave de comparación: sin tildes, sin mayúsculas y sin espacios de más (igual que el servidor). */
export const claveSubespecialidad = (t) => String(t ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Lista de subespecialidades del catálogo (Oct-2026 · PROYECTOS-3800).
 *
 * Antes era un campo de texto libre y opcional. Si el recurso ya traía una
 * escrita igual que la del catálogo salvo mayúsculas o tildes ("GLAUCOMA"),
 * se deja elegida; si traía otra cosa ("Segamento"), queda vacía para que se
 * elija bien. `error` pinta el campo en rojo (se intentó guardar sin ella).
 */
export default function SelectSubespecialidad({ tipo, value, onChange, error = false, className = '' }) {
  const { data } = useQuery({
    queryKey: ['subespecialidades', tipo],
    queryFn: () => subespecialidadService.list(tipo),
    enabled: !!tipo,
    staleTime: 10 * 60 * 1000,
  })
  const opciones = data?.items ?? []
  const elegida = opciones.find((o) => claveSubespecialidad(o) === claveSubespecialidad(value)) ?? ''

  // Ajusta el valor al nombre exacto del catálogo (o lo vacía si no está).
  useEffect(() => {
    if (opciones.length && value !== elegida) onChange(elegida)
  }, [opciones.length, value, elegida, onChange])

  return (
    <div>
      <label className="label">Subespecialidad <span className="text-red-600">*</span></label>
      <select
        className={`input ${error ? 'border-red-500 ring-1 ring-red-500' : ''} ${className}`}
        value={elegida}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar subespecialidad…</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <div className="text-[11px] text-red-600 mt-1">Elige la subespecialidad para poder guardar.</div>}
    </div>
  )
}
