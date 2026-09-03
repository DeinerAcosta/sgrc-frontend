import { useState, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { usuarioService, sedeService } from '@/services/api'
import { Spinner } from '@/components/ui'
import { useDirtyClose } from '@/hooks/useDirtyClose'

/**
 * Carga masiva de usuarios (supervisor). Acepta:
 *   1) Filas agregadas manualmente con "+ Agregar fila"
 *   2) Pegar un CSV/Excel completo en el textarea (un usuario por línea)
 *
 * El textarea reconoce columnas separadas por TAB (lo que sale al copiar de
 * Excel) o por coma. Encabezados aceptados:
 *   nombre, email, celular, rol, tipo, especialidad, sedes
 *
 * 'sedes' = nombres separados por '|' (ej. "Sede 1 Barranquilla|Sede Cartagena").
 *
 * Al enviar el backend crea cada usuario con contraseña provisional y le manda
 * email. Devuelve resultados por fila para mostrar cuáles quedaron bien.
 */

const ROLES = ['recurso', 'coordinador', 'directivo']
const TIPOS = ['oftalmologo', 'optometra', 'anestesiologo', 'asesor_servicios', 'auxiliar', 'tecnico']

// Normaliza un valor humano (con tildes, mayúsculas, espacios) al slug del enum.
// "Oftalmólogo" → "oftalmologo", "Asesor de Servicios" → "asesor_servicios",
// "Coordinador" → "coordinador", etc.
function slugificar(v) {
  return (v ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remueve tildes
    .replace(/\s+/g, '_')                              // espacios → _
    .replace(/[^a-z0-9_]/g, '')                        // limpia otros caracteres
}

const ROLES_SLUG = new Set(ROLES)
const TIPOS_SLUG = new Set(TIPOS)

// Mapeo de aliases comunes para evitar errores de slugificación.
const ALIAS_ROL = { resource: 'recurso', coordinador: 'coordinador', directivo: 'directivo' }
const ALIAS_TIPO = {
  oftalmologo: 'oftalmologo', oftalmologa: 'oftalmologo',
  optometra: 'optometra', optometro: 'optometra',
  anestesiologo: 'anestesiologo', anestesiologa: 'anestesiologo',
  asesor_de_servicios: 'asesor_servicios', asesor_servicios: 'asesor_servicios', asesor: 'asesor_servicios',
  assistant: 'auxiliar',
  tecnico: 'tecnico', tecnica: 'tecnico',
}

function normalizarRol(v) {
  const s = slugificar(v)
  return ALIAS_ROL[s] || (ROLES_SLUG.has(s) ? s : v) // si no matchea, conserva tal cual y deja que el backend de error
}
function normalizarTipo(v) {
  if (!v) return ''
  const s = slugificar(v)
  return ALIAS_TIPO[s] || (TIPOS_SLUG.has(s) ? s : v)
}

const FILA_VACIA = { name: '', email: '', phone: '', role: 'recurso', type: '', specialty: '', sites: '' }

// Mapeo flexible: cada encabezado del CSV se identifica por palabras clave para
// soportar las columnas que genera Google Forms ("¿Cuál es tu rol?", "¿En qué
// sede(s) trabajas?", "Marca temporal", etc.) además del CSV manual.
function mapearColumna(header) {
  const h = (header ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (h.includes('nombre')) return 'nombre'
  if (h.includes('correo') || h.includes('email')) return 'email'
  if (h.includes('celular') || h.includes('whatsapp') || h.includes('telefono') || h.includes('teléfono')) return 'celular'
  if (h.includes('rol')) return 'rol'
  if (h.includes('tipo')) return 'tipo'
  if (h.includes('especial')) return 'especialidad'
  if (h.includes('sede')) return 'sedes' // todas las columnas con "sede" se fusionan en sedes
  return null // ignorar columnas desconocidas: marca temporal, puntuación, etc.
}

// Divide una línea CSV respetando comillas: una celda entre comillas conserva
// las comas internas (Google Forms multi-select genera "Sede A, Sede B").
// Soporta el escape estándar de comilla doble: "" → ".
function splitCsvLine(line, sep) {
  const out = []
  let cur = ''
  let dentro = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (dentro && line[i + 1] === '"') { cur += '"'; i++ }
      else dentro = !dentro
    } else if (ch === sep && !dentro) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCSV(texto, sedesNombres) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lineas.length === 0) return []
  // Detectar separador: tab tiene preferencia (excel paste)
  const sep = lineas[0].includes('\t') ? '\t' : ','
  // ¿La primera fila es encabezado?
  const primera = lineas[0].toLowerCase()
  const tieneHeader = ['nombre', 'email', 'correo', 'rol', 'marca temporal'].some((h) => primera.includes(h))
  const headersRaw = tieneHeader
    ? splitCsvLine(lineas[0], sep)
    : ['nombre', 'email', 'celular', 'rol', 'tipo', 'especialidad', 'sedes']
  const filas = (tieneHeader ? lineas.slice(1) : lineas).map((l) => {
    const cols = splitCsvLine(l, sep)
    const fila = { ...FILA_VACIA }
    const sedesCombinadas = []
    headersRaw.forEach((h, i) => {
      const campo = mapearColumna(h)
      if (!campo) return
      const val = cols[i] ?? ''
      if (campo === 'sedes') {
        if (val) sedesCombinadas.push(val)
      } else {
        fila[campo] = val
      }
    })
    fila.sites = sedesCombinadas.join(',')
    // Normalizar rol y tipo a los slugs que espera el backend
    fila.role = normalizarRol(fila.role) || 'recurso'
    fila.type = normalizarTipo(fila.type)
    return fila
  })
  void sedesNombres // reservado para resaltar sedes no encontradas en vivo
  return filas
}

export default function BulkUsuariosModal({ onClose, onSaved }) {
  const [filas, setFilas] = useState([{ ...FILA_VACIA }])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [csvTexto, setCsvTexto] = useState('')
  const [resultado, setResultado] = useState(null)
  const { tryClose } = useDirtyClose(filas, onClose)

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-bulk'],
    queryFn: () => sedeService.list(),
  })
  const sedesNombres = useMemo(() => sedes.map((s) => s.name), [sedes])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = filas
        .filter((f) => f.name.trim() && f.email.trim())
        .map((f) => ({
          name: f.name.trim(),
          email: f.email.trim().toLowerCase(),
          phone: f.phone?.trim() || undefined,
          role: f.role,
          resourceType: f.role === 'recurso' ? (f.type || undefined) : undefined,
          specialty: f.role === 'recurso' && f.specialty ? f.specialty.trim() : undefined,
          // Sedes separadas por |, ; o , — Google Forms (multi-select) usa comas dentro de la celda.
          sites: f.sites ? f.sites.split(/[|;,]/).map((s) => s.trim()).filter(Boolean) : undefined,
        }))
      return usuarioService.bulkCreate(payload)
    },
    onSuccess: (res) => {
      const d = res?.data ?? res
      setResultado(d)
      toast.success(`Creados: ${d?.totals?.ok ?? 0} · Fallidos: ${d?.totals?.failed ?? 0}`)
      if ((d?.totals?.failed ?? 0) === 0) {
        setTimeout(() => { onSaved?.(); }, 1500)
      }
    },
    onError: (err) => toast.error(err?.message ?? 'Error al cargar'),
  })

  const procesarPaste = () => {
    const nuevas = parseCSV(csvTexto, sedesNombres)
    if (nuevas.length === 0) { toast.error('No detecté filas — revisa el formato'); return }
    setFilas(nuevas)
    setPasteOpen(false)
    setCsvTexto('')
    toast.success(`${nuevas.length} fila(s) parseadas`)
  }

  const validas = filas.filter((f) => f.name.trim() && /^\S+@\S+\.\S+$/.test(f.email)).length
  const setFila = (i, patch) => setFilas((ff) => ff.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Crear usuarios en lote</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cada usuario recibe por email una contraseña provisional y deberá cambiarla al primer ingreso.
            </p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {resultado ? (
          // ── Vista de resultados después de enviar ──
          <div className="overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="kpi-card"><div className="text-2xl font-semibold text-gray-900">{resultado.totals.total}</div><div className="text-xs text-gray-500">Procesados</div></div>
              <div className="kpi-card"><div className="text-2xl font-semibold text-green-600">{resultado.totals.ok}</div><div className="text-xs text-gray-500">Creados con éxito</div></div>
              <div className="kpi-card"><div className="text-2xl font-semibold text-red-600">{resultado.totals.failed}</div><div className="text-xs text-gray-500">Fallidos</div></div>
            </div>
            <div className="text-xs text-gray-500 mb-2">
              {resultado.totals.ok > 0 && 'Los emails con la contraseña provisional ya fueron enviados (revisa la consola del backend si SMTP no está configurado).'}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-gray-500">
                <tr><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-left">Detalle</th></tr>
              </thead>
              <tbody>
                {resultado.results.map((r, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{r.email}</td>
                    <td className="px-3 py-1.5">{r.ok ? <span className="text-green-700">✓ Creado</span> : <span className="text-red-600">✗ {r.error}</span>}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {r.ok && r.sites_not_found && r.sites_not_found.length > 0 && (
                        <span className="text-amber-700">Sedes no encontradas: {r.sites_not_found.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1 justify-center" onClick={onSaved}>Cerrar y refrescar lista</button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 flex flex-wrap items-center gap-2 bg-gray-50">
              <button className="btn text-xs" onClick={() => setFilas((ff) => [...ff, { ...FILA_VACIA }])}>+ Agregar fila</button>
              <button className="btn text-xs" onClick={() => setPasteOpen(!pasteOpen)}>📋 Pegar desde Excel/CSV</button>
              <label className="btn text-xs cursor-pointer">
                📁 Subir archivo CSV
                <input
                  type="file"
                  accept=".csv,text/csv,.tsv,text/tab-separated-values,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      const text = String(ev.target?.result ?? '')
                      const nuevas = parseCSV(text, sedesNombres)
                      if (nuevas.length === 0) toast.error('No detecté filas en el archivo')
                      else { setFilas(nuevas); toast.success(`${nuevas.length} fila(s) cargadas desde ${file.name}`) }
                    }
                    reader.readAsText(file, 'utf-8')
                    e.target.value = '' // permite re-subir el mismo archivo
                  }}
                />
              </label>
              <div className="ml-auto text-xs text-gray-500">
                {validas} de {filas.length} fila(s) con datos válidos
              </div>
            </div>

            {pasteOpen && (
              <div className="px-5 py-3 border-b border-gray-100 bg-blue-50 flex-shrink-0">
                <div className="text-xs text-blue-900 mb-1.5">
                  Pega el contenido de tu Excel (con o sin encabezado). Columnas esperadas: <strong>nombre · email · celular · rol · tipo · especialidad · sedes</strong>. Las sedes pueden ir separadas por <code>|</code>.
                </div>
                <textarea
                  className="input resize-none text-xs font-mono"
                  rows={5}
                  value={csvTexto}
                  onChange={(e) => setCsvTexto(e.target.value)}
                  placeholder="nombre	email	celular	rol	tipo	especialidad	sedes&#10;Juan Pérez	juan@cofca.co	3001112233	recurso	oftalmologo	Retina	Sede 1 Barranquilla&#10;María Gómez	maria@cofca.co	3014445566	coordinador			Sede Cartagena"
                />
                <div className="flex gap-2 mt-2">
                  <button className="btn text-xs" onClick={() => { setCsvTexto(''); setPasteOpen(false) }}>Cancelar</button>
                  <button className="btn-primary text-xs" onClick={procesarPaste} disabled={!csvTexto.trim()}>Procesar {csvTexto.split('\n').filter((l) => l.trim()).length} línea(s)</button>
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1 px-5 py-4">
              <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-44">Nombre *</th>
                    <th className="px-2 py-2 text-left w-56">Email *</th>
                    <th className="px-2 py-2 text-left w-32">Celular</th>
                    <th className="px-2 py-2 text-left w-32">Rol *</th>
                    <th className="px-2 py-2 text-left w-32">Tipo (si recurso)</th>
                    <th className="px-2 py-2 text-left">Especialidad</th>
                    <th className="px-2 py-2 text-left w-44">Sede(s)</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const emailOk = !f.email || /^\S+@\S+\.\S+$/.test(f.email)
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-1 py-1"><input className="input text-xs py-1" value={f.name} onChange={(e) => setFila(i, { name: e.target.value })} placeholder="Nombre y apellidos" /></td>
                        <td className="px-1 py-1"><input className={`input text-xs py-1 ${!emailOk ? 'border-red-300' : ''}`} type="email" value={f.email} onChange={(e) => setFila(i, { email: e.target.value })} placeholder="correo@cofca.co" /></td>
                        <td className="px-1 py-1"><input className="input text-xs py-1" value={f.phone} onChange={(e) => setFila(i, { phone: e.target.value })} placeholder="300..." /></td>
                        <td className="px-1 py-1">
                          <select className="input text-xs py-1" value={f.role} onChange={(e) => setFila(i, { role: e.target.value })}>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <select className="input text-xs py-1" value={f.type} onChange={(e) => setFila(i, { type: e.target.value })} disabled={f.role !== 'recurso'}>
                            <option value="">—</option>
                            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1"><input className="input text-xs py-1" value={f.specialty} onChange={(e) => setFila(i, { specialty: e.target.value })} placeholder="Retina, Glaucoma..." disabled={f.role !== 'recurso'} /></td>
                        <td className="px-1 py-1"><input className="input text-xs py-1" value={f.sites} onChange={(e) => setFila(i, { sites: e.target.value })} placeholder="Sede 1 BQ|Sede Cartagena" title="Nombres separados por |" /></td>
                        <td className="px-1 py-1 text-center">
                          {filas.length > 1 && (
                            <button className="text-red-400 hover:text-red-600" onClick={() => setFilas((ff) => ff.filter((_, idx) => idx !== i))} title="Quitar">×</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <div className="mt-3 text-xs text-gray-400">
                Sedes válidas en el sistema: {sedesNombres.length === 0 ? '—' : sedesNombres.join(', ')}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 flex-shrink-0">
              <button className="btn flex-1 justify-center" onClick={tryClose}>Cancelar</button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={() => mutate()}
                disabled={validas === 0 || isPending}
              >
                {isPending ? <Spinner size="sm" /> : `Crear ${validas} usuario(s) y enviar contraseñas`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
