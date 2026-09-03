import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { parametroService } from '@/services/api'
import { Spinner, Semaforo, SectionHeader } from '@/components/ui'

/**
 * RN-30 + RN-31: Configura las metas que el sistema usa para el semáforo
 * de todos los informes y dashboards. También la base de cálculo de
 * ocupación (12h L-V, 4h Sáb).
 */
export default function AdminMetasPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['parametros-sistema'],
    queryFn: () => parametroService.sistema(),
  })

  const [form, setForm] = useState(null)
  const [motivo, setMotivo] = useState('')

  // Inicializar form cuando llegan datos
  if (data && !form) setForm(data)

  const { mutate, isPending } = useMutation({
    mutationFn: () => parametroService.actualizarSistema({ ...form, reason: motivo }),
    onSuccess: () => {
      toast.success('Parámetros del sistema actualizados')
      qc.invalidateQueries({ queryKey: ['parametros-sistema'] })
      setMotivo('')
    },
    onError: (err) => toast.error(err?.message ?? 'Error'),
  })

  const hayCambios = form && data && JSON.stringify(form) !== JSON.stringify(data)

  if (isLoading || !form) {
    return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="p-3 sm:p-4 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Metas y parámetros del sistema</h1>
        <p className="text-xs text-gray-500">Configuración global usada por dashboards e informes</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
        ⚠️ Cualquier cambio aquí afecta INMEDIATAMENTE todos los informes y el semáforo de KPIs visibles para coordinadores y directivos. Requiere motivo y queda en auditoría.
      </div>

      <div className="card mb-4">
        <SectionHeader title="Metas — semáforo de informes (RN-30)" />
        <div className="space-y-4">
          <Meta
            label="Ocupación de consultorios"
            descripcion="Verde si la ocupación de un consultorio supera o iguala esta meta"
            value={form.meta_ocupacion_consultorios}
            onChange={(v) => setForm({ ...form, meta_ocupacion_consultorios: v })}
          />
          <Meta
            label="Utilización de talento humano (auxiliares/optómetras)"
            descripcion="Para recursos de salario fijo. Verde si supera o iguala esta meta"
            value={form.meta_utilizacion_th}
            onChange={(v) => setForm({ ...form, meta_utilizacion_th: v })}
          />
          <Meta
            label="Cumplimiento de ejecución"
            descripcion="Verde si los pacientes atendidos vs programados supera o iguala esta meta"
            value={form.meta_cumplimiento_ejecucion}
            onChange={(v) => setForm({ ...form, meta_cumplimiento_ejecucion: v })}
          />
        </div>
      </div>

      <div className="card mb-4">
        <SectionHeader title="Configuración del semáforo" />
        <div>
          <label className="label">Margen para naranja (puntos porcentuales)</label>
          <input
            className="input w-32"
            type="number"
            min="1" max="30"
            value={form.semaforo_umbral_naranja}
            onChange={(e) => setForm({ ...form, semaforo_umbral_naranja: parseInt(e.target.value) || 10 })}
          />
          <div className="text-xs text-gray-500 mt-1">
            Si la meta es {form.meta_ocupacion_consultorios}% y el margen es {form.semaforo_umbral_naranja},
            entonces:
            <span className="block mt-1">
              <Semaforo pct={form.meta_ocupacion_consultorios} metaVerde={form.meta_ocupacion_consultorios} /> Verde ≥{form.meta_ocupacion_consultorios}%
              · <Semaforo pct={form.meta_ocupacion_consultorios - 5} metaVerde={form.meta_ocupacion_consultorios} /> Naranja {form.meta_ocupacion_consultorios - form.semaforo_umbral_naranja}–{form.meta_ocupacion_consultorios - 1}%
              · <Semaforo pct={form.meta_ocupacion_consultorios - 20} metaVerde={form.meta_ocupacion_consultorios} /> Rojo &lt;{form.meta_ocupacion_consultorios - form.semaforo_umbral_naranja}%
            </span>
          </div>
        </div>
      </div>

      <div className="card mb-4 border-l-4 border-l-brand-600">
        <SectionHeader title="Jornada laboral semanal (Ley 2101)" />
        <div className="grid grid-cols-1 sm:grid-cols-[200px,1fr] gap-4 items-start">
          <div>
            <label className="label">Horas semanales</label>
            <div className="flex items-center gap-2">
              <input
                className="input w-24 text-center text-lg font-semibold"
                type="number"
                min="30" max="48"
                value={form.jornada_semanal_horas}
                onChange={(e) => setForm({ ...form, jornada_semanal_horas: parseInt(e.target.value) || 42 })}
              />
              <span className="text-sm text-gray-500">h / semana</span>
            </div>
          </div>
          <div className="text-xs text-gray-600 leading-relaxed bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="font-medium text-blue-900 mb-1">Calendario oficial Ley 2101:</div>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>2023 → <strong>47h</strong></li>
              <li>2024 → <strong>46h</strong></li>
              <li>2025 → <strong>44h</strong></li>
              <li>Julio 2026 → <strong>42h</strong></li>
            </ul>
            <div className="mt-2 text-blue-700">
              💡 Cambia este valor cuando la organización implemente la nueva jornada. Afecta el cálculo de horas extras de todos los recursos no oftalmólogos (los oftalmólogos siguen sin tope porque trabajan por paciente).
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <SectionHeader title="Base de cálculo de ocupación (RN-31)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Horas base lunes a viernes (minutos)</label>
            <input
              className="input"
              type="number"
              min="60" max="1440"
              value={form.base_horas_lun_vie_min}
              onChange={(e) => setForm({ ...form, base_horas_lun_vie_min: parseInt(e.target.value) || 720 })}
            />
            <div className="text-xs text-gray-500 mt-1">Por defecto 720 min (12h: 7am–7pm)</div>
          </div>
          <div>
            <label className="label">Horas base sábados (minutos)</label>
            <input
              className="input"
              type="number"
              min="0" max="600"
              value={form.base_horas_sabado_min}
              onChange={(e) => setForm({ ...form, base_horas_sabado_min: parseInt(e.target.value) || 240 })}
            />
            <div className="text-xs text-gray-500 mt-1">Por defecto 240 min (4h: 7am–11am)</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-3">
          Los domingos siempre cuentan como 0. Cambiar esta base afecta el % de ocupación que se muestra en informes — se recomienda hacerlo solo si la organización cambia su jornada operativa.
        </div>
      </div>

      {hayCambios && (
        <div className="card">
          <SectionHeader title="Guardar cambios" />
          <div>
            <label className="label">Motivo del cambio *</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Ajuste anual de metas según planeación estratégica 2027"
            />
            <div className="text-xs text-amber-700 mt-1">Quedará en el log de auditoría</div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn flex-1 justify-center" onClick={() => setForm(data)}>Descartar</button>
            <button
              className="btn-primary flex-1 justify-center"
              onClick={() => mutate()}
              disabled={!motivo || motivo.length < 5 || isPending}
            >
              {isPending ? <Spinner size="sm" /> : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Meta({ label, descripcion, value, onChange }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-500">{descripcion}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="input w-20 text-center"
          type="number"
          min="0" max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
        <span className="text-xs text-gray-500">%</span>
      </div>
    </div>
  )
}
