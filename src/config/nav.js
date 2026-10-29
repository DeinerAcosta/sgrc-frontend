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
 * DÓNDE ATERRIZA CADA ROL AL ENTRAR
 * =================================
 *
 * Oct-2026 · Esto estaba COPIADO EN TRES SITIOS —App.jsx, LoginPage y
 * ChangePasswordPage— y las tres copias se habían ido separando:
 *
 *   · las dos de autenticación tenían la clave `resource` en vez de
 *     `recurso`, así que ese rol nunca encontraba su destino y caía en el
 *     valor por defecto. Como el defecto era el mismo `/app/horario`, nadie
 *     lo notó nunca.
 *   · a ninguna de las dos le añadieron `reprogramador` cuando se creó el
 *     rol. Caía en `/app/horario`, que ese rol NO puede abrir, el guardia lo
 *     devolvía a `/app/horario`, y el usuario entraba a una pantalla en
 *     blanco que se redirigía a sí misma.
 *
 * Un solo sitio, y que el guardia use este mismo mapa para rebotar: así un
 * rol nuevo no puede volver a quedarse sin casa.
 */
export const RUTA_DE_ENTRADA = {
  recurso:       '/app/horario',
  coordinador:   '/app/dashboard-coord',
  directivo:     '/app/dashboard',
  // Oct-2026 · La líder de reprogramación (María Duarte) entra con este rol:
  // su trabajo es el proceso de ausencias, no los catálogos.
  supervisor:    '/app/ausencias-coord',   // = RAIZ_AUSENCIAS; literal para que qa:menu lo lea
  gerencia:      '/app/dashboard',
  reprogramador: '/app/mis-reprogramaciones',
}

/**
 * La casa de este rol. Nunca devuelve algo que el rol no pueda abrir, que es
 * justo el bucle que se quiere evitar.
 */
export function rutaDeEntrada(rol) {
  return RUTA_DE_ENTRADA[rol] ?? '/app/perfil'
}

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

// 21-oct · Hector: "organizar los módulos que queden en uno solo y se llame
// Configuración". Catálogos maestros y Configuración eran dos grupos con lo
// mismo de fondo: la información base con la que trabaja el sistema.
const CONFIGURACION = {
  clave: 'configuracion', icon: '⚙️', label: 'Configuración',
  descripcion: 'La información base del sistema y los valores con los que calcula: sedes, personal, motivos, costos, metas y calendario.',
  children: [
    { to: '/app/admin/sedes',             label: 'Sedes y consultorios', descripcion: 'Sedes, sus consultorios y la especialidad de cada uno' },
    { to: '/app/admin/recursos',          label: 'Recursos',             descripcion: 'Catálogo de profesionales, auxiliares, técnicos y asesores' },
    { to: '/app/admin/usuarios',          label: 'Usuarios',             descripcion: 'Quién entra al sistema y con qué rol' },
    { to: '/app/admin/motivos-ausencia',  label: 'Motivos de ausencia',  descripcion: 'Catálogo de motivos y su familia' },
    { to: '/app/admin/tareas-backoffice', label: 'Tareas de backoffice', descripcion: 'Catálogo de tareas asignables' },
    { to: '/app/admin/parametros',        label: 'Parámetros de costo',  descripcion: 'Costo por tipo de consulta y por reprogramación' },
    { to: '/app/admin/metas',             label: 'Metas del sistema',    descripcion: 'Metas de ocupación y utilización, jornada semanal, avisos' },
    { to: '/app/admin/festivos',          label: 'Festivos',             descripcion: 'Calendario oficial de Colombia' },
  ],
}

const SOLICITUDES = {
  clave: 'solicitudes', icon: '📨', label: 'Solicitudes',
  descripcion: 'Peticiones que esperan su aprobación.',
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
    // Oct-2026 · El coordinador reprograma las agendas de técnicos, auxiliares
    // y asesores de su sede; las de profesionales son de la líder. Antes no
    // tenía ninguna puerta a eso: podía abrir un caso desde el listado, pero
    // nada le decía cuáles le tocaban.
    { to: '/app/mis-reprogramaciones', label: 'Mis reprogramaciones', descripcion: 'Las agendas caídas que le toca reprogramar' },
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
      descripcion: 'El día a día de su sede: programar, ejecutar y revisar.',
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
      descripcion: 'Las personas a su cargo y lo que necesitan.',
      children: [
        { to: '/app/recursos-coord',      label: 'Recursos',               descripcion: 'Su equipo y su carga' },
        { to: '/app/backoffice-coord',    label: 'Backoffice',             descripcion: 'Tareas administrativas asignadas' },
        { to: '/app/solicitudes-recurso', label: 'Solicitudes de recurso', descripcion: 'Pedir personal de otra sede' },
      ],
    },
    { to: '/app/informes/ocupacion', icon: '📊', label: 'Ocupación' },
    { to: '/app/perfil',             icon: '👤', label: 'Mi perfil' },
  ],

  directivo: [
    { to: '/app/dashboard', icon: '📊', label: 'Dashboard ejecutivo' },
    { to: '/app/comparativo', icon: '🗂️', label: 'Históricos de semanas' },
    {
      clave: 'ocupacion', icon: '🏥', label: 'Ocupación',
      descripcion: 'Qué tanto se usa la capacidad instalada.',
      children: [
        { to: '/app/informes/ocupacion',          label: 'Consultorios', descripcion: 'Horas usadas frente a horas disponibles' },
        { to: '/app/informes/ocupacion-asesores', label: 'Asesores',     descripcion: 'Ocupación del área de asesoría' },
        { to: '/app/informes/indicadores-asesores', label: 'Indicadores de asesores', descripcion: 'Ocupación, backoffice y ausentismo por asesor' },
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
      ],
    },
    { to: '/app/perfil', icon: '👤', label: 'Mi perfil' },
  ],

  // Oct-2026 · María Duarte, la líder de reprogramación, entra como supervisor
  // y hace el proceso completo igual que gerencia (Hector: "si se supone que
  // Duarte como supervisor es la que realiza el proceso igual como gerencia,
  // ¿por qué no aparece todo el proceso?"). Antes este menú solo tenía lo
  // administrativo: Gestión de ausencias, el Programador y el tablero de
  // Reprogramaciones no estaban, aunque las rutas sí la dejaban entrar.
  supervisor: [
    { to: '/app/reprogramaciones', icon: '🔄', label: 'Reprogramaciones' },
    GESTION_AUSENCIAS,
    // Para mover agendas y, con motivo, corregir una semana cerrada.
    { to: '/app/programador', icon: '📅', label: 'Programador' },
    CONFIGURACION,
    SOLICITUDES,
    { to: '/app/admin/auditoria', icon: '🔍', label: 'Auditoría' },
    { to: '/app/perfil',          icon: '👤', label: 'Mi perfil' },
  ],

  // Sep-2026 · Rol acotado: una sola persona reprograma las agendas caídas.
  // Antes usaba el perfil de gerencia y veía 26 entradas de las que usa dos.
  reprogramador: [
    // Oct-2026 · Este perfil es el de QUIEN RECIBE el encargo, no el de la
    // líder. Hector: "este perfil es para las personas que Duarte asigna, no
    // para Duarte".
    //
    // Tenía el menú de la líder y eso era un agujero: desde "Pendientes y
    // gestión" entraba a TODAS las ausencias de profesionales y podía
    // repartirlas. Su trabajo es otro — llamar a los pacientes de los casos
    // que le pasaron y cerrarlos.
    //
    // La líder ya no pasa por aquí: usa el perfil de supervisor, que tiene
    // Gestión de ausencias completa y puede asignar.
    { to: '/app/mis-reprogramaciones', icon: '📋', label: 'Mis reprogramaciones' },
    // Oct-2026 · Aquí estaba el Programador como "Agenda (consulta)" y fue un
    // error mío: abre vacío pidiendo elegir sede, y trae "Copiar semana
    // anterior" y "Cerrar semana", que no son suyos. Hector: "¿este
    // programador para qué es?". En su lugar va el cronograma de SUS casos.
    { to: '/app/mis-reprogramaciones?vista=cronograma', icon: '🗓️', label: 'Cronograma' },
    { to: '/app/perfil', icon: '👤', label: 'Mi perfil' },
  ],

  gerencia: [
    {
      clave: 'ejecutiva', icon: '📊', label: 'Vista ejecutiva',
      descripcion: 'El estado general de la operación.',
      children: [
        { to: '/app/dashboard',                   label: 'Dashboard ejecutivo',   descripcion: 'Indicadores de la semana en curso' },
        { to: '/app/informes/ocupacion',          label: 'Ocupación consultorios', descripcion: 'Horas usadas frente a disponibles' },
        { to: '/app/informes/ocupacion-asesores', label: 'Ocupación asesores',     descripcion: 'Ocupación del área de asesoría' },
        { to: '/app/informes/indicadores-asesores', label: 'Indicadores de asesores', descripcion: 'Ocupación, backoffice y ausentismo por asesor' },
        // 21-oct · Hector: el comparativo pasa a Vista ejecutiva como "Históricos de semanas".
        { to: '/app/comparativo',             label: 'Históricos de semanas', descripcion: 'Una semana frente a otra' },
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
        // 21-oct · Hector: "Editar semana cerrada" = "Planeación semanal", y
        // "Cierre de semanas" queda segunda.
        { to: '/app/programador',             label: 'Planeación semanal', descripcion: 'Programar la semana; con motivo, corregir una ya cerrada' },
        { to: '/app/informes/cierre-semanas', label: 'Cierre de semanas',  descripcion: 'Qué sedes cerraron y cuándo' },
      ],
    },
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
