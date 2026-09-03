import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, format,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ausenciaService, festivoService } from '@/services/api'
import { parseFechaLocal, DIAS_LABEL } from '@/utils/helpers'
import { useSedeActiva } from '@/hooks/useActiveSite'
import { Badge } from '@/components/ui'

// ============================================================================
// Cronograma de ausencias (ago-2026)
//
// Vista calendario mensual con las ausencias del equipo (o de la sede activa
// para supervisor/gerencia). Pintadas por FAMILIA del motivo — mismos 5 grupos
// del tablero FOCA que usa el catálogo de motivos.
//
// Roles: coordinador (su sede), supervisor y gerencia (todas las sedes vía
// selector). El backend GET /ausencias ya acepta desde/hasta/familia y el hook
// useSedeActiva expone el <Selector /> reusable.
//
// UX principal:
//   - Header con navegación de mes (◀ Hoy ▶) + selector de sede
//   - Chips de filtro por familia (multi-toggle)
//   - Chips de filtro por estado (pendiente / confirmada)
//   - Grid 7×N donde N es la cantidad de semanas del mes (5 o 6)
//   - Cada celda muestra festivos (badge iris.blue) + pills de ausencias
//   - Click en pill → panel de detalle inline abajo del calendario
// ============================================================================

const FAMILIAS = [
  { value: 'ausencia_profesional',     label: 'Ausencia profesional',     dot: 'bg-red-500',    pill: 'bg-red-50 text-red-800 border-red-200' },
  { value: 'reprogramacion_operativa', label: 'Reprogramación operativa', dot: 'bg-blue-500',   pill: 'bg-blue-50 text-blue-800 border-blue-200' },
  { value: 'ajuste_cupos',             label: 'Ajuste de cupos',          dot: 'bg-green-500',  pill: 'bg-green-50 text-green-800 border-green-200' },
  { value: 'movilidad_regional',       label: 'Movilidad / Regional',     dot: 'bg-amber-500',  pill: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'calendario_festivo',       label: 'Calendario / Festivo',     dot: 'bg-slate-500',  pill: 'bg-slate-100 text-slate-800 border-slate-200' },
  { value: 'otros',                    label: 'Otros',                    dot: 'bg-gray-400',   pill: 'bg-gray-50 text-gray-700 border-gray-200' },
]
const FAMILIA_MAP = Object.fromEntries(FAMILIAS.map((f) => [f.value, f]))

const ESTADOS = [
  { value: 'pendiente',  label: 'Pendientes',  dot: 'bg-amber-400' },
  { value: 'confirmada', label: 'Confirmadas', dot: 'bg-emerald-500' },
]

const ISO = (d) => format(d, 'yyyy-MM-dd')

export default function AusenciasCronogramaPage() {
  const { siteId: sedeId, sedeNombre, Selector } = useSedeActiva()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const [familiasSel, setFamiliasSel] = useState(new Set())  // vacía = todas
  const [estadosSel, setEstadosSel]   = useState(new Set(['pendiente', 'confirmada']))
  const [seleccionada, setSeleccionada] = useState(null)
  const detalleRef = useRef(null)

  // Escape cierra el detalle abierto.
  useEffect(() => {
    if (!seleccionada) return
    const onKey = (e) => { if (e.key === 'Escape') setSeleccionada(null) }
    window.addEventListener('keydown', onKey)
    // Autoscroll suave al detalle (evita que quede fuera de viewport en laptops
    // con calendarios grandes — feedback claro tras el click en un pill).
    requestAnimationFrame(() => {
      detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => window.removeEventListener('keydown', onKey)
  }, [seleccionada])

  // Grid: primer día visible = domingo de la semana del día 1; último = sábado
  // de la semana del último día. Usa weekStartsOn=0 (domingo), alineado a la
  // convención del sistema (semana operativa dom→sáb, RN ago-2026).
  const inicio = useMemo(() => startOfWeek(mes, { weekStartsOn: 0 }), [mes])
  const fin    = useMemo(() => endOfWeek(endOfMonth(mes), { weekStartsOn: 0 }), [mes])
  const dias   = useMemo(() => eachDayOfInterval({ start: inicio, end: fin }), [inicio, fin])

  const desdeISO = ISO(inicio)
  const hastaISO = ISO(fin)

  // Ausencias del rango visible. Backend hace la intersección [start_date..end_date] ∩ [desde..hasta].
  // `sedeId || 'todas'` (no ??): sedeManual puede ser '' (string vacía) mientras
  //   se resuelve la primera sede — quiero que caiga al sentinel 'todas'.
  // `placeholderData: keepPreviousData`: en react-query v5 la opción top-level
  //   keepPreviousData fue removida — se usa placeholderData con el helper.
  const { data: ausencias = [], isLoading, isFetching } = useQuery({
    queryKey: ['ausencias-cronograma', sedeId || 'todas', desdeISO, hastaISO],
    queryFn: () => ausenciaService.list({
      ...(sedeId ? { site_id: sedeId } : {}),
      desde: desdeISO,
      hasta: hastaISO,
    }),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const { data: festivos = [] } = useQuery({
    queryKey: ['festivos-cronograma', desdeISO, hastaISO],
    queryFn: () => festivoService.list({ desde: desdeISO, hasta: hastaISO }),
    staleTime: 10 * 60 * 1000,
  })

  // Índice: fecha ISO → lista de ausencias que tocan ese día (y que pasan filtros)
  const porDia = useMemo(() => {
    const m = new Map()
    const familiasActivas = familiasSel.size === 0 ? null : familiasSel  // null = todas
    for (const a of ausencias) {
      const familia = a.reason_ref?.family ?? 'ausencia_profesional'
      if (familiasActivas && !familiasActivas.has(familia)) continue
      if (!estadosSel.has(a.status)) continue
      const ini = parseFechaLocal(a.start_date)
      const finF = parseFechaLocal(a.end_date ?? a.start_date)
      if (!ini || !finF) continue
      const cur = new Date(ini)
      while (cur <= finF) {
        const key = ISO(cur)
        if (!m.has(key)) m.set(key, [])
        m.get(key).push(a)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return m
  }, [ausencias, familiasSel, estadosSel])

  const festivosMap = useMemo(() => {
    const m = new Map()
    for (const f of festivos) m.set((f.date ?? '').slice(0, 10), f)
    return m
  }, [festivos])

  // Contadores del mes visible (para el header)
  const totalMes = useMemo(() => {
    const seen = new Set()
    for (const [, arr] of porDia) for (const a of arr) seen.add(a.id)
    return seen.size
  }, [porDia])

  const toggleFamilia = (v) => {
    setFamiliasSel((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v); else next.add(v)
      return next
    })
  }
  const toggleEstado = (v) => {
    setEstadosSel((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v); else next.add(v)
      return next
    })
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* ===================== HEADER ===================== */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">🗓️ Cronograma de ausencias</h1>
          <p className="text-xs text-gray-500">
            Vista mensual de las ausencias {sedeNombre ? <>de <strong>{sedeNombre}</strong></> : 'de todas las sedes'}
            {isFetching && <span className="ml-2 text-brand-600">actualizando…</span>}
          </p>
        </div>
        <Selector className="md:min-w-[280px]" />
      </div>

      {/* ===================== BARRA MES ===================== */}
      <div className="card p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <button
              className="btn text-sm"
              onClick={() => setMes((m) => subMonths(m, 1))}
              aria-label="Mes anterior"
            >
              ◀ Anterior
            </button>
            <button
              className="btn text-sm"
              onClick={() => setMes(startOfMonth(new Date()))}
              aria-label="Ir al mes actual"
            >
              Hoy
            </button>
            <button
              className="btn text-sm"
              onClick={() => setMes((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
            >
              Siguiente ▶
            </button>
            <div className="ml-3 text-sm font-semibold text-gray-900 capitalize">
              {format(mes, 'LLLL yyyy', { locale: es })}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            <strong className="text-gray-900">{totalMes}</strong> ausencia{totalMes === 1 ? '' : 's'} en la vista
          </div>
        </div>

        {/* Filtros */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1">Familia:</span>
          <ChipToggle
            active={familiasSel.size === 0}
            onClick={() => setFamiliasSel(new Set())}
            label="Todas"
          />
          {FAMILIAS.map((f) => (
            <ChipToggle
              key={f.value}
              active={familiasSel.has(f.value)}
              onClick={() => toggleFamilia(f.value)}
              label={f.label}
              dot={f.dot}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1">Estado:</span>
          {ESTADOS.map((e) => (
            <ChipToggle
              key={e.value}
              active={estadosSel.has(e.value)}
              onClick={() => toggleEstado(e.value)}
              label={e.label}
              dot={e.dot}
            />
          ))}
        </div>
      </div>

      {/* ===================== CALENDARIO ===================== */}
      {/* En mobile <sm el grid necesita min-w para no aplastar celdas a ~40px
          (verify Fase 2). Se muestra con scroll horizontal dentro del card;
          en sm+ el grid ocupa el 100% sin scroll. */}
      <div className="card p-0 overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header días */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            {['Dom', ...DIAS_LABEL.slice(0, 6)].map((d) => (
              <div key={d} className="px-2 py-2 text-center">{d}</div>
            ))}
          </div>

          {/* Grid del mes. Se renderizan celdas siempre — durante isLoading las
              pills quedan vacías; el spinner del header basta como indicador. */}
          <div className={[
            'grid grid-cols-7 transition-opacity',
            !isLoading && isFetching ? 'opacity-70 pointer-events-none' : '',
          ].join(' ')}>
            {dias.map((d) => {
              const iso = ISO(d)
              const list = isLoading ? [] : (porDia.get(iso) ?? [])
              const fest = festivosMap.get(iso)
              const enMes = isSameMonth(d, mes)
              const hoy = isToday(d)
              return (
                <div
                  key={iso}
                  role="gridcell"
                  className={[
                    'min-h-[92px] sm:min-h-[110px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 relative',
                    enMes ? 'bg-white' : 'bg-gray-50/50',
                    hoy ? 'ring-2 ring-brand-600 ring-inset z-[1]' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={[
                      'text-[11px] font-semibold shrink-0',
                      enMes ? 'text-gray-800' : 'text-gray-300',
                      hoy ? 'text-brand-800' : '',
                    ].join(' ')}>
                      {format(d, 'd')}
                    </span>
                    {fest && (
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-iris-blue/20 text-brand-800 border border-brand-100 truncate min-w-0"
                        title={fest.name ?? 'Festivo'}
                        aria-label={`Festivo: ${fest.name ?? ''}`}
                      >
                        Festivo
                      </span>
                    )}
                  </div>

                  {list.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      {list.slice(0, 3).map((a) => (
                        <AusenciaPill
                          key={a.id + iso}
                          ausencia={a}
                          onClick={() => setSeleccionada(a)}
                        />
                      ))}
                      {list.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setSeleccionada({ __multi: true, day: iso, items: list })}
                          className="text-[10px] text-gray-500 hover:text-brand-800 text-left"
                        >
                          + {list.length - 3} más…
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===================== LEYENDA ===================== */}
      <div className="card p-3">
        <div className="text-[11px] text-gray-500 mb-1.5">Leyenda de colores por familia:</div>
        <div className="flex flex-wrap gap-2">
          {FAMILIAS.map((f) => (
            <div key={f.value} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs ${f.pill}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${f.dot}`} />
              {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* ===================== DETALLE ===================== */}
      {seleccionada && (
        <div ref={detalleRef}>
          <DetalleAusencia
            data={seleccionada}
            porDia={porDia}
            onClose={() => setSeleccionada(null)}
            onPickOne={(a) => setSeleccionada(a)}
            onSeeDay={(dia, items) => setSeleccionada({ __multi: true, day: dia, items })}
          />
        </div>
      )}

      {!isLoading && totalMes === 0 && (
        <div className="text-xs text-gray-500 text-center py-2">
          Sin ausencias que coincidan con los filtros para este mes.
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-componentes
// ============================================================================

function ChipToggle({ active, onClick, label, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'text-[11px] px-2 py-0.5 rounded-full border transition inline-flex items-center gap-1',
        active
          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
      ].join(' ')}
    >
      {dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot} ${active ? 'ring-1 ring-white/60' : ''}`} />}
      {label}
    </button>
  )
}

function AusenciaPill({ absence: ausencia, onClick }) {
  const familia = ausencia.reason_ref?.family ?? 'ausencia_profesional'
  const f = FAMILIA_MAP[familia] ?? FAMILIA_MAP.otros
  const nombre = ausencia.resource?.name ?? 'Recurso'
  const short = nombre.split(' ').slice(0, 2).join(' ')
  const motivoTxt = ausencia.reason_ref?.name ?? ausencia.type
  const aria = `${nombre}, ${motivoTxt}, ${ausencia.status}`
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${nombre} · ${motivoTxt}${ausencia.status === 'pendiente' ? ' · pendiente' : ''}`}
      aria-label={aria}
      className={[
        'text-[10px] leading-tight px-1.5 py-0.5 rounded border text-left flex items-center gap-1 min-w-0 w-full',
        f.pill,
        ausencia.status === 'pendiente' ? 'opacity-90 border-dashed' : '',
      ].join(' ')}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${f.dot} shrink-0`} />
      <span className="truncate min-w-0">{short}</span>
    </button>
  )
}

function DetalleAusencia({ data, porDia, onClose, onPickOne, onSeeDay }) {
  // Múltiples ausencias en el mismo día
  if (data?.__multi) {
    return (
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900">
            Ausencias del día {format(parseFechaLocal(data.day), "d 'de' LLLL", { locale: es })}
            <span className="ml-2 text-gray-400 text-xs">({data.items.length})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >×</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPickOne(a)}
              className="text-left border border-gray-200 rounded-lg px-3 py-2 hover:border-brand-400 hover:bg-brand-50/40 transition"
            >
              <div className="font-medium text-sm text-gray-900">{a.resource?.name ?? '—'}</div>
              <div className="text-xs text-gray-500">{a.reason_ref?.name ?? a.type}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const a = data
  const familia = a.reason_ref?.family ?? 'ausencia_profesional'
  const f = FAMILIA_MAP[familia] ?? FAMILIA_MAP.otros
  const ini = parseFechaLocal(a.start_date)
  const fin = parseFechaLocal(a.end_date ?? a.start_date)
  const periodo = ini && fin && isSameDay(ini, fin)
    ? format(ini, "EEEE d 'de' LLLL, yyyy", { locale: es })
    : `${format(ini, "d 'de' LLL", { locale: es })} — ${format(fin, "d 'de' LLL, yyyy", { locale: es })}`

  // "Ver otras del día" — si el mismo día tiene más ausencias, ofrecemos volver
  // a la vista multi para no obligar a scroll+re-click en la celda.
  const otrasDelDia = (() => {
    if (!a.start_date || !porDia) return null
    const items = porDia.get(a.start_date.slice(0, 10)) ?? []
    const otros = items.filter((x) => x.id !== a.id)
    return otros.length > 0 ? otros : null
  })()

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{a.resource?.name ?? '—'}</span>
            <span className="text-xs text-gray-500">· {a.resource?.type}</span>
            <Badge variant={a.status === 'confirmada' ? 'green' : a.status === 'pendiente' ? 'amber' : 'gray'}>
              {a.status}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-gray-600">
            {periodo}
            {a.is_partial && a.absence_start_time && (
              <span className="ml-2">· {a.absence_start_time} – {a.absence_end_time}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="text-gray-400 hover:text-gray-700 text-lg leading-none"
        >×</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <Kv k="Motivo" v={a.reason_ref?.name ?? a.type} />
        <Kv k="Familia" v={<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${f.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />{f.label}</span>} />
        {a.regional_city && <Kv k="Ciudad regional" v={a.regional_city} />}
        <Kv k="Anticipación" v={`${a.notice_days ?? 0} días`} />
        <Kv k="Programada" v={a.is_planned ? 'Sí' : 'No (imprevista)'} />
        {a.patients_affected != null && <Kv k="Pacientes impactados" v={a.patients_affected} />}
        {a.opportunity_cost != null && (
          <Kv k="Costo oportunidad" v={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(a.opportunity_cost))} />
        )}
        {a.reason && <Kv k="Observación" v={a.reason} />}
      </div>

      {otrasDelDia && (
        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onSeeDay(a.start_date.slice(0, 10), [a, ...otrasDelDia])}
            className="text-xs text-brand-800 hover:underline"
          >
            ← Ver las otras {otrasDelDia.length} ausencia{otrasDelDia.length === 1 ? '' : 's'} de este día
          </button>
        </div>
      )}
    </div>
  )
}

function Kv({ k, v }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{k}</div>
      <div className="text-gray-800">{v}</div>
    </div>
  )
}
