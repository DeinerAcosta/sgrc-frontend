import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { recursoService, sedeService } from '@/services/api'
import { Avatar, Badge, Spinner, EmptyState, SectionHeader } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'

const ESQUEMAS_PAGO = [
  { value: 'por_paciente', label: 'Por paciente' },
  { value: 'fijo',         label: 'Salario fijo' },
  { value: 'mixto',        label: 'Mixto (fijo + incentivo)' },
]

/**
 * HU-S-02 (parte recursos), RN-12 (intervalo solo supervisor), RN-14 (inactivación).
 * Catálogo maestro de recursos — solo supervisor.
 */
export default function AdminRecursosPage() {
  const qc = useQueryClient()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [editing, setEditing] = useState(null)

  const { data: recursos = [], isLoading } = useQuery({
    queryKey: ['admin-recursos', filtroTipo, filtroActivo],
    queryFn: () => recursoService.list({
      tipo: filtroTipo || undefined,
      activo: filtroActivo === 'activos' ? true : filtroActivo === 'inactivos' ? false : undefined,
    }),
  })

  const filtrados = recursos.filter((r) =>
    !busqueda || r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Catálogo de recursos</h1>
          <p className="text-xs text-gray-500">{recursos.length} recursos — {recursos.filter((r) => r.activo).length} activos</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}>+ Nuevo recurso</button>
      </div>

      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="input" value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtrados.length === 0 ? (
          <EmptyState icon="👥" title="Sin recursos" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Recurso</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Especialidad</th>
                <th className="px-3 py-2 text-right">Intervalo</th>
                <th className="px-3 py-2 text-left">Esquema pago</th>
                <th className="px-3 py-2 text-right">Tope semanal</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => {
                const tipoInfo = TIPOS_RECURSO.find((t) => t.value === r.tipo)
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar nombre={r.nombre} size="sm" color={tipoInfo?.color ?? 'blue'} />
                        <span className="text-xs font-medium text-gray-900">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge variant={tipoInfo?.color ?? 'gray'}>{tipoInfo?.label ?? r.tipo}</Badge></td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.especialidad ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right">{r.intervalo_minutos ? `${r.intervalo_minutos} min` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{ESQUEMAS_PAGO.find((e) => e.value === r.esquema_pago)?.label ?? r.esquema_pago}</td>
                    <td className="px-3 py-2 text-xs text-right">{r.horas_max_semana}h</td>
                    <td className="px-3 py-2 text-center"><Badge variant={r.activo ? 'green' : 'red'}>{r.activo ? 'activo' : 'inactivo'}</Badge></td>
                    <td className="px-3 py-2 text-right"><button className="btn text-xs" onClick={() => setEditing(r)}>Editar</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && <RecursoModal recurso={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries(['admin-recursos']); setEditing(null) }} />}
    </div>
  )
}

function RecursoModal({ recurso, onClose, onSaved }) {
  const isNew = !recurso.id
  const [form, setForm] = useState({
    nombre: recurso.nombre ?? '',
    tipo: recurso.tipo ?? 'auxiliar',
    especialidad: recurso.especialidad ?? '',
    intervalo_minutos: recurso.intervalo_minutos ?? 10,
    esquema_pago: recurso.esquema_pago ?? 'fijo',
    horas_max_semana: recurso.horas_max_semana ?? 42,
    horas_max_dia: recurso.horas_max_dia ?? 10,
    multi_consultorio: recurso.multi_consultorio ?? false,
    activo: recurso.activo ?? true,
    motivo_inactivacion: '',
  })

  const requiereIntervalo = ['oftalmologo', 'optometra', 'anestesiologo', 'tecnico'].includes(form.tipo)
  const requiereEspecialidad = ['oftalmologo', 'optometra', 'anestesiologo'].includes(form.tipo)
  const puedeMultiConsultorio = ['oftalmologo', 'optometra', 'anestesiologo'].includes(form.tipo)
  const cambiaEstado = !isNew && form.activo !== recurso.activo

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew ? recursoService.create(form) : recursoService.update(recurso.id, form),
    onSuccess: () => {
      toast.success(isNew ? 'Recurso creado' : 'Recurso actualizado')
      if (cambiaEstado && !form.activo) {
        toast('⚠️ RN-14: revisa las asignaciones futuras de este recurso — el coordinador debe resolverlas manualmente', { duration: 6000 })
      }
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nuevo recurso' : `Editar: ${recurso.nombre}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nombre completo *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <label className="label">Tipo de recurso *</label>
            <select
              className="input"
              value={form.tipo}
              onChange={(e) => {
                const nuevoTipo = e.target.value
                const sigueAplicandoMulti = ['oftalmologo', 'optometra', 'anestesiologo'].includes(nuevoTipo)
                setForm({ ...form, tipo: nuevoTipo, multi_consultorio: sigueAplicandoMulti ? form.multi_consultorio : false })
              }}
            >
              {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              {form.tipo === 'oftalmologo' && 'Requiere auxiliar de enfermería en franja'}
              {form.tipo === 'anestesiologo' && 'Requiere auxiliar de enfermería en franja'}
              {form.tipo === 'optometra' && 'No requiere auxiliar — esquema mixto típico'}
              {form.tipo === 'auxiliar' && 'Costo fijo — vigilar subutilización'}
              {form.tipo === 'tecnico' && 'Atiende métodos diagnósticos'}
            </div>
          </div>
          {requiereEspecialidad && (
            <div>
              <label className="label">Subespecialidad</label>
              <input className="input" value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} placeholder="Ej: Retina, Córnea, Glaucoma" />
            </div>
          )}
          {requiereIntervalo && (
            <div>
              <label className="label">Intervalo por paciente (minutos) *</label>
              <input className="input" type="number" min="5" max="60" value={form.intervalo_minutos} onChange={(e) => setForm({ ...form, intervalo_minutos: parseInt(e.target.value) || 10 })} />
              <div className="text-xs text-amber-700 mt-1">RN-12: solo el supervisor puede modificar este campo</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Esquema de pago *</label>
              <select className="input" value={form.esquema_pago} onChange={(e) => setForm({ ...form, esquema_pago: e.target.value })}>
                {ESQUEMAS_PAGO.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Horas máx. semana</label>
              <input className="input" type="number" min="1" max="60" value={form.horas_max_semana} onChange={(e) => setForm({ ...form, horas_max_semana: parseInt(e.target.value) || 42 })} />
            </div>
          </div>
          {puedeMultiConsultorio && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.multi_consultorio}
                  onChange={(e) => setForm({ ...form, multi_consultorio: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-medium text-blue-900">Multi-consultorio (cubre varias salas en paralelo)</div>
                  <div className="text-xs text-blue-700 mt-0.5">
                    Para médicos que rotan entre 2-3 consultorios con auxiliares manejando cada sala. Al activarlo, el programador permite asignaciones simultáneas en distintos consultorios y las horas diarias se cuentan por <strong>unión de intervalos</strong> (no por suma), respetando el tope de {form.horas_max_dia ?? 10}h reales.
                  </div>
                </div>
              </label>
            </div>
          )}
          {!isNew && (
            <div>
              <label className="label">Estado</label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                Recurso activo (se puede asignar)
              </label>
            </div>
          )}
          {cambiaEstado && !form.activo && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                <strong>RN-14:</strong> Las asignaciones futuras de este recurso NO se eliminan. Quedarán marcadas como "Sin cobertura — requiere reemplazo" y el coordinador debe resolverlas.
              </div>
              <div>
                <label className="label">Motivo de inactivación *</label>
                <textarea className="input resize-none" rows={2} value={form.motivo_inactivacion} onChange={(e) => setForm({ ...form, motivo_inactivacion: e.target.value })} placeholder="Ej: Cambio de área, fin de contrato, etc." />
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!form.nombre || (cambiaEstado && !form.activo && !form.motivo_inactivacion) || isPending}
          >
            {isPending ? <Spinner size="sm" /> : (isNew ? 'Crear' : 'Guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
