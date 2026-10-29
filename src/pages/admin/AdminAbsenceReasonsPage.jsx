import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { motivoAusenciaService } from '@/services/api'
import { Spinner, EmptyState, SectionHeader, Badge } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useConfirm } from '@/contexts/ConfirmContext'

/**
 * Catálogo editable de motivos de ausencia. Gerencia y supervisor pueden:
 *  - Editar nombre / descripción / factor de impacto / orden de los 9 motivos
 *    del sistema (no se pueden borrar ni desactivar).
 *  - Crear motivos personalizados nuevos (con código auto-generado del nombre).
 *  - Desactivar motivos personalizados (ya no aparecen en el formulario) o
 *    eliminarlos de verdad (oct-2026); las ausencias viejas conservan su tipo.
 *  - Decir si cada motivo es remunerado: arma los dos grupos del formulario.
 *
 * El factor de impacto (0.00 a 1.00) multiplica los pacientes y el costo
 * de oportunidad en el cálculo de RN-18. Ej: factor=0.30 en "Vacaciones"
 * significa que solo el 30% del impacto se imputa (porque la ausencia ya
 * estaba planeada y se cubrió con tiempo).
 */
export default function AdminMotivosAusenciaPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [editando, setEditando] = useState(null)
  const [creando, setCreando] = useState(false)
  // 22-oct · Hector quitó la familia de esta pantalla; el filtro es remunerada sí/no.
  const [filtro, setFiltro] = useState('todas')

  const { data: motivos = [], isLoading } = useQuery({
    queryKey: ['motivos-ausencia'],
    queryFn: () => motivoAusenciaService.list(),
  })

  const motivosFiltrados = useMemo(() => {
    if (filtro === 'todas') return motivos
    return motivos.filter((m) => !!m.is_paid === (filtro === 'si'))
  }, [motivos, filtro])
  const remuneradas = motivos.filter((m) => m.is_paid).length

  const { mutate: eliminar } = useMutation({
    mutationFn: (id) => motivoAusenciaService.eliminar(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['motivos-ausencia'] })
      toast.success(r?.ausencias_sin_motivo ? `Motivo eliminado · ${r.ausencias_sin_motivo} ausencia(s) quedan con su tipo base` : 'Motivo eliminado')
    },
    onError: (err) => toast.error(err?.message ?? 'Error al eliminar'),
  })

  const confirmarEliminar = async (m) => {
    const ok = await confirm({
      title: `¿Eliminar "${m.name}" definitivamente?`,
      message: 'Se borra del catálogo y no se puede deshacer. Las ausencias que ya lo usaban conservan su tipo base, pero dejan de mostrar este motivo.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (ok) eliminar(m.id)
  }

  const { mutate: desactivar } = useMutation({
    mutationFn: (id) => motivoAusenciaService.desactivar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['motivos-ausencia'] }); toast.success('Motivo desactivado') },
    onError: (err) => toast.error(err?.message ?? 'Error al desactivar'),
  })

  const confirmarDesactivar = async (m) => {
    const ok = await confirm({
      title: `¿Desactivar "${m.name}"?`,
      message: 'Las ausencias ya registradas con este motivo siguen como están; este motivo ya no aparecerá en el dropdown para nuevas ausencias.',
      confirmLabel: 'Desactivar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (ok) desactivar(m.id)
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Motivos de ausencia</h1>
          <p className="text-xs text-gray-500">
            Los motivos que se eligen al registrar una ausencia, si son remunerados y cuánto impactan en pacientes y costo.
          </p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setCreando(true)}>+ Nuevo motivo</button>
      </div>

      <div className="card">
        <SectionHeader
          title="Catálogo"
          action={<span className="text-xs text-gray-400">{motivosFiltrados.length} de {motivos.length}</span>}
        />

        {!isLoading && motivos.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            <FiltroChip active={filtro === 'todas'} onClick={() => setFiltro('todas')} label="Todos" count={motivos.length} />
            <FiltroChip active={filtro === 'si'} onClick={() => setFiltro('si')} label="Remunerados" count={remuneradas} variant="green" />
            <FiltroChip active={filtro === 'no'} onClick={() => setFiltro('no')} label="No remunerados" count={motivos.length - remuneradas} variant="amber" />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : motivosFiltrados.length === 0 ? (
          <EmptyState icon="📂" title="Sin motivos" description={filtro === 'todas' ? 'No hay motivos cargados todavía.' : 'No hay motivos en este grupo.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left px-2 py-2">Orden</th>
                  <th className="text-left px-2 py-2">Motivo</th>
                  <th className="text-left px-2 py-2">Remunerado</th>
                  <th className="text-left px-2 py-2 hidden md:table-cell">Descripción</th>
                  <th className="text-left px-2 py-2">Impacto</th>
                  <th className="text-left px-2 py-2">Estado</th>
                  <th className="text-right px-2 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {motivosFiltrados.map((m) => {
                  return (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-400">{m.sort_order}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-gray-900">{m.name}</div>
                        <div className="text-xs text-gray-400">cód: {m.code}</div>
                      </td>
                      <td className="px-2 py-2">
                        {m.is_paid ? <Badge variant="green">Sí</Badge> : <Badge variant="amber">No</Badge>}
                      </td>
                      <td className="px-2 py-2 text-gray-600 hidden md:table-cell">
                        <span className="line-clamp-2">{m.description ?? '—'}</span>
                      </td>
                      <td className="px-2 py-2">
                        <FactorBadge factor={m.impact_factor} />
                      </td>
                      <td className="px-2 py-2">
                        {m.is_system && <Badge variant="blue">Sistema</Badge>}
                        {!m.is_system && (m.active ? <Badge variant="green">Activo</Badge> : <Badge variant="gray">Inactivo</Badge>)}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button className="text-xs text-brand-600 hover:underline mr-3" onClick={() => setEditando(m)}>Editar</button>
                        {!m.is_system && m.active && (
                          <button className="text-xs text-amber-700 hover:underline mr-3" onClick={() => confirmarDesactivar(m)}>Desactivar</button>
                        )}
                        {m.code !== 'retraso_inicio' && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => confirmarEliminar(m)}>Eliminar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <MotivoModal
          motivo={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['motivos-ausencia'] }); setEditando(null) }}
        />
      )}
      {creando && (
        <MotivoModal
          motivo={null}
          onClose={() => setCreando(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['motivos-ausencia'] }); setCreando(false) }}
        />
      )}
    </div>
  )
}

function FiltroChip({ active, onClick, label, count, variant }) {
  const activeClasses = {
    red:   'bg-red-100 text-red-800 border-red-200',
    blue:  'bg-blue-100 text-blue-800 border-blue-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    gray:  'bg-gray-200 text-gray-800 border-gray-300',
  }
  const cls = active
    ? (activeClasses[variant] ?? 'bg-brand-100 text-brand-800 border-brand-200')
    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border ${cls} transition`}
    >
      {label} <span className="text-[10px] opacity-70">({count})</span>
    </button>
  )
}

function FactorBadge({ factor }) {
  const pct = Math.round(factor * 100)
  const variant = pct >= 80 ? 'red' : pct >= 50 ? 'amber' : pct > 0 ? 'green' : 'gray'
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>{pct}%</Badge>
    </div>
  )
}

function MotivoModal({ motivo, onClose, onSaved }) {
  const esEdicion = !!motivo
  const esSistema = motivo?.is_system === true

  const [form, setForm] = useState({
    name: motivo?.name ?? '',
    description: motivo?.description ?? '',
    impactFactor: motivo?.impact_factor ?? 1,
    // '' = sin elegir (obligatorio al crear).
    isPaid: motivo ? (motivo.is_paid ? 'si' : 'no') : '',
    sort_order: motivo?.sort_order ?? 99,
    active: motivo?.active ?? true,
  })
  const { tryClose } = useDirtyClose(form, onClose)

  const { mutate, isPending } = useMutation({
    mutationFn: () => esEdicion
      ? motivoAusenciaService.actualizar(motivo.id, {
          name: form.name,
          description: form.description || null,
          impactFactor: form.impactFactor,
          sort_order: form.sort_order,
          isPaid: form.isPaid === 'si',
          ...(esSistema ? {} : { active: form.active }),
        })
      : motivoAusenciaService.crear({
          name: form.name,
          description: form.description || null,
          impactFactor: form.impactFactor,
          sort_order: form.sort_order,
          isPaid: form.isPaid === 'si',
        }),
    onSuccess: () => {
      toast.success(esEdicion ? 'Motivo actualizado' : 'Motivo creado')
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error al guardar'),
  })

  const valida = form.name.trim().length >= 2 && form.impactFactor >= 0 && form.impactFactor <= 1 && form.isPaid !== ''
  const fija = motivo?.code === 'licencia_remunerada'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && tryClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {esEdicion ? `Editar motivo: ${motivo.name}` : 'Nuevo motivo personalizado'}
            {esSistema && <span className="ml-2 text-xs font-normal text-blue-600">(Sistema)</span>}
          </h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div>
            <label className="label">Nombre <span className="text-red-600">*</span></label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Cita médica programada"
              maxLength={100}
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Texto explicativo opcional"
              maxLength={2000}
            />
          </div>

          <div>
            <label className="label">¿Es remunerado? <span className="text-red-600">*</span></label>
            <div className="flex gap-4">
              {[{ v: 'si', l: 'Sí' }, { v: 'no', l: 'No' }].map((o) => (
                <label key={o.v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="motivo_remunerado" checked={form.isPaid === o.v} disabled={fija} onChange={() => setForm({ ...form, isPaid: o.v })} />
                  {o.l}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">
              Impacto en pacientes y costo: <strong>{Math.round(form.impactFactor * 100)}%</strong>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(form.impactFactor * 100)}
              onChange={(e) => setForm({ ...form, impactFactor: Number(e.target.value) / 100 })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0% (no impacta)</span>
              <span>50% (parcial)</span>
              <span>100% (completo)</span>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {form.impactFactor >= 0.9 && '⚠️ Las nuevas ausencias con este motivo se contarán como impacto completo.'}
              {form.impactFactor >= 0.4 && form.impactFactor < 0.9 && '⚖️ Impacto parcial — útil para ausencias con cobertura previa.'}
              {form.impactFactor < 0.4 && form.impactFactor > 0 && '✓ Impacto reducido — el motivo no penaliza tanto la métrica.'}
              {form.impactFactor === 0 && '✓ Sin impacto en métricas — útil para vacaciones planeadas con cobertura.'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Orden</label>
              <input
                type="number"
                className="input"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                min={0}
                max={9999}
              />
              <div className="text-xs text-gray-400 mt-1">Posición en el dropdown</div>
            </div>
            {esEdicion && !esSistema && (
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  <span>Activo (visible en dropdown)</span>
                </label>
              </div>
            )}
          </div>

          {esSistema && (
            <div className="bg-blue-50 border border-blue-100 rounded p-2 text-xs text-blue-800">
              🛡️ Este motivo es del sistema — no se puede desactivar ni borrar. Sí puede editar nombre, descripción, factor y orden.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            disabled={!valida || isPending}
            onClick={() => mutate()}
          >
            {isPending ? <Spinner size="sm" /> : (esEdicion ? 'Guardar cambios' : 'Crear motivo')}
          </button>
        </div>
      </div>
    </div>
  )
}
