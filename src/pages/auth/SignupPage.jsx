import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService, sedeService } from '@/services/api'
import { Spinner } from '@/components/ui'
import { TIPOS_RECURSO } from '@/utils/helpers'

// Sep-2026: solo dos roles auto-registrables. `directivo` y `supervisor` los
// crea el supervisor manualmente por bulk o desde /admin/usuarios — no tiene
// sentido que alguien se auto-declare directivo/supervisor.
const ROLES = [
  { value: 'recurso',     label: 'Recurso (médico, optómetra, auxiliar, técnico, asesor)' },
  { value: 'coordinador', label: 'Coordinador de sede' },
]

/**
 * Registro público — el empleado se autorregistra con datos IDENTIFICATIVOS
 * únicamente. La solicitud queda pendiente hasta que el supervisor la apruebe;
 * al aprobar, el supervisor completa los datos técnicos (horas, esquema de
 * pago, intervalo, coord líder, sede definitiva) según contrato y necesidad
 * operativa. Este formulario NO expone esos campos porque:
 *   - Las horas máx las define el contrato laboral, no el profesional.
 *   - El esquema de pago lo define nómina, no el profesional.
 *   - El intervalo por paciente lo fija supervisor (RN-12).
 *   - Las sedes efectivas las asigna coord/supervisor según necesidad.
 * El campo `sedes preferidas` queda como PREFERENCIA informativa para que el
 * supervisor tenga contexto al aprobar; no se convierte en asignación directa.
 */
export default function RegistroPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'recurso',
    resource_type: '',   // solo relevante si role=recurso
    specialty: '',       // opcional, informativo
    requested_sites: [], // preferencia
    comments: '',        // texto libre — "referido por Y", contrato, etc.
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
      resource_type: form.role === 'recurso' ? (form.resource_type || undefined) : undefined,
      specialty: form.role === 'recurso' && form.specialty ? form.specialty.trim() : undefined,
      requested_sites: form.requested_sites.length > 0 ? form.requested_sites : undefined,
      // Los datos técnicos (horas, esquema, intervalo) NO se envian — el
      // supervisor los completa al aprobar la solicitud desde /admin/usuarios.
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
    requested_sites: f.requested_sites.includes(id)
      ? f.requested_sites.filter((x) => x !== id)
      : [...f.requested_sites, id],
  }))

  const esRecurso = form.role === 'recurso'
  const valid =
    form.name.trim().length >= 3 &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    form.phone.trim().length >= 7 &&
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
            <p className="text-xs text-gray-500 mt-1">
              Tu solicitud quedará pendiente de aprobación por el supervisor
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Nombre completo *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ej. Juan Pérez López"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Email corporativo *</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="tu@cofca.com"
                />
              </div>
              <div>
                <label className="label">Celular *</label>
                <input
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="300 555 1234"
                />
              </div>
            </div>

            <div>
              <label className="label">Rol solicitado *</label>
              <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {esRecurso && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo de profesional *</label>
                  <select
                    className="input"
                    value={form.resource_type}
                    onChange={(e) => set('resource_type', e.target.value)}
                  >
                    <option value="">Selecciona...</option>
                    {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Especialidad (opcional)</label>
                  <input
                    className="input"
                    value={form.specialty}
                    onChange={(e) => set('specialty', e.target.value)}
                    placeholder="Ej. Retina, Córnea"
                  />
                </div>
              </div>
            )}

            {sedes.length > 0 && (
              <div>
                <label className="label">Sede(s) donde te interesa trabajar (opcional)</label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {sedes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.requested_sites.includes(s.id)}
                        onChange={() => toggleSede(s.id)}
                      />
                      <span>{s.name}{s.city ? ` · ${s.city}` : ''}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 italic">
                  Es una preferencia. El supervisor asignará la(s) sede(s) definitiva(s) al aprobar la solicitud.
                </p>
              </div>
            )}

            <div>
              <label className="label">Comentario para el supervisor (opcional)</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.comments}
                onChange={(e) => set('comments', e.target.value)}
                placeholder="Ej. Referido por Dra. X, entro por el contrato Y, etc."
                maxLength={300}
              />
            </div>

            <button
              className="btn-primary w-full justify-center py-2.5"
              onClick={() => mutate()}
              disabled={!valid || isPending}
            >
              {isPending ? <Spinner size="sm" /> : 'Enviar solicitud'}
            </button>

            <button className="btn w-full justify-center" onClick={() => navigate('/login')}>
              Ya tengo cuenta — Volver al login
            </button>

            <div className="text-xs text-gray-400 text-center mt-3">
              Cuando el supervisor apruebe tu solicitud, te enviaremos por email una contraseña provisional que deberás cambiar al primer ingreso. Los datos técnicos (horas, esquema de pago, sede definitiva) los define el supervisor según tu contrato.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
