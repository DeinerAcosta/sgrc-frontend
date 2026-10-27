import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, Line, ComposedChart, PieChart, Pie, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from 'recharts'
import { format, startOfMonth, startOfYear, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { informeService, sedeService } from '@/services/api'
import { Spinner, EmptyState } from '@/components/ui'
import { TIPOS_RECURSO, TIPOS_AUSENCIA, parseFechaLocal } from '@/utils/helpers'
import focaLogo from '@/assets/brand/foca-azul.png'

// ============================================================================
// Fase 4 (sep-2026 · rediseño FOCA) — Dashboard Reprogramaciones
//
// Look inspirado en el tablero gerencial de FOCA: encabezado con logo, chip de
// gestion, segmentacion por mes con botones, 4 tabs, KPI cards grandes con
// numeros de colores, tarjetas de "Hallazgos que exigen decision" narrativas.
// TODOS los datos vienen del backend (endpoint /reprogramaciones-dashboard).
// ============================================================================

// 23-oct · Hector: colores de los gráficos como los del logo FOCA (marino,
// azul del iris y verde menta). Los tonos de las series se ajustaron para que
// se distingan entre sí (también con daltonismo) y se lean sobre blanco:
// validados con el validador de paletas (todas las pruebas pasan).
const FOCA = {
  marino: '#1B2A6C',   // barras de una sola serie
  azul:   '#3651B0',   // "sin reponer" y lo pendiente
  iris:   '#4F95E8',   // segunda serie / resaltado
  menta:  '#2E9C7C',   // "repuestas" y lo favorable
  claro:  '#8FB5DA',   // meses no elegidos en la tendencia
}

// 27-oct · PROYECTOS-3799 · UN SOLO MAPA DE COLORES. Cada categoría tiene su
// color en un único lugar y todos los gráficos, KPI y hallazgos lo leen de
// aquí: "pacientes" es marino y "repuestas" menta en cualquier diagrama.
const COLOR_SERIE = {
  pacientes: FOCA.marino,   // pacientes afectados / impactados
  eventos:   FOCA.iris,     // nº de reprogramaciones (eventos)
  otrosMeses: FOCA.claro,   // meses no elegidos en la tendencia
  profesionales: FOCA.marino,
}
const COLOR_COBERTURA = {
  repuestas:   FOCA.menta,  // con turno nuevo / repuestas
  sinReponer:  FOCA.azul,   // sin reponer / sin cobertura / pendiente
}
// Un color por tipo de profesional. Además de azul, menta e iris del logo
// hacían falta dos (ciruela y ocre): los cinco pasan el validador de paletas
// por pares (banda de luz, croma, daltonismo y contraste sobre blanco).
const COLOR_TIPO = {
  oftalmologo:   FOCA.azul,
  optometra:     FOCA.menta,
  anestesiologo: FOCA.iris,
  otorrino:      '#9B4F9E',  // ciruela
  fonoaudiologa: '#B8860B',  // ocre
}
const colorTipo = (t) => COLOR_TIPO[t] ?? FOCA.claro
// Franjas ordenadas: el color oscurece con la demora; menta es lo favorable.
const COLOR_ANTELACION = {
  retroactivo:       FOCA.marino,
  uno_a_siete:       FOCA.azul,
  ocho_a_diecinueve: FOCA.iris,
  veinte_o_mas:      FOCA.menta,   // programada (20+ días)
}
const COLOR_SLA = {
  adelantada:     FOCA.menta,
  mismo_dia:      FOCA.claro,
  uno_a_siete:    FOCA.iris,
  ocho_a_treinta: FOCA.azul,
  mas_30:         FOCA.marino,
}

const FAMILIAS = [
  { value: 'reprogramacion_operativa', label: 'Reprogramación operativa', color: FOCA.azul },
  { value: 'ausencia_profesional',     label: 'Ausencia profesional',     color: FOCA.marino },
  { value: 'ajuste_cupos',             label: 'Ajuste de cupos',          color: FOCA.claro },
  { value: 'movilidad_regional',       label: 'Movilidad / Regional',     color: FOCA.iris },
  { value: 'calendario_festivo',       label: 'Calendario / Festivo',     color: FOCA.menta },
  { value: 'otros',                    label: 'Otros',                    color: '#94a3b8' },
]
const FAMILIA_COLOR = Object.fromEntries(FAMILIAS.map((f) => [f.value, f.color]))

const TIPO_LABEL = Object.fromEntries(TIPOS_RECURSO.map((t) => [t.value, t.label]))

const TABS = [
  { key: 'resumen',    label: 'Resumen ejecutivo' },
  { key: 'medicos',    label: 'Profesionales' },
  { key: 'reposicion', label: 'Reposición & cobertura' },
  { key: 'causas',     label: 'Causas & especialidades' },
  { key: 'reprogramadores', label: 'Gestión de reprogramadores' },
]

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_ES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const fmtNum = (n) => Number(n ?? 0).toLocaleString('es-CO')

// Rango: desde 1-ene del anio actual hasta hoy — "año calendario en curso".
// Cambia el mes con los botones de la segmentacion.
function rangoAnio() {
  const hoy = new Date()
  return {
    desde: format(startOfYear(hoy), 'yyyy-MM-dd'),
    hasta: format(hoy, 'yyyy-MM-dd'),
  }
}

// Header FOCA (estilo tablero gerencial: logo + titulo grande serif + chips)
// 22-oct · QA (F6): tomaba la primera palabra y salía solo "Dr.".
// 23-oct · Hector: primer nombre y primer apellido ("Ana Milena Escudero
// Brito" → "Ana Escudero"). Con cuatro palabras o más el primer apellido es la
// penúltima ("Jimmy de Jesus Mencias Mercado" → "Jimmy Mencias"); con tres,
// la segunda ("Melina Patiño Ruiz" → "Melina Patiño"). El título se conserva.
const nombreCorto = (nombre) => {
  if (!nombre) return '—'
  const p = nombre.trim().split(/\s+/)
  const titulo = /^(dr|dra|tec|téc|lic)\.?$/i.test(p[0]) ? p.shift() + ' ' : ''
  if (p.length <= 2) return titulo + p.join(' ')
  const apellido = p.length >= 4 ? p[p.length - 2] : p[1]
  return `${titulo}${p[0]} ${apellido}`
}

function HeaderFOCA({ rango, totalEventos, totalPacientes }) {
  const gestion = useMemo(() => {
    // 22-oct · QA (F5): new Date('2026-01-01') es medianoche UTC = 31-dic en
    // Colombia, y el encabezado decía "Dic–Oct". Se lee como fecha local.
    const d = parseFechaLocal(rango.desde)
    const h = parseFechaLocal(rango.hasta)
    return `${MESES_ES_ABREV[d.getMonth()]}–${MESES_ES_ABREV[h.getMonth()]} ${h.getFullYear()}`
  }, [rango])
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
      <div className="w-16 h-16 bg-white border border-gray-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
        <img src={focaLogo} alt="FOCA" className="h-10 w-auto object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-widest uppercase text-brand-600 font-semibold">Central de citas</div>
        <div className="text-xl sm:text-2xl font-semibold text-gray-900 leading-tight">Reprogramación de agendas de profesionales</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700">
          Gestión: <strong className="text-gray-900">{gestion}</strong>
        </div>
        <div className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: `${FOCA.claro}55`, color: FOCA.marino }}>
          {fmtNum(totalEventos)} eventos · {fmtNum(totalPacientes)} pac.
        </div>
      </div>
    </div>
  )
}

// Segmentacion por mes: "Todos" o un mes especifico del anio en curso.
function BannerSegmentacion({ mesActivo, setMesActivo, onRefresh }) {
  const hoy = new Date()
  const mesesDisponibles = Array.from({ length: hoy.getMonth() + 1 }, (_, i) => i)
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold shrink-0">
        Segmentación de tiempo
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5">
        <button
          onClick={() => setMesActivo(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mesActivo === null ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}
        >Todos</button>
        {mesesDisponibles.map((m) => (
          <button
            key={m}
            onClick={() => setMesActivo(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mesActivo === m ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >{MESES_ES[m]}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="hidden sm:inline">
          Mes de gestión · <strong className="text-gray-800">{mesActivo === null ? 'Todos los meses' : MESES_ES[mesActivo]}</strong>
        </span>
        <button onClick={onRefresh} className="btn text-xs py-1 px-3">↻ Actualizar</button>
      </div>
    </div>
  )
}

// 27-oct · Los motivos se muestran por su nombre y un mismo motivo puede
// llegar dos veces (con y sin el motivo del catálogo enlazado): se suman por
// nombre. Lo usan la gráfica de motivos y el hallazgo "Causa raíz".
// 23-oct · Las ausencias sin motivo del catálogo llegan con el código del
// tipo ("licencia_no_remunerada"): se muestra su nombre.
const nombreMotivo = (m) => TIPOS_AUSENCIA.find((t) => t.value === (m.name ?? m.code))?.label ?? m.name ?? m.code ?? ''
function motivosAgrupados(topMotivos = []) {
  const porNombre = new Map()
  for (const m of topMotivos) {
    const n = nombreMotivo(m)
    const name = n.charAt(0).toUpperCase() + n.slice(1)
    porNombre.set(name, (porNombre.get(name) ?? 0) + (m.count ?? 0))
  }
  return [...porNombre].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count)
}

const sumar = (filas, campo) => filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0)

// 27-oct · PROYECTOS-3799 · Leyenda armada con los datos de cada gráfico:
// nombre de la serie, su color y su total en el período. Solo salen las
// categorías con datos (antes eran textos fijos tipo "Verde = repuestos").
//   items: [{ key, label, color, value, forma?: 'barra' | 'linea', detalle? }]
function Leyenda({ items, unidad = '' }) {
  const visibles = (items ?? []).filter((i) => (Number(i.value) || 0) > 0)
  if (!visibles.length) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600">
      {visibles.map((i) => (
        <span key={i.key ?? i.label} className="inline-flex items-center gap-1.5">
          {i.forma === 'linea'
            ? <span className="w-3.5 h-0.5 rounded-full" style={{ background: i.color }} />
            : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />}
          <span className="text-gray-800">{i.label}</span>
          <span className="tabular-nums text-gray-500">· {i.detalle ?? `${fmtNum(i.value)}${unidad}`}</span>
        </span>
      ))}
    </div>
  )
}

// Leyenda de las barras pintadas por tipo de profesional: los tipos que
// aparecen en la gráfica, con la suma de `campo` de cada uno.
function itemsPorTipo(filas, campo, unidad = '') {
  const tot = new Map()
  for (const f of filas) tot.set(f.type, (tot.get(f.type) ?? 0) + (Number(f[campo]) || 0))
  return [...tot].sort((a, b) => b[1] - a[1])
    .map(([t, v]) => ({ key: t, label: TIPO_LABEL[t] ?? t, color: colorTipo(t), value: v, detalle: `${fmtNum(v)}${unidad}` }))
}

// KPI grande estilo FOCA (numero enorme de color, label pequeno arriba).
// 27-oct · `color` es un color de la paleta (hex), no una clase de Tailwind.
function KpiFoca({ label, value, color = FOCA.marino, sub, big = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
      <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold">{label}</div>
      <div className={`font-semibold ${big ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'} leading-none mt-2`} style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
    </div>
  )
}

// Panel con titulo serif + descripcion en gris + contenido.
function Panel({ eyebrow, title, description, children }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="text-[10px] tracking-widest uppercase text-brand-600 font-semibold">{eyebrow}</div>}
      <h2 className="font-semibold text-xl sm:text-2xl text-gray-900 mt-1">{title}</h2>
      {description && <p className="text-xs text-gray-600 mt-1 max-w-3xl">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

// Tarjeta de hallazgo gerencial.
// 27-oct · El borde y la etiqueta llevan el color de la categoría de la que
// habla el hallazgo (pacientes, repuestas, sin reponer…), el mismo de las
// gráficas. Antes eran rojo/ámbar/azul/verde fuera de la paleta.
function HallazgoCard({ eyebrow, title, body, color = FOCA.marino }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 border-l-4 p-3" style={{ borderLeftColor: color }}>
      <div className="text-[10px] tracking-widest uppercase font-semibold" style={{ color }}>{eyebrow}</div>
      <div className="font-semibold text-sm text-gray-900 mt-1">{title}</div>
      <div className="text-xs text-gray-600 mt-1 leading-relaxed">{body}</div>
    </div>
  )
}

// Tarjeta chart (fondo blanco, header + contenido)
function ChartCard({ title, description, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base sm:text-lg text-gray-900">{title}</h3>
          {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function ReprogramacionesPage() {
  const [tab, setTab] = useState('resumen')
  const [mesActivo, setMesActivo] = useState(null)  // null = todos, 0..11 = mes
  const [sedesSel] = useState([])
  const [familiasSel] = useState([])
  const [tiposSel] = useState([])

  // Rango efectivo: anio en curso, opcionalmente filtrado a un mes.
  const rango = useMemo(() => {
    const base = rangoAnio()
    if (mesActivo === null) return base
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), mesActivo, 1)
    const hasta = endOfMonth(desde)
    return {
      desde: format(desde, 'yyyy-MM-dd'),
      hasta: format(hasta, 'yyyy-MM-dd'),
    }
  }, [mesActivo])

  useQuery({
    queryKey: ['sedes-reprog'],
    queryFn: () => sedeService.list(),
    staleTime: 10 * 60 * 1000,
  })

  const params = useMemo(() => {
    const p = { desde: rango.desde, hasta: rango.hasta }
    if (sedesSel.length) p.site_id = sedesSel.join(',')
    if (familiasSel.length) p.family = familiasSel.join(',')
    if (tiposSel.length) p.resource_type = tiposSel.join(',')
    return p
  }, [rango, sedesSel, familiasSel, tiposSel])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reprogramaciones-dashboard', params],
    queryFn: () => informeService.reprogramacionesDashboard(params),
    keepPreviousData: true,
    staleTime: 60 * 1000,
  })

  // 23-oct · La tendencia muestra siempre los meses del año (sale de la
  // consulta de "Todos", que ya está en caché), con el mes elegido resaltado.
  // Antes, al elegir un mes, la gráfica quedaba con una sola barra.
  const paramsAnio = useMemo(() => ({ ...params, ...rangoAnio() }), [params])
  const { data: dataAnio } = useQuery({
    queryKey: ['reprogramaciones-dashboard', paramsAnio],
    queryFn: () => informeService.reprogramacionesDashboard(paramsAnio),
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Spinner /></div>
  }
  if (!data) {
    return <div className="p-4"><EmptyState title="Sin datos" description="Aún no hay reprogramaciones registradas en el rango seleccionado." /></div>
  }

  const k = data.kpis ?? {}
  const totalEventos = k.total_ausencias ?? 0
  const totalPac = k.patients_affected ?? 0

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto" style={{ background: '#eef1f7', minHeight: '100vh' }}>
      <HeaderFOCA rango={rango} totalEventos={totalEventos} totalPacientes={totalPac} />

      <BannerSegmentacion
        mesActivo={mesActivo}
        setMesActivo={setMesActivo}
        onRefresh={() => refetch()}
      />

      {/* Tabs — botones grandes estilo FOCA */}
      <div className="bg-white rounded-xl border border-gray-100 p-1.5 mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'resumen'    && (
        <TabResumen
          data={data}
          porMesAnio={dataAnio?.por_mes ?? data.por_mes ?? []}
          mesActivo={mesActivo}
          setMesActivo={setMesActivo}
        />
      )}
      {tab === 'medicos'    && <TabMedicos data={data} />}
      {tab === 'reposicion' && <TabReposicion data={data} />}
      {tab === 'causas'     && <TabCausas data={data} />}
      {tab === 'reprogramadores' && <TabReprogramadores rango={rango} />}

      <div className="border-t border-gray-200 mt-8 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-gray-500">
        <div>
          Fuente: <strong>SGRC — tabla ausencias</strong> · datos en vivo del sistema, actualizados cada 60 s.
        </div>
        <div>Tablero analítico · uso interno gerencial · FOCA Fundación</div>
      </div>
    </div>
  )
}

// =============================================================================
// TAB · Gestión de reprogramadores (PROYECTOS-3398 §6.1 · 3660)
// Por cada persona a la que la líder le repartió casos en el período: cuántos
// lleva, cuántos pacientes quedaron con turno nuevo y cuántos por llamada, y
// cómo van sus llamadas. El período cuenta por la fecha en que se le asignó.
// =============================================================================
function TabReprogramadores({ rango }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gestion-reprogramadores', rango.desde, rango.hasta],
    queryFn: () => informeService.gestionReprogramadores({ desde: rango.desde, hasta: rango.hasta }),
    staleTime: 60 * 1000,
  })
  if (isLoading) return <div className="p-8 flex justify-center"><Spinner /></div>
  const filas = data?.reprogramadores ?? []
  const t = data?.totales
  if (!filas.length || !t) {
    return <EmptyState title="Sin casos repartidos" description="En este período no se le asignó ningún caso a un reprogramador." />
  }
  const COLS = [
    ['casos', 'Casos'], ['llamando', 'Llamando'], ['terminados', 'Terminados'],
    ['pacientes', 'Pacientes'], ['con_turno_nuevo', 'Con turno nuevo'], ['por_llamada', 'Por llamada'],
    ['llamados', 'Llamados'], ['contestaron', 'Contestaron'], ['no_contestaron', 'No contestaron'], ['por_llamar', 'Por llamar'],
  ]
  return (
    <>
      <Panel eyebrow="Gestión · Reprogramadores" title="Casos y llamadas por reprogramador">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 27-oct · Colores de la paleta: turno nuevo = repuestas (menta),
              lo pendiente = sin reponer (azul). */}
          <KpiFoca label="Casos repartidos" value={fmtNum(t.casos)} color={COLOR_SERIE.eventos} sub={`${fmtNum(t.terminados)} terminados · ${t.pct_terminados}%`} />
          <KpiFoca label="Pacientes con turno nuevo" value={fmtNum(t.con_turno_nuevo)} color={COLOR_COBERTURA.repuestas} sub={`de ${fmtNum(t.pacientes)} pacientes`} />
          <KpiFoca label="Contestaron" value={`${t.pct_contestaron}%`} color={COLOR_SERIE.pacientes} sub={`${fmtNum(t.contestaron)} de ${fmtNum(t.llamados)} llamados`} />
          <KpiFoca label="Por llamar" value={fmtNum(t.por_llamar)} color={COLOR_COBERTURA.sinReponer} sub={`${fmtNum(t.no_contestaron)} no contestaron`} />
        </div>
      </Panel>

      <div className="bg-white rounded-xl border border-gray-100 overflow-auto mb-6">
        {/* 26-oct · Hector: que la tabla quepa completa. Los títulos largos
            bajan a dos líneas y los números van a la derecha. */}
        <table className="w-full text-xs border-separate border-spacing-0 min-w-[760px]">
          <thead>
            <tr>
              {['Reprogramador', ...COLS.map(([, l]) => l), '% contestaron'].map((c, i) => (
                <th key={c} className={`sticky top-0 bg-brand-800 text-white font-semibold px-2 py-2 leading-tight align-bottom ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...filas, t].map((f) => (
              <tr key={f.id ?? 'total'} className={f.id ? 'hover:bg-gray-50' : 'bg-gray-50 font-semibold'}>
                <td className="px-2 py-2 border-b border-gray-100 text-gray-900 whitespace-nowrap">{f.nombre}</td>
                {COLS.map(([k]) => (
                  <td key={k} className="px-2 py-2 border-b border-gray-100 text-gray-700 tabular-nums text-right">{fmtNum(f[k])}</td>
                ))}
                <td className="px-2 py-2 border-b border-gray-100 text-gray-700 tabular-nums text-right">{f.pct_contestaron}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// =============================================================================
// TAB 1 — Resumen ejecutivo
// =============================================================================
function TabResumen({ data, porMesAnio, mesActivo, setMesActivo }) {
  const k = data.kpis ?? {}
  const totalEventos = k.total_ausencias ?? 0
  const totalPac = k.patients_affected ?? 0
  const tasaRep = k.tasa_reposicion_pct ?? 0
  const sinCobertura = data.pacientes_sin_cobertura ?? 0
  const cubiertos = data.pacientes_cubiertos ?? 0
  const medicos = data.medicos_involucrados ?? 0
  const pctAntel = data.pct_antelacion_ok ?? 0
  // 23-oct · Hector pidió también el de menos de 20 días (imprevistas): son
  // las demás franjas de la misma antelación que usa el de 20+.
  const ant = data.antelacion_reporte ?? {}
  const avisadasMenos20 = (ant.retroactivo ?? 0) + (ant.uno_a_siete ?? 0) + (ant.ocho_a_diecinueve ?? 0)
  const pctMenos20 = totalEventos > 0 ? Math.round((avisadasMenos20 / totalEventos) * 1000) / 10 : 0
  const pctSinRep = 100 - tasaRep
  const promPorEvento = totalEventos > 0 ? (totalPac / totalEventos).toFixed(1) : '0'
  // Oct-2026 · Promedio real de días de anticipación (lo calcula el servidor).
  // Antes se estimaba con los rangos de la gráfica, y estaba mal alimentado.
  const mediaAntel = data.antelacion_promedio ?? 0

  const dataPorMes = porMesAnio.map((m) => ({
    indice: Number(m.mes.slice(5, 7)) - 1,
    mes: MESES_ES_ABREV[Number(m.mes.slice(5, 7)) - 1] ?? m.mes,
    pacientes: m.pacientes,
    eventos: m.count,
  }))
  // 27-oct · Leyenda de la tendencia con los datos: con un mes elegido, sus
  // pacientes y los del resto de meses van aparte (son dos colores).
  const pacTotal = sumar(dataPorMes, 'pacientes')
  const pacMes = mesActivo === null ? pacTotal : sumar(dataPorMes.filter((d) => d.indice === mesActivo), 'pacientes')
  const leyendaTendencia = [
    {
      key: 'pac',
      label: mesActivo === null ? 'Pacientes' : `Pacientes de ${MESES_ES[mesActivo].toLowerCase()}`,
      color: COLOR_SERIE.pacientes,
      value: pacMes,
    },
    { key: 'otros', label: 'Pacientes de otros meses', color: COLOR_SERIE.otrosMeses, value: mesActivo === null ? 0 : pacTotal - pacMes },
    { key: 'ev', label: 'Reprogramaciones', color: COLOR_SERIE.eventos, value: sumar(dataPorMes, 'eventos'), forma: 'linea' },
  ]

  // Oct-2026 · Repuesta = todos sus pacientes con turno nuevo (turnos que la
  // cubren o reposición aprobada). Antes solo contaba reposiciones del médico.
  const repuestasCount = k.repuestas ?? 0
  const sinReponerCount = Math.max(0, totalEventos - repuestasCount)
  // 27-oct · La leyenda del círculo sale de estos mismos datos y solo
  // muestra las categorías que tienen algo.
  const donutData = [
    { key: 'rep', name: 'Repuestas', value: cubiertos, color: COLOR_COBERTURA.repuestas, eventos: repuestasCount, pct: tasaRep },
    { key: 'sin', name: 'Sin reponer', value: sinCobertura, color: COLOR_COBERTURA.sinReponer, eventos: sinReponerCount, pct: pctSinRep },
  ].filter((d) => d.value > 0 || d.eventos > 0)

  // 27-oct · PROYECTOS-3799 · Concentración sobre el 10% (la calcula el servidor).
  const conc = data.concentracion ?? {}

  // 27-oct · Causa raíz: el motivo más frecuente del período. Antes hablaba
  // de "reprogramaciones operativas", una familia que ya no se usa.
  const motivoTop = motivosAgrupados(data.top_motivos)[0]
  const pctMotivoTop = totalEventos > 0 && motivoTop ? Math.round((motivoTop.count / totalEventos) * 100) : 0

  return (
    <>
      <Panel
        eyebrow="Visión general"
        title="Pulso de la reprogramación de agendas"
        description="Reprogramaciones gestionadas en el rango seleccionado y su impacto en pacientes, cobertura y comportamiento operativo. Usa la segmentación superior para aislar un mes."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <KpiFoca label="Reprogramaciones" value={fmtNum(totalEventos)} color={COLOR_SERIE.eventos} sub="En la selección" />
          <KpiFoca label="Pacientes impactados" value={fmtNum(totalPac)} color={COLOR_SERIE.pacientes} sub={`${promPorEvento} por evento`} />
          <KpiFoca label="Tasa de reposición" value={`${tasaRep}%`} color={COLOR_COBERTURA.repuestas} sub={`${pctSinRep}% no se repuso`} />
          <KpiFoca label="Pacientes sin cobertura" value={fmtNum(sinCobertura)} color={COLOR_COBERTURA.sinReponer} sub="Sin turno nuevo" />
          <KpiFoca label="Profesionales involucrados" value={fmtNum(medicos)} color={COLOR_SERIE.profesionales} sub="Personas distintas" />
          <KpiFoca label="Aviso +20 días" value={`${pctAntel}%`} color={COLOR_ANTELACION.veinte_o_mas} sub={`Promedio ${mediaAntel} ${mediaAntel === 1 ? 'día' : 'días'}`} />
          <KpiFoca label="Aviso -20 días" value={`${pctMenos20}%`} color={COLOR_ANTELACION.uno_a_siete} sub={`${fmtNum(avisadasMenos20)} de ${fmtNum(totalEventos)} · imprevistas`} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ChartCard
          title="Tendencia mensual de reprogramaciones"
          description="Por mes de gestión"
          right={<span className="text-[10px] text-gray-400">{mesActivo === null ? 'clic en un mes para filtrar' : 'clic de nuevo para ver todos'}</span>}
        >
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={dataPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar
                  yAxisId="left" dataKey="pacientes" barSize={38} radius={[4, 4, 0, 0]} name="Pacientes"
                  cursor="pointer"
                  onClick={(d) => setMesActivo(d?.indice === mesActivo ? null : d?.indice ?? null)}
                >
                  {dataPorMes.map((d) => (
                    <Cell key={d.indice} fill={mesActivo === null || d.indice === mesActivo ? COLOR_SERIE.pacientes : COLOR_SERIE.otrosMeses} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="eventos" stroke={COLOR_SERIE.eventos} strokeWidth={2.5} dot={{ r: 4 }} name="Reprogramaciones" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={leyendaTendencia} />
        </ChartCard>

        <ChartCard
          title="¿Se repuso la agenda?"
          description="Repuestas vs. no repuestas (en la selección)"
        >
          {/* 23-oct · Hector: el círculo centrado en la tarjeta (con la misma
              altura que la tendencia de al lado). */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6" style={{ minHeight: 260 }}>
            <div style={{ width: 190, height: 190 }} className="shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} dataKey="value" innerRadius={58} outerRadius={88} paddingAngle={donutData.filter((d) => d.value > 0).length > 1 ? 2 : 0} stroke="none">
                    {donutData.map((d) => <Cell key={d.key} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtNum(v) + ' pac.'} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs space-y-3">
              {donutData.map((d) => (
                <div key={d.key}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    <strong className="text-gray-900">{fmtNum(d.eventos)} {d.name.toLowerCase()}</strong>
                  </div>
                  <div className="text-[11px] text-gray-500 ml-4">
                    {d.pct}% · {fmtNum(d.value)} pac.
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      <Panel
        eyebrow="Lectura gerencial"
        title="Hallazgos que exigen decisión"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <HallazgoCard
            color={COLOR_COBERTURA.sinReponer}
            eyebrow="Brecha crítica"
            title={`${Math.round((pctSinRep * 3) / 100)} de cada 3 agendas no se reponen`}
            body={`${fmtNum(sinReponerCount)} de ${fmtNum(totalEventos)} reprogramaciones quedaron sin reposición, dejando ${fmtNum(sinCobertura)} pacientes sin reagenda registrada.`}
          />
          {/* 27-oct · PROYECTOS-3799 · el mismo número de la pestaña Profesionales. */}
          <HallazgoCard
            color={COLOR_SERIE.pacientes}
            eyebrow="Concentración"
            title={`El ${conc.pct_profesionales ?? 10}% de los profesionales genera el ${conc.pct_impacto ?? 0}% de los pacientes`}
            body={`Son ${fmtNum(conc.n ?? 0)} de ${fmtNum(conc.total_profesionales ?? 0)} profesionales (los de más pacientes afectados): ${fmtNum(conc.pacientes_top ?? 0)} de ${fmtNum(conc.total_pacientes ?? totalPac)} pacientes impactados.`}
          />
          <HallazgoCard
            color={COLOR_SERIE.eventos}
            eyebrow="Causa raíz"
            title={motivoTop ? `Predomina: ${motivoTop.name}` : 'Sin motivos en la selección'}
            body={motivoTop
              ? `Es el motivo más frecuente: ${fmtNum(motivoTop.count)} de ${fmtNum(totalEventos)} reprogramaciones (${pctMotivoTop}% del total).`
              : 'No hay reprogramaciones con motivo en el período.'}
          />
          <HallazgoCard
            color={pctAntel >= 50 ? COLOR_ANTELACION.veinte_o_mas : COLOR_ANTELACION.uno_a_siete}
            eyebrow="Antelación"
            title={pctAntel >= 50 ? 'La mayoría avisa a tiempo' : 'La mayoría avisa tarde'}
            body={`El ${pctAntel}% de las ausencias se avisó con 20 días o más (programadas); en promedio, ${mediaAntel} días antes.`}
          />
          <HallazgoCard
            color={COLOR_SERIE.pacientes}
            eyebrow="Pacientes"
            title="Impacto por evento"
            body={`Cada reprogramación afecta en promedio ${promPorEvento} pacientes en esta selección.`}
          />
          <HallazgoCard
            color={COLOR_COBERTURA.repuestas}
            eyebrow="Cobertura"
            title="Pacientes cubiertos"
            body={`${fmtNum(cubiertos)} pacientes ya tienen turno nuevo frente a ${fmtNum(sinCobertura)} sin cobertura.`}
          />
        </div>
      </Panel>
    </>
  )
}

// =============================================================================
// TAB 2 — Médicos
// =============================================================================
function TabMedicos({ data }) {
  const rec = data.por_recurso ?? []
  const totalPac = data.kpis?.patients_affected ?? 0
  const conc = data.concentracion ?? {}
  // 27-oct · Ordenados por pacientes afectados, como la concentración: el
  // líder de impacto es el de más pacientes (antes, el primero por días).
  const porPac = [...rec].sort((a, b) => (b.pacientes ?? 0) - (a.pacientes ?? 0))
  const lider = porPac[0]
  const pctRepone = (r) => (r?.count > 0 ? Math.round((r.approved_makeups / r.count) * 100) : 0)
  const pctPacLider = totalPac > 0 ? Math.round(((lider?.pacientes ?? 0) / totalPac) * 1000) / 10 : 0
  const totalProf = data.medicos_involucrados ?? 0
  const promPorProf = totalProf > 0 ? (totalPac / totalProf).toFixed(1) : '0'

  // Mejor reposicion: el que tenga mayor approved / count (min 3 eventos)
  const mejorRep = [...rec].filter((r) => (r.count ?? 0) >= 3)
    .map((r) => ({ ...r, ratio: r.count > 0 ? r.approved_makeups / r.count : 0 }))
    .sort((a, b) => b.ratio - a.ratio)[0]

  // Top 12 por pacientes
  const top12 = porPac.slice(0, 12).reverse()
    .map((r) => ({ ...r, name: nombreCorto(r.name), sinReponer: Math.max(0, (r.count ?? 0) - (r.approved_makeups ?? 0)) }))
  const leyendaRep = [
    { key: 'rep', label: 'Repuestas', color: COLOR_COBERTURA.repuestas, value: sumar(top12, 'approved_makeups') },
    { key: 'sin', label: 'Sin reponer', color: COLOR_COBERTURA.sinReponer, value: sumar(top12, 'sinReponer') },
  ]

  return (
    <>
      <Panel
        eyebrow="Profundización · Profesionales"
        title="Concentración y reposición por profesional"
        description="Quién genera el mayor impacto en pacientes y qué tan frecuentemente repone su agenda."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 27-oct · PROYECTOS-3799 · Concentración sobre el 10% (servidor). */}
          <KpiFoca
            label={`Top ${conc.pct_profesionales ?? 10}% de profesionales`}
            value={`${conc.pct_impacto ?? 0}%`}
            color={COLOR_SERIE.pacientes}
            sub={`${fmtNum(conc.n ?? 0)} de ${fmtNum(conc.total_profesionales ?? 0)} personas · ${fmtNum(conc.pacientes_top ?? 0)} de ${fmtNum(conc.total_pacientes ?? 0)} pacientes`}
          />
          <KpiFoca label="Líder de impacto" value={nombreCorto(lider?.name)} color={COLOR_SERIE.pacientes} sub={`${fmtNum(lider?.pacientes ?? 0)} pac · ${pctRepone(lider)}% repone`} />
          <KpiFoca label="Mejor reposición" value={nombreCorto(mejorRep?.name)} color={COLOR_COBERTURA.repuestas} sub={`${mejorRep?.approved_makeups ?? 0} de ${mejorRep?.count ?? 0} repuestas`} />
          <KpiFoca label="Profesionales en selección" value={fmtNum(totalProf)} color={COLOR_SERIE.profesionales} sub={`${promPorProf} pacientes por profesional`} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ChartCard
          title="Eventos por profesional — ¿repuso o no?"
          description="Ordenado por pacientes afectados"
        >
          <div style={{ width: '100%', height: Math.max(220, top12.length * 28) }}>
            <ResponsiveContainer>
              <BarChart data={top12} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} interval={0} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="approved_makeups" stackId="a" fill={COLOR_COBERTURA.repuestas} name="Repuestas" />
                <Bar dataKey="sinReponer" stackId="a" fill={COLOR_COBERTURA.sinReponer} name="Sin reponer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={leyendaRep} />
        </ChartCard>

        <div className="space-y-3">
          <div className="text-white rounded-xl p-4" style={{ background: FOCA.marino }}>
            <div className="text-[10px] tracking-widest uppercase text-white/70 font-semibold">Caso prioritario</div>
            <div className="font-semibold text-2xl mt-1">{nombreCorto(lider?.name)}</div>
            <div className="text-[11px] text-white/60 mt-0.5">{lider?.count ?? 0} eventos en la selección</div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{lider?.count ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Eventos</div>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{fmtNum(lider?.pacientes ?? 0)}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Pacientes</div>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="font-semibold text-xl">{pctRepone(lider)}%</div>
                <div className="text-[9px] uppercase tracking-wider text-white/60">Repone</div>
              </div>
            </div>
            {/* 27-oct · Sale de los datos (antes era un texto fijo). */}
            {lider && (
              <div className="text-[11px] text-white/70 mt-3 leading-relaxed">
                Genera {fmtNum(lider.pacientes ?? 0)} de {fmtNum(totalPac)} pacientes impactados ({pctPacLider}%) y
                repuso {fmtNum(lider.approved_makeups ?? 0)} de {fmtNum(lider.count ?? 0)} ausencias.
              </div>
            )}
          </div>

          {mejorRep && (
            <div className="bg-white border border-gray-100 border-l-4 rounded-xl p-4" style={{ borderLeftColor: COLOR_COBERTURA.repuestas }}>
              <div className="text-[10px] tracking-widest uppercase font-semibold" style={{ color: COLOR_COBERTURA.repuestas }}>Recomendación</div>
              <div className="font-semibold text-base text-gray-900 mt-1">Replicar a quienes sí reponen</div>
              <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                <strong>{nombreCorto(mejorRep.name)}</strong> repuso {mejorRep.approved_makeups} de {mejorRep.count} ausencias ({Math.round(mejorRep.ratio * 100)}%), frente al {data.kpis?.tasa_reposicion_pct ?? 0}% de la selección.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// =============================================================================
// TAB 3 — Reposición & cobertura
// =============================================================================
function TabReposicion({ data }) {
  const cubiertos = data.pacientes_cubiertos ?? 0
  const sinCob = data.pacientes_sin_cobertura ?? 0
  const ratio = cubiertos > 0 ? (sinCob / cubiertos).toFixed(1) : '∞'
  const total = cubiertos + sinCob
  const pctCub = total > 0 ? (cubiertos / total) * 100 : 0

  const porSede = data.por_sede ?? []
  const sla = data.sla_reposicion ?? {}
  const antel = data.antelacion_reporte ?? {}

  const dataSede = porSede.map((s) => ({ name: s.name, pct: s.pct, aprobadas: s.aprobadas ?? 0, total: s.total ?? 0 }))
  const leyendaSede = [{
    key: 'rep', label: 'Repuestas', color: COLOR_COBERTURA.repuestas, value: sumar(dataSede, 'aprobadas'),
    detalle: `${fmtNum(sumar(dataSede, 'aprobadas'))} de ${fmtNum(sumar(dataSede, 'total'))} ausencias por sede`,
  }]
  const dataSla = [
    { key: 'adelantada',     name: 'Adelantada', value: sla.adelantada ?? 0 },
    { key: 'mismo_dia',      name: 'Mismo día',  value: sla.mismo_dia ?? 0 },
    { key: 'uno_a_siete',    name: '1-7 d',      value: sla.uno_a_siete ?? 0 },
    { key: 'ocho_a_treinta', name: '8-30 d',     value: sla.ocho_a_treinta ?? 0 },
    { key: 'mas_30',         name: '>30 d',      value: sla.mas_30 ?? 0 },
  ].map((d) => ({ ...d, color: COLOR_SLA[d.key] }))
  // Oct-2026 · Alineado con la regla de 20 días: 20+ es programada.
  const dataAntel = [
    { key: 'retroactivo',       name: 'Retroact.', value: antel.retroactivo ?? 0 },
    { key: 'uno_a_siete',       name: '1-7 d',     value: antel.uno_a_siete ?? 0 },
    { key: 'ocho_a_diecinueve', name: '8-19 d',    value: antel.ocho_a_diecinueve ?? 0 },
    { key: 'veinte_o_mas',      name: '20+ d',     value: antel.veinte_o_mas ?? 0 },
  ].map((d) => ({ ...d, color: COLOR_ANTELACION[d.key] }))
  // 27-oct · Leyenda de las franjas: solo las que tienen datos, con su total.
  const itemsFranjas = (filas) => filas.map((d) => ({ key: d.key, label: d.name, color: d.color, value: d.value }))

  return (
    <>
      <Panel
        eyebrow="Profundización · Cobertura"
        title="La brecha de reposición"
        description="Aquí se contrasta el impacto cubierto frente al no cubierto y la oportunidad de la reposición."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="font-semibold text-lg text-gray-900 mb-3">Pacientes: cubiertos vs. sin cobertura</div>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="font-semibold text-4xl" style={{ color: COLOR_COBERTURA.repuestas }}>{fmtNum(cubiertos)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Con reposición</div>
              </div>
              <div className="text-2xl text-gray-300 font-semibold">vs</div>
              <div className="text-center">
                <div className="font-semibold text-4xl" style={{ color: COLOR_COBERTURA.sinReponer }}>{fmtNum(sinCob)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Sin cobertura</div>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: COLOR_COBERTURA.sinReponer }}>
              <div className="h-full" style={{ width: `${pctCub}%`, background: COLOR_COBERTURA.repuestas }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-2">
              Por cada paciente con turno nuevo, <strong className="text-gray-900">{ratio} pacientes</strong> quedaron sin cobertura.
            </div>
          </div>

          <ChartCard
            title="Tasa de reposición por sede"
            description="% de ausencias repuestas sobre el total de cada sede (la sede donde se cayó la agenda)"
          >
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={dataSede} margin={{ top: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  {/* 27-oct · Un solo color: es la tasa de "repuestas". */}
                  <Bar dataKey="pct" name="Repuestas" radius={[4, 4, 0, 0]} fill={COLOR_COBERTURA.repuestas}>
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: '#475569' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Leyenda items={leyendaSede} />
          </ChartCard>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard
          title="Oportunidad de la reposición (SLA)"
          description="Cuándo es el turno que cubre respecto a la fecha de la ausencia"
        >
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={dataSla} margin={{ top: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Turnos" radius={[4, 4, 0, 0]}>
                  {dataSla.map((d) => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={itemsFranjas(dataSla)} />
        </ChartCard>

        <ChartCard
          title="Antelación del reporte"
          description="Días entre el aviso y el inicio de la ausencia · 20+ días = programada"
        >
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={dataAntel} margin={{ top: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Ausencias" radius={[4, 4, 0, 0]}>
                  {dataAntel.map((d) => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={itemsFranjas(dataAntel)} />
        </ChartCard>
      </div>
    </>
  )
}

// =============================================================================
// TAB 4 — Causas & especialidades
// =============================================================================
function TabCausas({ data }) {
  const familias = data.por_familia ?? []
  const donut = familias.map((f) => ({
    name: f.label,
    value: f.count,
    pac: f.pacientes,
    color: FAMILIA_COLOR[f.family] ?? FOCA.claro,
  }))

  // Motivos sumados por nombre (ver motivosAgrupados), de menor a mayor.
  const topMotivos = motivosAgrupados(data.top_motivos).reverse()

  // 27-oct · PROYECTOS-3799 · Las barras de especialidad y subespecialidad
  // llevan el color del tipo de profesional (COLOR_TIPO), igual en las tres.
  const porEsp = (data.por_especialidad ?? []).map((e) => ({
    type: e.type,
    name: TIPO_LABEL[e.type] ?? e.type,
    pacientes: e.pacientes ?? 0,
  })).reverse()

  const porSub = data.por_subespecialidad ?? []
  const topSub = porSub.slice(0, 10).map((s) => ({
    type: s.type,
    name: s.specialty,
    pacientes: s.pacientes ?? 0,
  })).reverse()

  const cruceTop = porSub.slice(0, 10).map((s) => ({
    type: s.type,
    name: `${TIPO_LABEL[s.type] ?? s.type} · ${s.specialty}`,
    pacientes: s.pacientes ?? 0,
  })).reverse()

  const dias = data.por_dia_semana ?? []
  const LABELS_DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const dataDow = dias.map((d, i) => ({
    name: LABELS_DOW[i],
    pacientes: d.pacientes ?? 0,
    eventos: d.count ?? 0,
  }))
  const leyendaDow = [
    { key: 'pac', label: 'Pacientes', color: COLOR_SERIE.pacientes, value: sumar(dataDow, 'pacientes') },
    { key: 'ev', label: 'Reprogramaciones', color: COLOR_SERIE.eventos, value: sumar(dataDow, 'eventos'), forma: 'linea' },
  ]

  return (
    <>
      <Panel
        eyebrow="Profundización · Operación"
        title="Causas, especialidades y subespecialidades"
        description="De dónde nacen las reprogramaciones y dónde golpean."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCard title="Naturaleza de la reprogramación" description="Eventos por causa raíz">
            <div className="flex items-start gap-3">
              <div style={{ width: 180, height: 180 }} className="shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={donut.filter((d) => d.value > 0).length > 1 ? 2 : 0} stroke="none">
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => `${v} eventos · ${p.payload.pac} pac.`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1 text-xs min-w-0">
                {donut.filter((d) => d.value > 0).map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="truncate text-gray-700">{d.name}</span>
                    </div>
                    <span className="text-gray-500 text-[11px] shrink-0">
                      {d.value} · <span className="tabular-nums">{fmtNum(d.pac)} pac.</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Motivos específicos más frecuentes" description="Nº de eventos por tipo de ausencia">
            <div style={{ width: '100%', height: Math.max(200, topMotivos.length * 24) }}>
              <ResponsiveContainer>
                <BarChart data={topMotivos} layout="vertical" margin={{ top: 5, right: 45, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={170} interval={0} />
                  <Tooltip />
                  <Bar dataKey="count" name="Reprogramaciones" fill={COLOR_SERIE.eventos} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: '#475569' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Leyenda items={[{ key: 'ev', label: 'Reprogramaciones', color: COLOR_SERIE.eventos, value: sumar(topMotivos, 'count') }]} />
          </ChartCard>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ChartCard title="Impacto por especialidad" description="Pacientes afectados">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={porEsp} layout="vertical" margin={{ top: 5, right: 45, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} interval={0} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" name="Pacientes" radius={[0, 4, 4, 0]}>
                  {porEsp.map((d) => <Cell key={d.type} fill={colorTipo(d.type)} />)}
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={itemsPorTipo(porEsp, 'pacientes', ' pac.')} />
        </ChartCard>

        <ChartCard title="Impacto por subespecialidad" description="Pacientes afectados · top subespecialidades">
          <div style={{ width: '100%', height: Math.max(220, topSub.length * 24) }}>
            <ResponsiveContainer>
              <BarChart data={topSub} layout="vertical" margin={{ top: 5, right: 45, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} interval={0} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" name="Pacientes" radius={[0, 4, 4, 0]}>
                  {topSub.map((d, i) => <Cell key={i} fill={colorTipo(d.type)} />)}
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={itemsPorTipo(topSub, 'pacientes', ' pac.')} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Patrón por día de la semana" description="Según el día en que empieza la ausencia">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={dataDow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar yAxisId="left" dataKey="pacientes" barSize={32} radius={[4, 4, 0, 0]} name="Pacientes" fill={COLOR_SERIE.pacientes} />
                <Line yAxisId="right" type="monotone" dataKey="eventos" stroke={COLOR_SERIE.eventos} strokeWidth={2} dot={{ r: 3 }} name="Reprogramaciones" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={leyendaDow} />
        </ChartCard>

        <ChartCard title="Especialidad × subespecialidad" description="Mayor detalle del top de impacto">
          <div style={{ width: '100%', height: Math.max(220, cruceTop.length * 24) }}>
            <ResponsiveContainer>
              <BarChart data={cruceTop} layout="vertical" margin={{ top: 5, right: 45, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={200} interval={0} />
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Bar dataKey="pacientes" name="Pacientes" radius={[0, 4, 4, 0]}>
                  {cruceTop.map((d, i) => <Cell key={i} fill={colorTipo(d.type)} />)}
                  <LabelList dataKey="pacientes" position="right" formatter={(v) => fmtNum(v)} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Leyenda items={itemsPorTipo(cruceTop, 'pacientes', ' pac.')} />
        </ChartCard>
      </div>
    </>
  )
}
