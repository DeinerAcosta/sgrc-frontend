import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { addWeeks, subWeeks, startOfWeek, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { asignacionService, semanaService, sedeService, festivoService, recursoService, consultorioService } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { DIAS_LABEL, DIAS, semanaLabel, diasDeSemana, calcularCapacidadPacientes } from '@/utils/helpers'
import AsignacionModal from '@/pages/coordinador/AsignacionModal'
import CerrarSemanaModal from '@/pages/coordinador/CerrarSemanaModal'

const SLOT_COLOR = {
  oftalmologo:   'slot-teal',
  anestesiologo: 'slot-blue',
  optometra:     'slot-purple',
  auxiliar:      'slot-teal',
  tecnico:       'slot-blue',
}

export default function ProgramadorPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const sedeId = user?.sedes?.[0]

  const [semanaBase, setSemanaBase] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [modalData, setModalData]   = useState(null)
  const [showCierre, setShowCierre] = useState(false)

  const diasFecha = diasDeSemana(semanaBase)
  const fechasISO = diasFecha.map((d) => format(d, 'yyyy-MM-dd'))

  // Festivos del rango (RN-06)
  const { data: festivos = [] } = useQuery({
    queryKey: ['festivos-semana', fechasISO[0], fechasISO[6]],
    queryFn: () => festivoService.list({ desde: fechasISO[0], hasta: fechasISO[6] }),
  })
  const festivosSet = new Set(festivos.map((f) => f.fecha))

  // Recursos para cálculo de ocupación + ociosos al cerrar
  const { data: recursos = [] } = useQuery({
    queryKey: ['recursos-sede-programador', sedeId],
    queryFn: () => recursoService.list({ sede_id: sedeId }),
  })

  const { data: semanas = [] } = useQuery({
    queryKey: ['semanas', sedeId],
    queryFn: () => semanaService.list({ sede_id: sedeId }),
  })
  const semanaActual = semanas.find((s) => {
    const ini = new Date(s.fecha_inicio)
    const fin = new Date(s.fecha_fin)
    return semanaBase >= ini && semanaBase <= fin
  })

  const { data: consultorios = [], isLoading: loadCons } = useQuery({
    queryKey: ['consultorios', sedeId],
    queryFn: () => sedeService.consultorios(sedeId),
    enabled: !!sedeId,
  })

  const { data: asignaciones = [], isLoading: loadAsig } = useQuery({
    queryKey: ['asignaciones', semanaActual?.id, sedeId],
    queryFn: () => asignacionService.list({ semana_id: semanaActual?.id, sede_id: sedeId }),
    enabled: !!semanaActual,
  })

  const { mutate: crearSemana } = useMutation({
    mutationFn: () => semanaService.create({ fecha_inicio: format(semanaBase, 'yyyy-MM-dd'), sede_id: sedeId }),
    onSuccess: () => { qc.invalidateQueries(['semanas']); toast.success('Semana creada') },
    onError: (err) => toast.error(err?.message ?? 'No se puede crear — verifica la anticipación mínima de 3 días'),
  })

  const { mutate: copiarSemana } = useMutation({
    mutationFn: () => {
      const anterior = semanas.find((s) => parseISO(s.fecha_fin) < semanaBase)
      if (!anterior) throw new Error('No hay semana anterior para copiar')
      return semanaService.copiar(anterior.id, format(semanaBase, 'yyyy-MM-dd'))
    },
    onSuccess: () => { qc.invalidateQueries(['semanas']); qc.invalidateQueries(['asignaciones']); toast.success('Semana copiada — revisa recursos no disponibles') },
    onError: (err) => toast.error(err?.message ?? 'Error al copiar'),
  })

  const { mutate: eliminarAsig } = useMutation({
    mutationFn: (id) => asignacionService.remove(id),
    onSuccess: () => { qc.invalidateQueries(['asignaciones']); toast.success('Asignación eliminada') },
  })

  // HU-C-15: toggle activar/desactivar consultorio
  const { mutate: toggleConsultorio } = useMutation({
    mutationFn: ({ id, activo }) => consultorioService.update(id, { activo }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['consultorios'])
      toast.success(vars.activo ? 'Consultorio activado' : 'Consultorio desactivado')
    },
  })

  const asigDeConsultorioDia = (consultorioId, dia) =>
    asignaciones.filter((a) => a.consultorio_id === consultorioId && a.dia_semana === dia)

  const isCerrada = semanaActual?.estado === 'cerrada'
  const isSupervisor = user?.rol === 'supervisor'
  const canEdit = !isCerrada || isSupervisor

  const ocupacion = consultorios.length > 0
    ? Math.round((asignaciones.filter((a) => a.recurso_id).length / (consultorios.length * 6)) * 100)
    : 0

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Programador semanal</h1>
          <p className="text-xs text-gray-500">{semanaLabel(semanaBase)} · Ocupación proyectada: <strong>{ocupacion}%</strong></p>
        </div>
        <div className="flex gap-2">
          {!semanaActual && (
            <button className="btn-primary" onClick={() => crearSemana()}>+ Crear semana</button>
          )}
          {semanaActual && !isCerrada && (
            <button className="btn" onClick={() => copiarSemana()}>📋 Copiar semana anterior</button>
          )}
          {semanaActual && !isCerrada && (
            <button className="btn" style={{ borderColor: '#d1fae5', color: '#065f46' }} onClick={() => setShowCierre(true)}>
              🔒 Cerrar semana
            </button>
          )}
          {isCerrada && <Badge variant="gray">Semana cerrada{isSupervisor ? ' — puedes editar' : ''}</Badge>}
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn" onClick={() => setSemanaBase((d) => subWeeks(d, 1))}>← Anterior</button>
        <div className="flex gap-1">
          {diasFecha.map((d, i) => (
            <div key={i} className="text-center">
              <div className="text-xs text-gray-400">{DIAS_LABEL[i]}</div>
              <div className={`text-xs font-medium ${format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-brand-600' : 'text-gray-600'}`}>
                {format(d, 'd')}
              </div>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setSemanaBase((d) => addWeeks(d, 1))}>Siguiente →</button>
      </div>

      {/* Grid */}
      {loadCons || loadAsig ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !semanaActual ? (
        <EmptyState icon="📅" title="No hay semana creada para este período" description="Crea la semana para comenzar a programar recursos." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              {DIAS.map((_, i) => <col key={i} style={{ width: `${(100 - 14) / 7}%` }} />)}
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left text-xs font-medium text-gray-500 border-b border-gray-100">Consultorio</th>
                {DIAS_LABEL.map((d, i) => {
                  const esHoy = format(diasFecha[i], 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  const esFestivo = festivosSet.has(fechasISO[i])
                  return (
                    <th key={i} className={`p-2 text-center text-xs font-medium border-b border-gray-100 ${esHoy ? 'text-brand-600' : esFestivo ? 'text-amber-700 bg-amber-50/50' : 'text-gray-500'}`}>
                      {d} {format(diasFecha[i], 'd')}
                      {esFestivo && <div className="text-xs text-amber-600 font-normal mt-0.5">festivo</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {consultorios.filter((c) => c.activo).map((cons) => (
                <tr key={cons.id} className="border-b border-gray-50">
                  <td className="p-2 bg-gray-50 border-r border-gray-100 align-top">
                    <div className="flex items-center justify-between gap-1">
                      <div>
                        <div className="font-medium text-gray-700 text-xs">{cons.nombre}</div>
                        <div className="text-gray-400 text-xs capitalize">{cons.especialidad}</div>
                      </div>
                      {canEdit && (
                        <button
                          className="text-xs text-gray-300 hover:text-red-500"
                          onClick={() => toggleConsultorio({ id: cons.id, activo: false })}
                          title="Desactivar consultorio temporalmente"
                        >×</button>
                      )}
                    </div>
                  </td>
                  {DIAS.map((dia) => {
                    const asigs = asigDeConsultorioDia(cons.id, dia)
                    return (
                      <td key={dia} className="p-1 align-top border-r border-gray-50 min-h-12">
                        {asigs.map((a) => (
                          <div
                            key={a.id}
                            className={`${SLOT_COLOR[a.recurso?.tipo] ?? 'slot-teal'} group relative`}
                            title={`${a.recurso?.nombre} · ${a.hora_inicio}–${a.hora_fin}`}
                          >
                            <div className="font-medium text-teal-900 text-xs leading-tight truncate">{a.recurso?.nombre?.split(' ')[0]}</div>
                            <div className="text-teal-700 text-xs">{a.hora_inicio}–{a.hora_fin}</div>
                            {a.auxiliar && <div className="text-teal-600 text-xs">Aux: {a.auxiliar?.nombre?.split(' ')[0]}</div>}
                            <div className="text-teal-600 text-xs">{a.pacientes_capacidad} pac.</div>
                            {a.es_horas_extras && <span className="text-amber-700 text-xs">⚠ extras</span>}
                            {canEdit && (
                              <button
                                className="absolute top-0.5 right-0.5 hidden group-hover:block text-gray-400 hover:text-red-500 text-xs"
                                onClick={() => eliminarAsig(a.id)}
                                title="Eliminar asignación"
                              >×</button>
                            )}
                          </div>
                        ))}
                        {asigs.length < 3 && canEdit && (
                          <div
                            className="slot-empty text-xs py-1"
                            onClick={() => setModalData({ consultorioId: cons.id, consultorio: cons, dia, semanaId: semanaActual.id })}
                          >
                            <span className="text-gray-300">+ asignar</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {[
          { cls: 'slot-teal',   label: 'Oftalmología / técnico' },
          { cls: 'slot-blue',   label: 'Anestesiología' },
          { cls: 'slot-purple', label: 'Optometría' },
          { cls: 'slot-amber',  label: 'Alerta / sin cubrir' },
        ].map((l) => (
          <div key={l.cls} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${l.cls.replace('slot-', 'bg-').replace('teal','teal-100').replace('blue','blue-100').replace('purple','purple-100').replace('amber','amber-100')} border`} />
            <span className="text-xs text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>

      {modalData && (
        <AsignacionModal
          data={modalData}
          sedeId={sedeId}
          onClose={() => setModalData(null)}
          onSaved={() => { qc.invalidateQueries(['asignaciones']); setModalData(null) }}
        />
      )}

      {showCierre && semanaActual && (() => {
        // Calcular resumen para el modal
        const consActivos = consultorios.filter((c) => c.activo)
        const consConAsig = new Set(asignaciones.map((a) => a.consultorio_id))
        const consSinAsig = consActivos.filter((c) => !consConAsig.has(c.id))
        const pacientesProg = asignaciones.reduce((acc, a) => acc + (a.pacientes_capacidad ?? 0), 0)
        const ociososList = recursos.filter((r) => ((r.horas_asignadas ?? 0) / (r.horas_max_semana ?? 42)) < 0.6)
        const resumen = {
          label_semana: semanaLabel(semanaBase),
          ocupacion_proyectada: ocupacion,
          consultorios_asignados: consActivos.length - consSinAsig.length,
          consultorios_totales: consActivos.length,
          asignaciones_total: asignaciones.length,
          pacientes_programados: pacientesProg,
          consultorios_sin_asignar: consSinAsig,
          recursos_ociosos: ociososList,
        }
        return <CerrarSemanaModal semana={semanaActual} resumen={resumen} onClose={() => setShowCierre(false)} />
      })()}
    </div>
  )
}
