import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService, sedeService } from '@/services/api'
import { Spinner } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'

const ROLES = [
  { value: 'recurso',     label: 'Recurso (médico, optómetra, auxiliar, técnico)' },
  { value: 'coordinador', label: 'Coordinador de sede' },
  { value: 'directivo',   label: 'Directivo' },
]

const ESQUEMAS = [
  { value: 'fijo',         label: 'Salario fijo' },
  { value: 'por_paciente', label: 'Por paciente' },
  { value: 'mixto',        label: 'Mixto' },
]

/**
 * Registro público: el empleado se autorregistra; la solicitud queda pendiente
 * de aprobación por el supervisor. Al aprobar le llega un email con la
 * contraseña provisional y se le obliga a cambiarla al primer ingreso.
 */
export default function RegistroPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'recurso',
    resource_type: '', specialty: '', max_hours_per_week: 42, max_hours_per_day: 10,
    pay_scheme: 'fijo', slot_minutes: '',
    requested_sites: [],
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-publico'],
    queryFn: () => sedeService.list(),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => authService.registro({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      resource_type: form.role === 'recurso' ? form.resource_type || undefined : undefined,
      specialty: form.role === 'recurso' && form.specialty ? form.specialty.trim() : undefined,
      max_hours_per_week: form.role === 'recurso' ? Number(form.max_hours_per_week) || undefined : undefined,
      max_hours_per_day: form.role === 'recurso' ? Number(form.max_hours_per_day) || undefined : undefined,
      pay_scheme: form.role === 'recurso' ? form.pay_scheme : undefined,
      slot_minutes: form.role === 'recurso' && form.slot_minutes ? Number(form.slot_minutes) : undefined,
      requested_sites: form.requested_sites.length > 0 ? form.requested_sites : undefined,
    }),
    onSuccess: (res) => {
      toast.success(res?.message ?? 'Solicitud enviada. Recibirás un email cuando sea aprobada.')
      navigate('/login', { replace: true })
    },
    onError: (err) => toast.error(err?.message ?? 'Error al enviar la solicitud'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleSede = (id) => setForm((f) => ({
    ...f,
    requested_sites: f.requested_sites.includes(id) ? f.requested_sites.filter((x) => x !== id) : [...f.requested_sites, id],
  }))

  const esRecurso = form.role === 'recurso'
  const valid =
    form.name.trim().length >= 3 &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    (form.role === 'directivo' || form.phone.trim().length >= 7) &&
    (!esRecurso || !!form.resource_type)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="card">
          <div className="text-center mb-5">
            <div className="w-10 h-10 bg-brand-600 rounded-xl mx-auto mb-3 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SC</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900">Registrarme en SGRC</h1>
            <p className="text-xs text-gray-500 mt-1">Tu solicitud quedará pendiente de aprobación por el supervisor</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Nombre completo *</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Juan Pérez" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Email corporativo *</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tu@cofca.co" />
              </div>
              <div>
                <label className="label">Celular {form.role !== 'directivo' && '*'}</label>
                <input className="input" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="300 555 1234" />
              </div>
            </div>

            <div>
              <label className="label">Rol *</label>
              <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {esRecurso && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-3">
                <div className="text-xs font-medium text-blue-900">Datos del recurso clínico</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Tipo *</label>
                    <select className="input" value={form.resource_type} onChange={(e) => set('resource_type', e.target.value)}>
                      <option value="">Selecciona...</option>
                      {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Especialidad</label>
                    <input className="input" value={form.specialty} onChange={(e) => set('specialty', e.target.value)} placeholder="Ej. Retina" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">H. máx. semana</label>
                    <input className="input" type="number" min="1" max="60" value={form.max_hours_per_week} onChange={(e) => set('max_hours_per_week', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">H. máx. día</label>
                    <input className="input" type="number" min="1" max="24" value={form.max_hours_per_day} onChange={(e) => set('max_hours_per_day', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Intervalo (min)</label>
                    <input className="input" type="number" min="5" max="60" value={form.slot_minutes} onChange={(e) => set('slot_minutes', e.target.value)} placeholder="15" />
                  </div>
                </div>
                <div>
                  <label className="label">Esquema de pago</label>
                  <select className="input" value={form.pay_scheme} onChange={(e) => set('pay_scheme', e.target.value)}>
                    {ESQUEMAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {(esRecurso || form.role === 'coordinador') && sedes.length > 0 && (
              <div>
                <label className="label">Sede(s) a las que quieres pertenecer</label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {sedes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.requested_sites.includes(s.id)} onChange={() => toggleSede(s.id)} />
                      <span>{s.name}{s.city ? ` · ${s.city}` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary w-full justify-center py-2.5" onClick={() => mutate()} disabled={!valid || isPending}>
              {isPending ? <Spinner size="sm" /> : 'Enviar solicitud'}
            </button>

            <button className="btn w-full justify-center" onClick={() => navigate('/login')}>
              Ya tengo cuenta — Volver al login
            </button>

            <div className="text-xs text-gray-400 text-center mt-3">
              Cuando el supervisor apruebe tu solicitud, te enviaremos por email una contraseña provisional que deberás cambiar al primer ingreso.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
