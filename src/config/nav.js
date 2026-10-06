import { GRUPOS_AUSENCIAS } from '@/utils/helpers'

/**
 * MENÚ AGRUPADO POR MÓDULOS (sep-2026)
 * ====================================
 *
 * Antes era una lista plana con separadores: gerencia veía 26 entradas seguidas
 * y había que recorrerlas con la vista. Ahora cada módulo es un padre
 * desplegable, como el menú de Biowel.
 *
 * Un item puede ser:
 *   · enlace        {to, icon, label}
 *   · separador     {divider: true, label}
 *   · módulo padre  {clave, icon, label, descripcion, children: [{to, label, descripcion}]}
 *
 * AL PULSAR EL PADRE SE ABRE LA PÁGINA DEL MÓDULO, no su primera opción. Esa
 * página lista las opciones con su descripción — igual que "Módulo de
 * Administración" en Biowel. Se genera sola desde este archivo: la ruta
 * `/app/modulo/:clave` busca aquí el módulo del rol activo. Por eso cada padre
 * necesita `clave`, y por eso este archivo vive aparte de AppLayout: lo leen
 * los dos.
 *
 * Un padre puede traer `raiz` para apuntar a una pantalla propia en vez de a la
 * página genérica. Gestión de ausencias la usa: ya tiene su pantalla de
 * tarjetas por grupo de personal.
 *
 * Reducción: coordinador 11→7, directivo 12→6, supervisor 14→6, gerencia 26→9.
 * Recurso se deja plano a propósito: son 5 entradas y agruparlas solo añadiría
 * un clic para llegar a lo mismo.
 */

/** Pantalla de entrada de Gestión de ausencias (las tarjetas por grupo). */
export const RAIZ_AUSENCIAS = '/app/ausencias-coord'

/**
 * Submenú de Gestión de ausencias: una opción por grupo de personal, las mismas
 * que las tarjetas. Se arma desde GRUPOS_AUSENCIAS para que menú y tarjetas no
 * puedan desincronizarse: si mañana se agrega un grupo, sale en los dos sitios.
 */
export const HIJOS_AUSENCIAS = GRUPOS_AUSENCIAS.map((g) => ({
  to: `${RAIZ_AUSENCIAS}?grupo=${g.key}`,
  label: g.label,
  descripcion: g.descripcion,
}))

// ── Bloques compartidos ──────────────────────────────────────────────────────
// Gerencia y supervisor tenían estas tres secciones duplicadas. Definirlas una
// sola vez evita que se desincronicen cuando se agregue una pantalla.

const CATALOGOS = {
  clave: 'catalogos', icon: '🏢', label: 'Catálogos maestros',
  descripcion: 'La información base del sistema: dónde se atiende, con quién y bajo qué motivos.',
  children: [
    { to: '/app/admin/sedes',             label: 'Sedes y consultorios', descripcion: 'Sedes, sus consultorios y la especialidad de cada uno' },
    { to: '/app/admin/recursos',          label: 'Recursos',             descripcion: 'Catálogo de profesionales, auxiliares, técnicos y asesores' },
    { to: '/app/admin/usuarios',          label: 'Usuarios',             descripcion: 'Quién entra al sistema y con qué rol' },
    { to: '/app/admin/motivos-ausencia',  label: 'Motivos de ausencia',  descripcion: 'Catálogo de motivos y su familia' },
    { to: '/app/admin/tareas-backoffice', label: 'Tareas de backoffice', descripcion: 'Catálogo de tareas asignables' },
  ],
}

const CONFIGURACION = {
  clave: 'configuracion', icon: '⚙️', label: 'Configuración',
  descripcion: 'Los valores con los que el sistema calcula: costos, metas y calendario.',
  children: [
    { to: '/app/admin/parametros', label: 'Parámetros de costo', descripcion: 'Costo por tipo de consulta y por reprogramación' },
    { to: '/app/admin/metas',      label: 'Metas del sistema',   descripcion: 'Metas de ocupación y utilización, jornada semanal, avisos' },
    { to: '/app/admin/festivos',   label: 'Festivos',            descripcion: 'Calendario oficial de Colombia' },
  ],
}

const SOLICITUDES = {
  clave: 'solicitudes', icon: '📨', label: 'Solicitudes',
  descripcion: 'Peticiones que esperan tu aprobación.',
  children: [
    { to: '/app/admin/solicitudes',         label: 'De registro', descripcion: 'Personas que pidieron una cuenta' },
    { to: '/app/admin/solicitudes-recurso', label: 'De recurso',  descripcion: 'Coordinadores que piden personal de otra sede' },
  ],
}

const GESTION_AUSENCIAS = {
  clave: 'ausencias', icon: '⚠️', label: 'Gestión de ausencias',
  descripcion: 'Registro y gestión de las ausencias, separadas por grupo de personal.',
  raiz: RAIZ_AUSENCIAS,   // pantalla propia: las tarjetas por grupo
  children: [
    ...HIJOS_AUSENCIAS,
    { to: '/app/ausencias-cronograma', label: 'Cronograma', descripcion: 'Vista mensual de todas las ausencias' },
  ],
}

const PRODUCTIVIDAD = {
  clave: 'productividad', icon: '📈', label: 'Productividad',
  descripcion: 'Qué tanto se aprovecha el tiempo del equipo.',
  children: [
    { to: '/app/informes/productividad',   label: 'Global',                  descripcion: 'Horas y pacientes por recurso' },
    { to: '/app/productividad-recurso',    label: 'Individual',              descripcion: 'Ficha de un recurso concreto' },
    { to: '/app/informes/horas-prog-ejec', label: 'Programado vs ejecutado', descripcion: 'Lo planeado frente a lo que ocurrió' },
  ],
}

const AUSENTISMO = {
  clave: 'ausentismo', icon: '🚨', label: 'Ausentismo',
  descripcion: 'Cuánto cuesta lo que no se hizo.',
  children: [
    { to: '/app/informes/ausentismo-impacto', label: 'Ausentismo e impacto', descripcion: 'Ausencias, pacientes afectados y costo' },
    { to: '/app/informes/subutilizacion',     label: 'Tiempos ociosos',      descripcion: 'Capacidad contratada sin usar' },
  ],
}

// ── Menús por rol ────────────────────────────────────────────────────────────

export const NAV_ITEMS = {
  recurso: [
    { to: '/app/horario',      icon: '📅', label: 'Mi horario' },
    { to: '/app/mi-ejecucion', icon: '✅', label: 'Ejecución del día' },
    { to: '/app/ausencias',    icon: '📋', label: 'Mis ausencias' },
    { to: '/app/backoffice',   icon: '🗂️', label: 'Backoffice' },
    { to: '/app/perfil',       icon: '👤', label: 'Mi perfil' },
  ],

  coordinador: [
    { to: '/app/dashboard-coord', icon: '🏠', label: 'Dashboard' },
    {
      clave: 'programacion', icon: '📅', label: 'Programación',
      descripcion: 'El día a día de tu sede: programar, ejecutar y revisar.',
      children: [
        { to: '/app/programador',    label: 'Programador',    descripcion: 'Armar la semana del equipo' },
        { to: '/app/ejecucion',      label: 'Ejecución',      descripcion: 'Registrar lo que realmente pasó' },
        { to: '/app/horario-diario', label: 'Resumen diario', descripcion: 'El horario del día, listo para imprimir' },
      ],
    },
    GESTION_AUSENCIAS,
    {
      // "Solicitudes de recurso" entra aquí: pedir un recurso es gestionar tu
      // equipo, no una sección propia con un solo elemento.
      clave: 'equipo', icon: '👥', label: 'Mi equipo',
      descripcion: 'Las personas a tu cargo y lo que necesitan.',
      children: [
        { to: '/app/recursos-coord',      label: 'Recursos',               descripcion: 'Tu equipo y su carga' },
        { to: '/app/backoffice-coord',    label: 'Backoffice',             descripcion: 'Tareas administrativas asignadas' },
        { to: '/app/solicitudes-recurso', label: 'Solicitudes de recurso', descripcion: 'Pedir personal de otra sede' },
      ],
    },
    { to: '/app/informes/ocupacion', icon: '📊', label: 'Ocupación' },
    { to: '/app/perfil',             icon: '👤', label: 'Mi perfil' },
  ],

  directivo: [
    { to: '/app/dashboard', icon: '📊', label: 'Dashboard ejecutivo' },
    {
      clave: 'ocupacion', icon: '🏥', label: 'Ocupación',
      descripcion: 'Qué tanto se usa la capacidad instalada.',
      children: [
        { to: '/app/informes/ocupacion',          label: 'Consultorios', descripcion: 'Horas usadas frente a horas disponibles' },
        { to: '/app/informes/ocupacion-asesores', label: 'Asesores',     descripcion: 'Ocupación del área de asesoría' },
      ],
    },
    PRODUCTIVIDAD,
    // Reprogramaciones SALE de Ausentismo: es su propio módulo, no una vista del
    // ausentismo. Es la separación que se está haciendo.
    AUSENTISMO,
    { to: '/app/reprogramaciones', icon: '🔄', label: 'Reprogramaciones' },
    {
      clave: 'cierre', icon: '🔒', label: 'Cierre y control',
      descripcion: 'Cómo se está cerrando cada semana.',
      children: [
        { to: '/app/informes/cierre-semanas', label: 'Cierre de semanas',  descripcion: 'Qué sedes cerraron y cuándo' },
        { to: '/app/comparativo',             label: 'Comparativo semanal', descripcion: 'Una semana frente a otra' },
      ],
    },
    { to: '/app/perfil', icon: '👤', label: 'Mi perfil' },
  ],

  supervisor: [
    CATALOGOS,
    CONFIGURACION,
    SOLICITUDES,
    {
      clave: 'operativa', icon: '🗓️', label: 'Gestión operativa',
      descripcion: 'Intervención sobre la operación en curso.',
      children: [
        { to: '/app/ausencias-cronograma', label: 'Cronograma de ausencias', descripcion: 'Vista mensual de todas las sedes' },
        { to: '/app/programador',          label: 'Editar semana cerrada',   descripcion: 'Corregir con motivo, queda en auditoría' },
      ],
    },
    { to: '/app/admin/auditoria', icon: '🔍', label: 'Auditoría' },
    { to: '/app/perfil',          icon: '👤', label: 'Mi perfil' },
  ],

  // Sep-2026 · Rol acotado: una sola persona reprograma las agendas caídas.
  // Antes usaba el perfil de gerencia y veía 26 entradas de las que usa dos.
  reprogramador: [
    { to: '/app/reprogramaciones', icon: '🔄', label: 'Reprogramaciones' },
    {
      // Solo profesionales. No es una elección de la pantalla: el backend
      // recorta la consulta por tipo de recurso (absenceController.list).
      clave: 'ausencias-prof', icon: '⚠️', label: 'Ausencias de profesionales',
      descripcion: 'Las ausencias que dejan pacientes sin atender.',
      children: [
        { to: `${RAIZ_AUSENCIAS}?grupo=profesionales`, label: 'Pendientes y gestión', descripcion: 'Ausencias por revisar y gestionar' },
        { to: '/app/ausencias-cronograma',             label: 'Cronograma',           descripcion: 'Vista mensual' },
      ],
    },
    { to: '/app/programador', icon: '📅', label: 'Agenda (consulta)' },
    { to: '/app/perfil',      icon: '👤', label: 'Mi perfil' },
  ],

  gerencia: [
    {
      clave: 'ejecutiva', icon: '📊', label: 'Vista ejecutiva',
      descripcion: 'El estado general de la operación.',
      children: [
        { to: '/app/dashboard',                   label: 'Dashboard ejecutivo',   descripcion: 'Indicadores de la semana en curso' },
        { to: '/app/informes/ocupacion',          label: 'Ocupación consultorios', descripcion: 'Horas usadas frente a disponibles' },
        { to: '/app/informes/ocupacion-asesores', label: 'Ocupación asesores',     descripcion: 'Ocupación del área de asesoría' },
      ],
    },
    PRODUCTIVIDAD,
    AUSENTISMO,
    { to: '/app/reprogramaciones', icon: '🔄', label: 'Reprogramaciones' },
    GESTION_AUSENCIAS,
    {
      clave: 'cierre', icon: '🔒', label: 'Cierre y control',
      descripcion: 'Cómo se está cerrando cada semana.',
      children: [
        { to: '/app/informes/cierre-semanas', label: 'Cierre de semanas',   descripcion: 'Qué sedes cerraron y cuándo' },
        { to: '/app/comparativo',             label: 'Comparativo semanal', descripcion: 'Una semana frente a otra' },
        { to: '/app/programador',             label: 'Editar semana cerrada', descripcion: 'Corregir con motivo, queda en auditoría' },
      ],
    },
    CATALOGOS,
    CONFIGURACION,
    SOLICITUDES,
    { to: '/app/admin/auditoria', icon: '🔍', label: 'Auditoría' },
    { to: '/app/perfil',          icon: '👤', label: 'Mi perfil' },
  ],
}

/** Ruta de la página de un módulo. El padre del menú lleva aquí. */
export const rutaModulo = (clave) => `/app/modulo/${clave}`

/** Busca un módulo por su clave dentro del menú de un rol. */
export function buscarModulo(rol, clave) {
  return (NAV_ITEMS[rol] ?? []).find((i) => i.children && i.clave === clave) ?? null
}
