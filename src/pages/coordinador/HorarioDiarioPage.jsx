import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { horarioDiarioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'

/**
 * Resumen diario del horario por sede. Pensado para que el coordinador imprima
 * (o descargue como PDF vía el diálogo del navegador) y comparta con el equipo
 * cada mañana. El backend además envía este resumen por email automático a las
 * 07:00 a cada empleado programado y al coordinador.
 */
export default function HorarioDiarioPage() {
  const { user } = useAuthStore()
  const sedeId = user?.sedes?.[0]
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data, isLoading } = useQuery({
    queryKey: ['horario-diario', sedeId, fecha],
    queryFn: () => horarioDiarioService.get(sedeId, fecha),
    enabled: !!sedeId,
  })

  const sede = data?.sede
  const items = data?.items ?? []
  const r = data?.resumen ?? {}

  const dia = parseISO(fecha)

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Resumen diario del horario</h1>
          <p className="text-xs text-gray-500">Vista por sede para imprimir o compartir</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            className="input w-auto text-sm"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <button className="btn-primary" onClick={() => window.print()}>
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Encabezado para impresión */}
      <div className="card mb-4 print:shadow-none print:border-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {sede?.nombre ?? '—'}{sede?.ciudad ? ` · ${sede.ciudad}` : ''}
            </div>
            <div className="text-sm text-gray-600 capitalize">
              {format(dia, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <div className="text-2xl font-semibold text-gray-900">{r.asignaciones_total ?? 0}</div>
              <div className="text-gray-500">Asignaciones</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900">{r.recursos_distintos ?? 0}</div>
              <div className="text-gray-500">Personas programadas</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-brand-600">{r.pacientes_capacidad_total ?? 0}</div>
              <div className="text-gray-500">Pacientes programados</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card print:shadow-none print:border-0">
        <SectionHeader title="Detalle del día" />
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState icon="📅" title="Sin asignaciones para este día" description="Esta sede no tiene asignaciones programadas para la fecha seleccionada." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Horario</th>
                <th className="px-3 py-2 text-left">Consultorio</th>
                <th className="px-3 py-2 text-left">Recurso</th>
                <th className="px-3 py-2 text-left">Auxiliar</th>
                <th className="px-3 py-2 text-right">Pacientes</th>
                <th className="px-3 py-2 text-center print:hidden">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-xs font-medium">{it.hora_inicio}–{it.hora_fin}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium text-gray-800">{it.consultorio?.nombre}</div>
                    <div className="text-gray-500 capitalize">{it.consultorio?.especialidad}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{it.recurso?.nombre}</div>
                    {it.recurso?.especialidad && <div className="text-gray-500 text-xs">{it.recurso.especialidad}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{it.auxiliar?.nombre ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-right">{it.pacientes_capacidad}</td>
                  <td className="px-3 py-2 text-center print:hidden">
                    {it.ausencia_recurso ? (
                      <Badge variant="red">Recurso ausente</Badge>
                    ) : it.ausencia_auxiliar ? (
                      <Badge variant="amber">Aux ausente</Badge>
                    ) : it.es_horas_extras ? (
                      <Badge variant="amber">extras</Badge>
                    ) : (
                      <Badge variant="green">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-400 mt-3 text-center print:mt-6">
        Generado el {format(new Date(), "d MMM yyyy 'a las' HH:mm", { locale: es })} · SGRC · COFCA
      </div>
    </div>
  )
}
