import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { matrizService } from '@/services/api'
import { Spinner, EmptyState } from '@/components/ui'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useDirtyClose } from '@/hooks/useDirtyClose'
import { useConfirm } from '@/contexts/ConfirmContext'
import { TIPOS_RECURSO, clsx } from '@/utils/helpers'
import { DIAS_MATRIZ, DIAS_MATRIZ_LABEL, horasDelDiaMatriz, horasPorFranja, fmtHoras } from '@/utils/matriz'

/**
 * MATRIZ DE ASIGNACIONES (nov-2026)
 * =================================
 *
 * Hector: "Malla de auxiliar queda plasmado como base en el cual se debe basar
 * la asignación que hay fijas para los aux con los profesionales". Es la hoja
 * HORARIO AUXILIARES del Excel LISTADO AUXILIARES, con el mismo maquetado: una
 * fila por auxiliar y, por día, Horario · Horas · Asignación, más el total.
 *
 * La asignación son los profesionales reales del SGRC + una nota libre para lo
 * que no es una persona (LASER, PRIORITARIA, "saca a almorzar", la sede…).
 * Por ahora es solo la malla: no alimenta al Programador.
 */

const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const etiquetaTipo = (t) => TIPOS_RECURSO.find((x) => x.value === t)?.label ?? t

// Hector: filtrar no solo por nombre, también por estado y lo demás.
const ESTADOS_MALLA = [
  ['con_malla', 'Con malla'],
  ['sin_malla', 'Sin malla'],
  ['pasa_tope', 'Pasa del tope'],
]
const FILTROS_VACIOS = { buscar: '', estado: '', dia: '', profesional: '', nombre: '', horas: '' }
const selCls = 'rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400'

export default function AssistantMatrixPage() {
  const [f, setF] = useState(FILTROS_VACIOS)
  const setFiltro = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }))
  const hayFiltros = Object.values(f).some(Boolean)
  const [editando, setEditando] = useState(null) // { auxiliar, dia }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['matriz-asignaciones'],
    queryFn: matrizService.get,
    staleTime: 0,
  })

  const auxiliares = data?.assistants ?? []
  const profesionales = data?.professionals ?? []

  // celdas[auxiliarId][dia]
  const celdas = useMemo(() => {
    const m = {}
    for (const c of data?.cells ?? []) (m[c.assistant_id] ??= {})[c.weekday] = c
    return m
  }, [data])

  const totalDe = (auxId) => DIAS_MATRIZ.reduce((s, d) => s + horasDelDiaMatriz(celdas[auxId]?.[d]?.ranges), 0)

  // Profesionales que salen en la malla (solo esos tiene sentido filtrar).
  const profEnMalla = useMemo(() => {
    const m = new Map()
    for (const c of data?.cells ?? []) for (const p of c.professionals) m.set(p.id, p.name)
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [data])

  // Busca por auxiliar, por profesional o por la nota (ej. "LASER", "FN2").
  const q = normalizar(f.buscar.trim())
  const diasFiltro = f.dia ? [f.dia] : DIAS_MATRIZ
  const filas = auxiliares
    .filter((a) => !q || normalizar(a.name).includes(q) || DIAS_MATRIZ.some((d) => {
      const c = celdas[a.id]?.[d]
      return c && (normalizar(c.note).includes(q) || c.professionals.some((p) => normalizar(p.name).includes(q)))
    }))
    .filter((a) => !f.dia || celdas[a.id]?.[f.dia])
    .filter((a) => !f.profesional || diasFiltro.some((d) => celdas[a.id]?.[d]?.professionals.some((p) => p.id === f.profesional)))
    .filter((a) => {
      if (f.estado === 'con_malla') return !!celdas[a.id]
      if (f.estado === 'sin_malla') return !celdas[a.id]
      if (f.estado === 'pasa_tope') return a.max_hours_per_week != null && totalDe(a.id) > a.max_hours_per_week
      return true
    })
  const porNombre = (a, b) => a.name.localeCompare(b.name, 'es')
  if (f.nombre) filas.sort((a, b) => (f.nombre === 'asc' ? 1 : -1) * porNombre(a, b))
  else if (f.horas) filas.sort((a, b) => (f.horas === 'asc' ? 1 : -1) * (totalDe(a.id) - totalDe(b.id)) || porNombre(a, b))
  const conMalla = auxiliares.filter((a) => celdas[a.id]).length

  return (
    <div className="p-3 sm:p-4">
      <div className="mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Matriz de asignaciones fijas</h1>
          <p className="text-xs text-gray-500">
            {auxiliares.length} auxiliares · {conMalla} con malla{hayFiltros ? ` · ${filas.length} en el filtro` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            className="input !py-2 w-full sm:w-auto sm:flex-1 sm:min-w-[220px]"
            placeholder="Buscar auxiliar, profesional o nota…"
            value={f.buscar}
            onChange={(e) => setFiltro('buscar', e.target.value)}
          />
          <select className={selCls} value={f.estado} onChange={(e) => setFiltro('estado', e.target.value)} aria-label="Estado">
            <option value="">Estado</option>
            {ESTADOS_MALLA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={selCls} value={f.dia} onChange={(e) => setFiltro('dia', e.target.value)} aria-label="Día">
            <option value="">Día</option>
            {DIAS_MATRIZ.map((d) => <option key={d} value={d}>{DIAS_MATRIZ_LABEL[d]}</option>)}
          </select>
          <select className={clsx(selCls, 'max-w-[180px]')} value={f.profesional} onChange={(e) => setFiltro('profesional', e.target.value)} aria-label="Profesional">
            <option value="">Profesional</option>
            {profEnMalla.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className={selCls} value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value, horas: '' }))} aria-label="Orden alfabético">
            <option value="">Nombre</option>
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
          <select className={selCls} value={f.horas} onChange={(e) => setF((x) => ({ ...x, horas: e.target.value, nombre: '' }))} aria-label="Total horas">
            <option value="">Horas</option>
            <option value="asc">Menos horas</option>
            <option value="desc">Más horas</option>
          </select>
          {hayFiltros && (
            <button type="button" className="text-xs font-medium text-brand-600 hover:underline px-1" onClick={() => setF(FILTROS_VACIOS)}>
              Limpiar
            </button>
          )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <EmptyState icon="⚠️" title="No se pudo cargar la Matriz" description={error?.message} />
      ) : !auxiliares.length ? (
        <EmptyState icon="👥" title="No hay auxiliares activas" description="Las auxiliares se crean en Configuración › Recursos." />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-auto max-h-[calc(100vh-215px)]">
          <table className="text-[11px] border-collapse min-w-[1500px] w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-brand-600 text-white">
                <th rowSpan={2} className="sticky left-0 z-30 bg-brand-600 px-2 py-2 text-left font-semibold w-48 border-r border-white/20">
                  Auxiliar
                </th>
                {DIAS_MATRIZ.map((d) => (
                  <th key={d} colSpan={3} className="px-2 py-1.5 font-semibold uppercase tracking-wide border-r border-white/20">
                    {DIAS_MATRIZ_LABEL[d]}
                  </th>
                ))}
                {/* Fija a la derecha: con seis días la tabla se desplaza y el total es lo que más se mira. */}
                <th rowSpan={2} className="sticky right-0 z-30 bg-brand-600 px-2 py-2 font-semibold w-16 border-l border-white/20">Total horas</th>
              </tr>
              <tr className="bg-brand-50 text-brand-800">
                {DIAS_MATRIZ.map((d) => (
                  <SubCabecera key={d} />
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => {
                const total = totalDe(a.id)
                const tope = a.max_hours_per_week
                return (
                  <tr key={a.id} className="group border-t border-gray-100 align-top">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-2 py-1.5 font-semibold text-gray-900 border-r border-gray-200">
                      {a.name}
                    </td>
                    {DIAS_MATRIZ.map((d) => (
                      <CeldaDia key={d} celda={celdas[a.id]?.[d]} onClick={() => setEditando({ auxiliar: a, dia: d })} />
                    ))}
                    <td
                      className={clsx(
                        'sticky right-0 z-10 px-2 py-1.5 text-center font-semibold tabular-nums border-l border-gray-200',
                        tope != null && total > tope ? 'text-red-600 bg-red-50' : 'text-gray-900 bg-white group-hover:bg-gray-50',
                      )}
                      title={tope != null ? `Tope ${tope}h` : undefined}
                    >
                      {total ? fmtHoras(total) : '—'}
                    </td>
                  </tr>
                )
              })}
              {!filas.length && (
                <tr><td colSpan={2 + DIAS_MATRIZ.length * 3} className="text-center text-gray-400 py-8">Ninguna auxiliar coincide con el filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditarDiaModal
          auxiliar={editando.auxiliar}
          dia={editando.dia}
          celdasAux={celdas[editando.auxiliar.id] ?? {}}
          profesionales={profesionales}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function SubCabecera() {
  return (
    <>
      <th className="px-2 py-1 font-semibold text-left w-24">Horario</th>
      <th className="px-1 py-1 font-semibold w-10">Horas</th>
      <th className="px-2 py-1 font-semibold text-left w-36 border-r border-brand-100">Asignación</th>
    </>
  )
}

/** Las tres casillas de un día. Cualquiera de las tres abre el editor. */
function CeldaDia({ celda, onClick }) {
  const base = 'px-2 py-1.5 cursor-pointer group-hover:bg-gray-50 hover:!bg-brand-50'
  if (!celda) {
    return (
      <td colSpan={3} onClick={onClick} className={clsx(base, 'text-center text-gray-300 border-r border-gray-200')}>
        —
      </td>
    )
  }
  // 11-nov · Hector: con dos horarios en el día, cada franja va en su propio
  // recuadro y sus horas al lado, a la misma altura. La asignación sigue
  // siendo una sola para el día.
  const horas = horasPorFranja(celda.ranges)
  return (
    <>
      <td onClick={onClick} className={clsx(base, 'text-gray-700 tabular-nums whitespace-nowrap')}>
        <div className="space-y-1">
          {celda.ranges.map((f) => (
            <div key={f.ini} className="h-6 flex items-center px-1.5 rounded border border-gray-200 bg-gray-50">
              {f.ini}–{f.fin}
            </div>
          ))}
        </div>
      </td>
      <td onClick={onClick} className={clsx(base, 'text-center font-semibold text-gray-900 tabular-nums')}>
        <div className="space-y-1">
          {horas.map((h, i) => <div key={i} className="h-6 flex items-center justify-center">{fmtHoras(h)}</div>)}
        </div>
      </td>
      <td onClick={onClick} className={clsx(base, 'border-r border-gray-200')}>
        {celda.professionals.map((p) => (
          <div key={p.id} className={clsx('font-medium', p.active ? 'text-gray-900' : 'text-gray-400 line-through')}>{p.name}</div>
        ))}
        {celda.note && <div className="text-gray-500">{celda.note}</div>}
      </td>
    </>
  )
}

const FRANJA_VACIA = { ini: '', fin: '' }

function EditarDiaModal({ auxiliar, dia, celdasAux, profesionales, onClose }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const actual = celdasAux[dia]

  const [form, setForm] = useState(() => ({
    franjas: actual?.ranges?.length ? actual.ranges.map((f) => ({ ...f })) : [{ ...FRANJA_VACIA }],
    profesionalIds: actual?.professionals.map((p) => p.id) ?? [],
    nota: actual?.note ?? '',
    copiarA: [],
  }))
  const { tryClose } = useDirtyClose(form, onClose)

  const set = (cambios) => setForm((f) => ({ ...f, ...cambios }))
  const setFranja = (i, campo, valor) =>
    set({ franjas: form.franjas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)) })

  // Las franjas a medio llenar no se mandan; las incompletas (solo una hora) sí
  // se avisan para que no se pierdan sin querer.
  const franjasLlenas = form.franjas.filter((f) => f.ini && f.fin)
  const incompleta = form.franjas.some((f) => (f.ini && !f.fin) || (!f.ini && f.fin))
  const horasDia = horasDelDiaMatriz(franjasLlenas)
  const horasSemana = DIAS_MATRIZ.reduce(
    (s, d) => s + (d === dia || form.copiarA.includes(d) ? horasDia : horasDelDiaMatriz(celdasAux[d]?.ranges)),
    0,
  )
  const tope = auxiliar.max_hours_per_week

  const opcionesProf = profesionales
    .filter((p) => !form.profesionalIds.includes(p.id))
    .map((p) => ({ id: p.id, label: p.name, sublabel: [etiquetaTipo(p.type), p.specialty].filter(Boolean).join(' · ') }))
  const porId = Object.fromEntries(profesionales.map((p) => [p.id, p]))
  // Un profesional ya inactivo sigue saliendo si estaba en la malla.
  for (const p of actual?.professionals ?? []) porId[p.id] ??= p

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: async (vaciar) => {
      const datos = vaciar
        ? { ranges: [], professional_ids: [], note: '' }
        : { ranges: franjasLlenas, professional_ids: form.profesionalIds, note: form.nota }
      // Uno por uno: si un día falla, los anteriores ya quedaron y se dice cuál.
      for (const d of [dia, ...(vaciar ? [] : form.copiarA)]) {
        try {
          await matrizService.guardarDia(auxiliar.id, d, datos)
        } catch (e) {
          throw new Error(`${DIAS_MATRIZ_LABEL[d]}: ${e?.message ?? 'no se pudo guardar'}`)
        }
      }
      return vaciar
    },
    onSuccess: (vaciar) => {
      qc.invalidateQueries({ queryKey: ['matriz-asignaciones'] })
      toast.success(vaciar ? 'Día vaciado' : form.copiarA.length ? `Guardado en ${1 + form.copiarA.length} días` : 'Guardado')
      onClose()
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['matriz-asignaciones'] })
      toast.error(e?.message ?? 'No se pudo guardar')
    },
  })

  const pedirVaciar = async () => {
    const ok = await confirm({
      title: `¿Vaciar el ${DIAS_MATRIZ_LABEL[dia].toLowerCase()} de ${auxiliar.name}?`,
      message: 'Se borran el horario, los profesionales y la nota de ese día.',
      confirmLabel: 'Vaciar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (ok) guardar(true)
  }

  const pisaOtros = form.copiarA.filter((d) => celdasAux[d])

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Editar malla</h2>
            <p className="text-xs text-gray-500 truncate">{auxiliar.name} · {DIAS_MATRIZ_LABEL[dia]}</p>
          </div>
          <button onClick={tryClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Horario</label>
            <div className="space-y-2">
              {form.franjas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" className="input" value={f.ini} onChange={(e) => setFranja(i, 'ini', e.target.value)} />
                  <span className="text-gray-400 text-xs">a</span>
                  <input type="time" className="input" value={f.fin} onChange={(e) => setFranja(i, 'fin', e.target.value)} />
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600 px-1 text-lg leading-none"
                    title="Quitar franja"
                    onClick={() => set({ franjas: form.franjas.length > 1 ? form.franjas.filter((_, j) => j !== i) : [{ ...FRANJA_VACIA }] })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              {form.franjas.length < 4 ? (
                <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => set({ franjas: [...form.franjas, { ...FRANJA_VACIA }] })}>
                  + Agregar franja
                </button>
              ) : <span />}
              <span className="text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{fmtHoras(horasDia)}h</span> este día
                {' · '}
                <span className={clsx('font-semibold', tope != null && horasSemana > tope ? 'text-red-600' : 'text-gray-900')}>
                  {fmtHoras(horasSemana)}h
                </span>
                {tope != null ? ` de ${tope}h` : ''} en la semana
              </span>
            </div>
            {incompleta && <p className="text-xs text-red-600 mt-1">Hay una franja con una sola hora.</p>}
          </div>

          <div>
            <label className="label">Profesionales</label>
            <SearchableSelect
              value={null}
              onChange={(id) => id && set({ profesionalIds: [...form.profesionalIds, id] })}
              options={opcionesProf}
              placeholder="Agregar profesional…"
            />
            {form.profesionalIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.profesionalIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-100 text-brand-800 text-xs px-2 py-0.5">
                    {porId[id]?.name ?? 'Profesional'}
                    <button
                      type="button"
                      className="text-brand-400 hover:text-red-600 leading-none"
                      onClick={() => set({ profesionalIds: form.profesionalIds.filter((x) => x !== id) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Nota</label>
            <input
              className="input"
              maxLength={500}
              value={form.nota}
              onChange={(e) => set({ nota: e.target.value })}
              placeholder="Ej: LASER, CATARATA FN2, saca a almorzar"
            />
          </div>

          <div>
            <label className="label">Copiar también a</label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_MATRIZ.filter((d) => d !== dia).map((d) => {
                const on = form.copiarA.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set({ copiarA: on ? form.copiarA.filter((x) => x !== d) : [...form.copiarA, d] })}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {DIAS_MATRIZ_LABEL[d].slice(0, 3)}
                  </button>
                )
              })}
            </div>
            {pisaOtros.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Reemplaza lo que ya hay el {pisaOtros.map((d) => DIAS_MATRIZ_LABEL[d].toLowerCase()).join(', ')}.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          {actual && (
            <button className="btn-danger" onClick={pedirVaciar} disabled={isPending}>Vaciar día</button>
          )}
          <button className="btn flex-1 justify-center" onClick={tryClose} disabled={isPending}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={() => guardar(false)} disabled={isPending || incompleta}>
            {isPending ? <Spinner size="sm" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
