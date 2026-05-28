import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { festivoService } from '@/services/api'
import { Spinner, EmptyState, SectionHeader } from '@/components/ui'

/**
 * RN-06: Calendario de festivos colombianos. El supervisor puede agregar
 * fechas especiales (cierres de sede, festivos locales, etc.). El sistema
 * los muestra resaltados en la grilla del programador.
 */
export default function AdminFestivosPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: festivos = [], isLoading } = useQuery({
    queryKey: ['admin-festivos'],
    queryFn: () => festivoService.list(),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (fecha) => festivoService.remove(fecha),
    onSuccess: () => { qc.invalidateQueries(['admin-festivos']); toast.success('Festivo eliminado') },
  })

  const { mutate: sincronizar, isPending: sincronizando } = useMutation({
    mutationFn: () => festivoService.sincronizarColombia(),
    onSuccess: (res) => {
      qc.invalidateQueries(['admin-festivos'])
      const r = res?.data ?? res
      const total = (r?.creados ?? 0) + (r?.omitidos ?? 0)
      toast.success(`Sincronizado calendario de Colombia: ${r?.creados ?? 0} nuevos, ${r?.omitidos ?? 0} ya existían (de ${total})`)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al sincronizar'),
  })

  const ordenados = [...festivos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const futuros = ordenados.filter((f) => f.fecha >= format(new Date(), 'yyyy-MM-dd'))
  const pasados = ordenados.filter((f) => f.fecha < format(new Date(), 'yyyy-MM-dd'))

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Calendario de festivos</h1>
          <p className="text-xs text-gray-500">{futuros.length} festivos restantes · sincronizado con el calendario oficial de Colombia</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn whitespace-nowrap"
            onClick={() => sincronizar()}
            disabled={sincronizando}
            title="Carga automáticamente los 18 festivos oficiales del año actual y el siguiente (Ley Emiliani + Pascua). Idempotente: no duplica."
          >
            {sincronizando ? <Spinner size="sm" /> : '🇨🇴 Sincronizar Colombia'}
          </button>
          <button className="btn-primary whitespace-nowrap" onClick={() => setShowAdd(true)}>+ Agregar festivo</button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-4">
        ℹ️ Los días festivos aparecen resaltados en la grilla del programador y en el resumen diario. El sistema sincroniza automáticamente el calendario oficial de Colombia el 1 de enero de cada año (18 fechas, Ley Emiliani + Pascua). Puedes agregar festivos locales o cierres adicionales con "+ Agregar festivo".
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <SectionHeader title={`Próximos festivos (${futuros.length})`} />
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : futuros.length === 0 ? (
            <EmptyState icon="📅" title="Sin festivos próximos" />
          ) : (
            <div className="space-y-1">
              {futuros.map((f) => (
                <div key={f.fecha} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800">
                      {format(parseISO(f.fecha), "EEEE d 'de' MMMM", { locale: es })}
                    </div>
                    <div className="text-xs text-gray-500">{f.descripcion}</div>
                  </div>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => { if (confirm(`Eliminar el festivo "${f.descripcion}"?`)) eliminar(f.fecha) }}
                  >Eliminar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <SectionHeader title={`Festivos pasados (${pasados.length})`} />
          {pasados.length === 0 ? (
            <EmptyState icon="📆" title="Sin historial" />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {pasados.map((f) => (
                <div key={f.fecha} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0 opacity-70">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-700">
                      {format(parseISO(f.fecha), 'd MMM yyyy', { locale: es })}
                    </div>
                    <div className="text-xs text-gray-400">{f.descripcion}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && <FestivoModal onClose={() => setShowAdd(false)} onSaved={() => { qc.invalidateQueries(['admin-festivos']); setShowAdd(false) }} />}
    </div>
  )
}

function FestivoModal({ onClose, onSaved }) {
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => festivoService.create({ fecha, descripcion }),
    onSuccess: () => { toast.success('Festivo agregado'); onSaved() },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Nuevo festivo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Fecha *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="label">Descripción *</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Cierre por mantenimiento, festividad local..." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => mutate()} disabled={!fecha || !descripcion || isPending}>
            {isPending ? <Spinner size="sm" /> : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
