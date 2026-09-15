import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usuarioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar, Spinner, SectionHeader, Badge } from '@/components/ui'
import { ROLES } from '@/utils/helpers'

// Tipos de recurso que firman el formato F-AA-126. Solo estos ven la sección
// "Mi firma" en el perfil — al resto no le sirve subir una firma.
const TIPOS_CON_FIRMA = new Set(['oftalmologo', 'optometra', 'anestesiologo', 'otorrino', 'fonoaudiologa'])
// Límite razonable para el archivo original (antes de base64). La firma se
// vuelve MEDIUMTEXT y no queremos payloads gigantes en cada carga del PDF.
const MAX_FIRMA_BYTES = 1_500_000  // ~1.5 MB de imagen → ~2 MB en base64

export default function PerfilPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [email, setEmail] = useState(user?.email ?? '')
  const [celular, setCelular] = useState(user?.phone ?? '')
  const [editando, setEditando] = useState(false)
  // Firma: nuevaFirma es un data URL preview que aún no se envió al servidor.
  const [nuevaFirma, setNuevaFirma] = useState(null)

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => usuarioService.actualizarPerfil({ email, phone: celular }),
    onSuccess: () => {
      toast.success('Datos actualizados. Si cambiaste el correo, te llegará un email de verificación.')
      setEditando(false)
    },
    onError: (err) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const muestraFirma = TIPOS_CON_FIRMA.has(user?.type)

  const { data: firmaActual, isLoading: cargandoFirma } = useQuery({
    queryKey: ['mi-firma'],
    queryFn: () => usuarioService.getMiFirma(),
    enabled: muestraFirma,
    staleTime: 60 * 1000,
  })

  const { mutate: guardarFirma, isPending: guardandoFirma } = useMutation({
    mutationFn: (dataUrl) => usuarioService.actualizarMiFirma(dataUrl),
    onSuccess: (_res, dataUrl) => {
      toast.success(dataUrl ? 'Firma actualizada. Aparecerá en tu próximo formato F-AA-126.' : 'Firma eliminada.')
      setNuevaFirma(null)
      qc.invalidateQueries({ queryKey: ['mi-firma'] })
    },
    onError: (err) => toast.error(err?.message ?? 'No se pudo guardar la firma'),
  })

  const onArchivoFirma = (file) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('La firma debe ser PNG o JPG.')
      return
    }
    if (file.size > MAX_FIRMA_BYTES) {
      toast.error(`Archivo demasiado grande (máx ${Math.round(MAX_FIRMA_BYTES / 1024)} KB).`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setNuevaFirma(reader.result)
    reader.onerror = () => toast.error('No se pudo leer el archivo.')
    reader.readAsDataURL(file)
  }

  const rolInfo = ROLES[user?.role]

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Mi perfil</h1>
        <p className="text-xs text-gray-500">Actualiza tus datos de contacto para recibir notificaciones</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
          <Avatar nombre={user?.name} size="lg" color="blue" />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{user?.name}</div>
            <Badge variant={rolInfo?.color ?? 'gray'} className="mt-1">{rolInfo?.label ?? user?.role}</Badge>
          </div>
          {!editando && (
            <button className="btn" onClick={() => setEditando(true)}>Editar</button>
          )}
        </div>

        <SectionHeader title="Datos de contacto" />
        <div className="space-y-4">
          <div>
            <label className="label">Correo electrónico</label>
            {editando ? (
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <div className="text-sm text-gray-700">{user?.email}</div>
            )}
            {editando && (
              <div className="text-xs text-amber-700 mt-1">
                ⚠️ Cambiar el correo requiere verificación al nuevo correo antes de ser efectivo.
              </div>
            )}
          </div>

          <div>
            <label className="label">Celular (WhatsApp)</label>
            {editando ? (
              <input className="input" type="tel" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="300 555 1234" />
            ) : (
              <div className="text-sm text-gray-700">{user?.phone ?? <span className="text-gray-300">Sin registrar</span>}</div>
            )}
            {editando && (
              <div className="text-xs text-gray-500 mt-1">
                Este número recibirá las alertas de cambios en tu horario y confirmaciones.
              </div>
            )}
          </div>
        </div>

        {editando && (
          <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
            <button className="btn flex-1 justify-center" onClick={() => { setEditando(false); setEmail(user?.email); setCelular(user?.phone) }}>
              Cancelar
            </button>
            <button className="btn-primary flex-1 justify-center" onClick={() => guardar()} disabled={isPending}>
              {isPending ? <Spinner size="sm" /> : 'Guardar cambios'}
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <SectionHeader title="Información de cuenta" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-gray-400">Tipo de recurso</div>
              <div className="text-gray-700 capitalize">{user?.type ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Especialidad</div>
              <div className="text-gray-700">{user?.specialty ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Sede(s) asignada(s)</div>
              <div className="text-gray-700">{user?.site_names?.join(', ') ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400">Horas máx. semana</div>
              <div className="text-gray-700">{user?.max_hours_per_week ?? '—'}h</div>
            </div>
          </div>
        </div>

        {muestraFirma && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <SectionHeader title="Mi firma" />
            <p className="text-xs text-gray-500 mb-3">
              Esta firma aparece en tu formato F-AA-126 (Continuidad del servicio) cuando registrás una ausencia.
              Subí una imagen PNG o JPG de tu firma escaneada — máx {Math.round(MAX_FIRMA_BYTES / 1024)} KB.
            </p>
            {cargandoFirma ? (
              <div className="py-4 flex justify-center"><Spinner size="sm" /></div>
            ) : (
              <div className="space-y-3">
                {(nuevaFirma || firmaActual?.signatureUrl) ? (
                  <div className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="text-[11px] text-gray-400 mb-2">
                      {nuevaFirma ? 'Vista previa (sin guardar)' : 'Firma actual'}
                    </div>
                    <img
                      src={nuevaFirma ?? firmaActual.signatureUrl}
                      alt="Firma"
                      className="max-h-24 mx-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-xs text-gray-400 bg-gray-50">
                    Aún no tenés firma cargada — tu formato F-AA-126 va a salir con el nombre en texto.
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="btn flex-1 justify-center cursor-pointer">
                    📎 {firmaActual?.hasSignature || nuevaFirma ? 'Reemplazar firma' : 'Subir firma'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => onArchivoFirma(e.target.files?.[0])}
                    />
                  </label>
                  {nuevaFirma && (
                    <button
                      className="btn-primary flex-1 justify-center"
                      onClick={() => guardarFirma(nuevaFirma)}
                      disabled={guardandoFirma}
                    >
                      {guardandoFirma ? <Spinner size="sm" /> : '✅ Guardar firma'}
                    </button>
                  )}
                  {nuevaFirma && (
                    <button
                      className="btn flex-1 justify-center"
                      onClick={() => setNuevaFirma(null)}
                      disabled={guardandoFirma}
                    >
                      Descartar
                    </button>
                  )}
                  {!nuevaFirma && firmaActual?.hasSignature && (
                    <button
                      className="btn-danger sm:flex-none justify-center"
                      onClick={() => {
                        if (window.confirm('¿Eliminar tu firma? El próximo F-AA-126 saldrá con el nombre en texto.')) {
                          guardarFirma(null)
                        }
                      }}
                      disabled={guardandoFirma}
                      title="Eliminar la firma cargada"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <SectionHeader title="Seguridad" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm text-gray-700">Contraseña</div>
              <div className="text-xs text-gray-400 mt-0.5">Cámbiala periódicamente para mantener tu cuenta segura.</div>
            </div>
            <button
              className="btn"
              onClick={() => navigate('/cambiar-password')}
            >
              🔑 Cambiar contraseña
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            Todos los cambios quedan registrados en el log de auditoría con tu usuario y fecha.
          </div>
        </div>
      </div>
    </div>
  )
}
