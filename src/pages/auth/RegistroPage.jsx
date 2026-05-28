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
    nombre: '', email: '', celular: '', rol: 'recurso',
    tipo_recurso: '', especialidad: '', horas_max_semana: 42, horas_max_dia: 10,
    esquema_pago: 'fijo', intervalo_minutos: '',
    sedes_solicitadas: [],
  })

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-publico'],
    queryFn: () => sedeService.list(),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => authService.registro({
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      celular: form.celular.trim() || undefined,
      rol: form.rol,
      tipo_recurso: form.rol === 'recurso' ? form.tipo_recurso || undefined : undefined,
      especialidad: form.rol === 'recurso' && form.especialidad ? form.especialidad.trim() : undefined,
      horas_max_semana: form.rol === 'recurso' ? Number(form.horas_max_semana) || undefined : undefined,
      horas_max_dia: form.rol === 'recurso' ? Number(form.horas_max_dia) || undefined : undefined,
      esquema_pago: form.rol === 'recurso' ? form.esquema_pago : undefined,
      intervalo_minutos: form.rol === 'recurso' && form.intervalo_minutos ? Number(form.intervalo_minutos) : undefined,
      sedes_solicitadas: form.sedes_solicitadas.length > 0 ? form.sedes_solicitadas : undefined,
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
    sedes_solicitadas: f.sedes_solicitadas.includes(id) ? f.sedes_solicitadas.filter((x) => x !== id) : [...f.sedes_solicitadas, id],
  }))

  const esRecurso = form.rol === 'recurso'
  const valid =
    form.nombre.trim().length >= 3 &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    (form.rol === 'directivo' || form.celular.trim().length >= 7) &&
    (!esRecurso || !!form.tipo_recurso)

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
              <input className="input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Juan Pérez" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email corporativo *</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tu@cofca.co" />
              </div>
              <div>
                <label className="label">Celular {form.rol !== 'directivo' && '*'}</label>
                <input className="input" type="tel" value={form.celular} onChange={(e) => set('celular', e.target.value)} placeholder="300 555 1234" />
              </div>
            </div>

            <div>
              <label className="label">Rol *</label>
              <select className="input" value={form.rol} onChange={(e) => set('rol', e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {esRecurso && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-3">
                <div className="text-xs font-medium text-blue-900">Datos del recurso clínico</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Tipo *</label>
                    <select className="input" value={form.tipo_recurso} onChange={(e) => set('tipo_recurso', e.target.value)}>
                      <option value="">Selecciona...</option>
                      {TIPOS_RECURSO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Especialidad</label>
                    <input className="input" value={form.especialidad} onChange={(e) => set('especialidad', e.target.value)} placeholder="Ej. Retina" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">H. máx. semana</label>
                    <input className="input" type="number" min="1" max="60" value={form.horas_max_semana} onChange={(e) => set('horas_max_semana', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">H. máx. día</label>
                    <input className="input" type="number" min="1" max="24" value={form.horas_max_dia} onChange={(e) => set('horas_max_dia', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Intervalo (min)</label>
                    <input className="input" type="number" min="5" max="60" value={form.intervalo_minutos} onChange={(e) => set('intervalo_minutos', e.target.value)} placeholder="15" />
                  </div>
                </div>
                <div>
                  <label className="label">Esquema de pago</label>
                  <select className="input" value={form.esquema_pago} onChange={(e) => set('esquema_pago', e.target.value)}>
                    {ESQUEMAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {(esRecurso || form.rol === 'coordinador') && sedes.length > 0 && (
              <div>
                <label className="label">Sede(s) a las que quieres pertenecer</label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {sedes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.sedes_solicitadas.includes(s.id)} onChange={() => toggleSede(s.id)} />
                      <span>{s.nombre}{s.ciudad ? ` · ${s.ciudad}` : ''}</span>
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
