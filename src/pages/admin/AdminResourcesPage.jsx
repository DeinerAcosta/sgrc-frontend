import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { recursoService, usuarioService } from '@/services/api'
import { Avatar, Badge, Spinner, EmptyState } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'
import { useDirtyClose } from '@/hooks/useDirtyClose'

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
  const [filtroActivo, setFiltroActivo] = useState('activos')
  const [filtroLider, setFiltroLider] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [editing, setEditing] = useState(null)

  // Lista de coordinadores para el filtro "Coordinador líder" (incluye el
  // pseudo-valor "sin-lider" para detectar recursos huérfanos).
  const { data: coordinadores = [] } = useQuery({
    queryKey: ['coordinadores-todos'],
    queryFn: () => usuarioService.list({ role: 'coordinador' }),
  })

  const { data: recursos = [], isLoading } = useQuery({
    queryKey: ['admin-recursos', filtroTipo, filtroActivo, filtroLider],
    queryFn: () => recursoService.list({
      type: filtroTipo || undefined,
      active: filtroActivo === 'activos' ? true : filtroActivo === 'inactivos' ? false : undefined,
      // "sin-lider" se procesa en cliente (no se envía al backend)
      lead_coordinator_id: filtroLider && filtroLider !== 'sin-lider' ? filtroLider : undefined,
    }),
  })

  const filtrados = recursos
    .filter((r) => !busqueda || r.name.toLowerCase().includes(busqueda.toLowerCase()))
    .filter((r) => filtroLider !== 'sin-lider' || !r.lead_coordinator_id)

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Catálogo de recursos</h1>
          <p className="text-xs text-gray-500">{recursos.length} recursos — {recursos.filter((r) => r.active).length} activos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" onClick={() => setEditing({})}>+ Nuevo recurso</button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <select className="input" value={filtroLider} onChange={(e) => setFiltroLider(e.target.value)}>
            <option value="">Todos los líderes</option>
            <option value="sin-lider">⚠️ Sin líder asignado</option>
            {coordinadores
              .filter((c) => c.active)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Recurso</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Coordinador líder</th>
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
                const tipoInfo = TIPOS_RECURSO.find((t) => t.value === r.type)
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar nombre={r.name} size="sm" color={tipoInfo?.color ?? 'blue'} />
                        <span className="text-xs font-medium text-gray-900">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge variant={tipoInfo?.color ?? 'gray'}>{tipoInfo?.label ?? r.type}</Badge></td>
                    <td className="px-3 py-2 text-xs">
                      {r.coordinador_lider_nombre
                        ? <span className="text-gray-700">{r.coordinador_lider_nombre}</span>
                        : <span className="text-amber-700 italic">sin líder</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.specialty ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right">{r.slot_minutes ? `${r.slot_minutes} min` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{ESQUEMAS_PAGO.find((e) => e.value === r.pay_scheme)?.label ?? r.pay_scheme}</td>
                    <td className="px-3 py-2 text-xs text-right">{r.max_hours_per_week == null ? <span className="text-gray-400 italic">sin tope</span> : `${r.max_hours_per_week}h`}</td>
                    <td className="px-3 py-2 text-center"><Badge variant={r.active ? 'green' : 'red'}>{r.active ? 'activo' : 'inactivo'}</Badge></td>
                    <td className="px-3 py-2 text-right"><button className="btn text-xs" onClick={() => setEditing(r)}>Editar</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {editing !== null && <RecursoModal recurso={editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-recursos'] }); setEditing(null) }} />}
    </div>
  )
}

function RecursoModal({ recurso, onClose, onSaved }) {
  const isNew = !recurso.id
  const [form, setForm] = useState({
    name: recurso.name ?? '',
    type: recurso.type ?? 'auxiliar',
    specialty: recurso.specialty ?? '',
    slot_minutes: recurso.slot_minutes ?? 10,
    pay_scheme: recurso.pay_scheme ?? 'fijo',
    max_hours_per_week: recurso.max_hours_per_week, // puede ser null para oftalmólogos
    max_hours_per_day: recurso.max_hours_per_day ?? 10,
    multi_room: recurso.multi_room ?? false,
    active: recurso.active ?? true,
    deactivation_reason: '',
    // CSV de tipos donde el recurso puede aparecer como apoyo además del suyo.
    support_types: recurso.support_types ?? '',
    // PROYECTOS-3255 #5.1 · Firma escaneada del profesional (data URL base64).
    // Sep-2026: el list() del backend ya NO trae signature_url (perf). Se
    // hidrata bajo demanda con recursoService.getById al abrir el modal.
    signature_url: '',
  })

  // firmaTocada = true cuando el usuario subio o quito firma en esta sesion
  // del modal. Si es false, en el update NO reenviamos signature_url para
  // ahorrar tráfico (evita re-subir 768 KB de Alejandra al cambiar un check).
  const [firmaTocada, setFirmaTocada] = useState(false)

  // Fetch bajo demanda del recurso completo (con signature_url) cuando el
  // modal se abre para EDITAR. Nuevos recursos no requieren fetch.
  const { data: detalleRecurso } = useQuery({
    queryKey: ['recurso-detalle', recurso.id],
    queryFn: () => recursoService.getById(recurso.id),
    enabled: !isNew && !!recurso.id,
    staleTime: 0,   // firma puede haberse cambiado desde otra sesion → siempre fresh
  })
  useEffect(() => {
    if (detalleRecurso?.signature_url && !firmaTocada) {
      setForm((f) => ({ ...f, signature_url: detalleRecurso.signature_url }))
    }
  }, [detalleRecurso, firmaTocada])

  // Helpers para el set de "tipos de apoyo" (CSV ↔ array)
  const apoyoSet = new Set(form.support_types ? form.support_types.split(',') : [])
  const toggleApoyo = (t) => {
    if (apoyoSet.has(t)) apoyoSet.delete(t)
    else apoyoSet.add(t)
    setForm({ ...form, support_types: [...apoyoSet].join(',') })
  }
  const { tryClose } = useDirtyClose(form, onClose)

  const requiereIntervalo = ['oftalmologo', 'optometra', 'anestesiologo', 'tecnico', 'fonoaudiologa'].includes(form.type)
  // Especialidad y multi-consultorio aplican solo a oftalmólogos (sub-especialidad
  // médica como Retina/Glaucoma/Córnea/etc., y rotación entre consultorios).
  const requiereEspecialidad = form.type === 'oftalmologo'
  const puedeMultiConsultorio = form.type === 'oftalmologo'
  // Tipos que cobran por paciente: sin tope semanal (esquema por_paciente).
  const esPorPaciente = form.type === 'oftalmologo' || form.type === 'fonoaudiologa'
  const cambiaEstado = !isNew && form.active !== recurso.active

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      // Sep-2026 · perf [6]: si el usuario NO toco la firma, no la reenviamos.
      // Prisma trata `undefined` como "no cambiar el campo", asi que la firma
      // en la BD queda intacta. Para nuevos, siempre incluir (puede ser '').
      const payload = { ...form }
      if (!isNew && !firmaTocada) delete payload.signature_url
      return isNew ? recursoService.create(payload) : recursoService.update(recurso.id, payload)
    },
    onSuccess: () => {
      toast.success(isNew ? 'Recurso creado' : 'Recurso actualizado')
      if (cambiaEstado && !form.active) {
        toast('⚠️ RN-14: revisa las asignaciones futuras de este recurso — el coordinador debe resolverlas manualmente', { duration: 6000 })
      }
      onSaved()
    },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Nuevo recurso' : `Editar: ${recurso.name}`}</h2>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nombre completo *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Tipo de recurso *</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => {
                const nuevoTipo = e.target.value
                // Oftalmólogos y fonoaudiólogas: esquema por paciente → sin tope semanal.
                // Multi-consultorio y subespecialidad: solo oftalmólogos.
                // Otros: conservan lo que tenían. Al cambiar limpiamos lo que no aplica.
                const nuevoEsPorPaciente = nuevoTipo === 'oftalmologo' || nuevoTipo === 'fonoaudiologa'
                setForm({
                  ...form,
                  type: nuevoTipo,
                  multi_room: nuevoTipo === 'oftalmologo' ? form.multi_room : false,
                  specialty: nuevoTipo === 'oftalmologo' ? form.specialty : '',
                  max_hours_per_week: nuevoEsPorPaciente ? null : (form.max_hours_per_week ?? 44),
                })
              }}
            >
              {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              {form.type === 'oftalmologo' && 'Requiere auxiliar de enfermería en franja'}
              {form.type === 'anestesiologo' && 'Requiere auxiliar de enfermería en franja'}
              {form.type === 'optometra' && 'No requiere auxiliar — esquema mixto típico'}
              {form.type === 'auxiliar' && 'Costo fijo — vigilar subutilización'}
              {form.type === 'tecnico' && 'Atiende métodos diagnósticos'}
              {form.type === 'fonoaudiologa' && 'Atención por paciente — sin auxiliar, sin tope semanal'}
            </div>
          </div>
          {requiereEspecialidad && (
            <div>
              <label className="label">Subespecialidad</label>
              <input className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Ej: Retina, Córnea, Glaucoma" />
            </div>
          )}
          {/* PROYECTOS-3255 #5.1 · Firma escaneada para el PDF F-AA-126 */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-700 mb-1">Firma escaneada (opcional)</div>
            <div className="text-xs text-gray-500 mb-2">
              PNG o JPG de la firma del profesional. Se imprime al pie del PDF F-AA-126 en la caja "Firma del prestador". Máximo 1 MB (se guarda en base64 en la BD).
            </div>
            {/* Sep-2026 · perf [5]: si el recurso tiene firma en BD pero aun
                no llego el detalle, muestra un placeholder para que el user no
                piense que esta vacio. Con el detalle cargado, se pinta el <img>. */}
            {!form.signature_url && recurso.has_signature && !firmaTocada && (
              <div className="mb-2 p-2 bg-gray-50 border border-dashed border-gray-300 rounded text-xs text-gray-500 italic">
                Cargando firma actual...
              </div>
            )}
            {form.signature_url && (
              <div className="mb-2 p-2 bg-white border border-gray-200 rounded inline-block">
                <img src={form.signature_url} alt="Firma" style={{ maxHeight: 60, maxWidth: 280 }} />
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // Sep-2026: limite subido a 1 MB (era 300 KB) porque algunas firmas
                  // escaneadas del consolidado de septiembre superaban ese tope.
                  // La columna firma_url ahora es MEDIUMTEXT (16 MB) y el backend Zod
                  // acepta hasta 2 MB en base64 (~1.5 MB de imagen real).
                  if (file.size > 1024 * 1024) {
                    toast.error('La firma supera 1 MB — reducila o escaneala en menor resolucion')
                    e.target.value = ''
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    setForm({ ...form, signature_url: String(reader.result) })
                    setFirmaTocada(true)   // trackear cambio para omitir en PUT si no se toca
                  }
                  reader.onerror = () => toast.error('No se pudo leer el archivo')
                  reader.readAsDataURL(file)
                }}
              />
              {form.signature_url && (
                <button
                  type="button"
                  className="text-xs text-red-600 hover:text-red-800"
                  onClick={() => { setForm({ ...form, signature_url: '' }); setFirmaTocada(true) }}
                >
                  Quitar firma
                </button>
              )}
            </div>
          </div>
          {/* Multi-rol: el recurso aparece también en otros pools de apoyo */}
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-700 mb-1">Puede apoyar como (opcional)</div>
            <div className="text-xs text-gray-500 mb-2">
              Marcar si este recurso, además de su tipo principal, sabe hacer otro rol y debe aparecer al asignar ese tipo de apoyo.
            </div>
            <div className="flex gap-4 flex-wrap">
              {[
                { value: 'auxiliar', label: 'Auxiliar de enfermería' },
                { value: 'tecnico',  label: 'Técnico de diagnóstico' },
              ].filter((opt) => opt.value !== form.type).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apoyoSet.has(opt.value)}
                    onChange={() => toggleApoyo(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {requiereIntervalo && (
            <div>
              <label className="label">Intervalo por paciente (minutos) *</label>
              <input className="input" type="number" min="5" max="60" value={form.slot_minutes} onChange={(e) => setForm({ ...form, slot_minutes: parseInt(e.target.value) || 10 })} />
              <div className="text-xs text-amber-700 mt-1">RN-12: solo el supervisor puede modificar este campo</div>
            </div>
          )}
          <div className={`grid gap-3 ${esPorPaciente ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            <div>
              <label className="label">Esquema de pago *</label>
              <select className="input" value={form.pay_scheme} onChange={(e) => setForm({ ...form, pay_scheme: e.target.value })}>
                {ESQUEMAS_PAGO.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            {/* Recursos por_paciente (oftalmólogos, fonoaudiólogas) no tienen tope semanal contractual */}
            {!esPorPaciente && (
              <div>
                <label className="label">Horas máx. semana</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="60"
                  value={form.max_hours_per_week ?? 44}
                  onChange={(e) => setForm({ ...form, max_hours_per_week: parseInt(e.target.value) || 44 })}
                />
              </div>
            )}
            {/* Tope diario — bloquea programar más de N horas en un día.
                Subir este número para recursos que trabajan horas extras
                de forma habitual (ej. 12 o 14 en lugar del default 10). */}
            <div>
              <label className="label">Horas máx. día</label>
              <input
                className="input"
                type="number"
                min="1"
                max="18"
                value={form.max_hours_per_day ?? 10}
                onChange={(e) => setForm({ ...form, max_hours_per_day: parseInt(e.target.value) || 10 })}
              />
              <div className="text-[11px] text-gray-500 mt-1">
                Default 10h. Sube a 12-14h si trabaja horas extras habituales.
              </div>
            </div>
          </div>
          {esPorPaciente && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-800">
              ℹ️ {form.type === 'oftalmologo' ? 'Oftalmólogos' : 'Fonoaudiólogas'} no tienen tope semanal — se les paga por paciente atendido. El sistema no marcará "horas extras".
            </div>
          )}
          {puedeMultiConsultorio && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.multi_room}
                  onChange={(e) => setForm({ ...form, multi_room: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-medium text-blue-900">Multi-consultorio (cubre varias salas en paralelo)</div>
                  <div className="text-xs text-blue-700 mt-0.5">
                    Para médicos que rotan entre 2-3 consultorios con auxiliares manejando cada sala. Al activarlo, el programador permite asignaciones simultáneas en distintos consultorios y las horas diarias se cuentan por <strong>unión de intervalos</strong> (no por suma), respetando el tope de {form.max_hours_per_day ?? 10}h reales.
                  </div>
                </div>
              </label>
            </div>
          )}
          {!isNew && (
            <div>
              <label className="label">Estado</label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Recurso activo (se puede asignar)
              </label>
            </div>
          )}
          {cambiaEstado && !form.active && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                <strong>RN-14:</strong> Las asignaciones futuras de este recurso NO se eliminan. Quedarán marcadas como "Sin cobertura — requiere reemplazo" y el coordinador debe resolverlas.
              </div>
              <div>
                <label className="label">Motivo de inactivación *</label>
                <textarea className="input resize-none" rows={2} value={form.deactivation_reason} onChange={(e) => setForm({ ...form, deactivation_reason: e.target.value })} placeholder="Ej: Cambio de área, fin de contrato, etc." />
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => mutate()}
            disabled={!form.name || (cambiaEstado && !form.active && !form.deactivation_reason) || isPending}
          >
            {isPending ? <Spinner size="sm" /> : (isNew ? 'Crear' : 'Guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
