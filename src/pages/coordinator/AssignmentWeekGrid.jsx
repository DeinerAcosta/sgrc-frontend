import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { DIAS, DIAS_LABEL, clsx } from '@/utils/helpers'
import { auxiliaresDeTurno } from '@/utils/matriz'

/**
 * LA GRILLA DEL PROGRAMADOR, AL LADO DEL FORMULARIO (nov-2026)
 * ============================================================
 *
 * Hector: la pantalla de asignar va "mitad asignar y mitad grilla". Es la
 * misma semana de la sede que se ve en el Programador (consultorios × días con
 * los turnos ya puestos), de solo lectura, con la casilla que se está llenando
 * resaltada y el turno nuevo pintado en vivo mientras se cambia el profesional
 * o las horas.
 *
 * Props: consultorios, asignaciones, diasFecha (7 fechas lun→dom), roomId y
 * dia (la casilla de este turno), asignacionId (al editar, para no pintarlo
 * dos veces), turno ({ profesional, ini, fin, auxiliares: [nombres] }).
 */

function nombreCorto(nombre) {
  if (!nombre) return ''
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return nombre
  return `${partes[0]} ${partes[partes.length === 4 ? 2 : 1]}`
}

export default function AssignmentWeekGrid({ consultorios = [], asignaciones = [], diasFecha = [], roomId, dia, asignacionId, turno }) {
  const filaRef = useRef(null)
  // Llevar a la vista la fila del consultorio que se está programando.
  useEffect(() => { filaRef.current?.scrollIntoView({ block: 'center' }) }, [roomId])

  const activos = consultorios
    .filter((c) => c.active)
    .slice()
    .sort((a, b) => {
      const ae = a.specialty === 'asesoria' ? 0 : 1
      const be = b.specialty === 'asesoria' ? 0 : 1
      return ae - be || a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
    })
  const otros = asignaciones.filter((a) => a.id !== asignacionId && a.status !== 'cancelada')
  // El domingo solo si tiene algo (o si es el día que se programa).
  const dias = DIAS.filter((d) => d !== 'domingo' || d === dia || otros.some((a) => a.weekday === 'domingo'))

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-700">
        Semana de la sede
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-500 min-w-[96px]">Consultorio</th>
              {dias.map((d) => {
                const i = DIAS.indexOf(d)
                return (
                  <th key={d} className={clsx('border-b border-gray-200 px-1 py-1.5 font-semibold min-w-[84px]', d === dia ? 'text-brand-700 bg-brand-50' : 'text-gray-500')}>
                    {DIAS_LABEL[i]} {diasFecha[i] ? format(diasFecha[i], 'd') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {activos.map((c) => {
              const esFila = c.id === roomId
              return (
                <tr key={c.id} ref={esFila ? filaRef : undefined} className="border-b border-gray-100 align-top">
                  <td className={clsx('sticky left-0 z-10 border-r border-gray-200 px-2 py-1.5', esFila ? 'bg-brand-50' : 'bg-white')}>
                    <div className="font-semibold text-gray-800 leading-tight">{c.name}</div>
                    <div className="text-gray-400 capitalize">{c.specialty}</div>
                  </td>
                  {dias.map((d) => {
                    const aqui = esFila && d === dia
                    const turnos = otros
                      .filter((a) => a.room_id === c.id && a.weekday === d)
                      .sort((x, y) => (x.start_time < y.start_time ? -1 : 1))
                    return (
                      <td key={d} className={clsx('px-1 py-1 space-y-1', aqui && 'bg-brand-50/60')}>
                        {turnos.map((a) => {
                          const ax = auxiliaresDeTurno(a)
                          return (
                            <div
                              key={a.id}
                              className={clsx(
                                'rounded border px-1.5 py-1 leading-tight',
                                a.contingency ? 'border-orange-300 bg-orange-50' : a.covered_absence_id ? 'border-blue-300 bg-blue-50' : 'border-green-200 bg-green-50',
                              )}
                              title={[a.resource?.name, `${a.start_time}–${a.end_time}`, ...ax.map((x, i) => `Aux ${i + 1}: ${x.name}`)].join('\n')}
                            >
                              <div className="font-medium text-gray-900 truncate">{nombreCorto(a.resource?.name)}</div>
                              <div className="text-gray-600 tabular-nums">{a.start_time}–{a.end_time}</div>
                              {ax.length > 0 && <div className="text-gray-500 truncate">Aux: {nombreCorto(ax[0].name)}{ax.length > 1 ? ` +${ax.length - 1}` : ''}</div>}
                            </div>
                          )
                        })}
                        {aqui && (
                          <div className="rounded border-2 border-brand-500 bg-white px-1.5 py-1 leading-tight shadow-sm">
                            <div className="text-[10px] font-semibold uppercase text-brand-600">Este turno</div>
                            <div className="font-medium text-gray-900 truncate">{turno?.profesional ? nombreCorto(turno.profesional) : '—'}</div>
                            <div className="text-gray-600 tabular-nums">{turno?.ini}–{turno?.fin}</div>
                            {turno?.auxiliares?.length > 0 && (
                              <div className="text-gray-500 truncate">Aux: {nombreCorto(turno.auxiliares[0])}{turno.auxiliares.length > 1 ? ` +${turno.auxiliares.length - 1}` : ''}</div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
