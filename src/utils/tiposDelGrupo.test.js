import { describe, it, expect } from 'vitest'
import { tiposDelGrupo } from './helpers'

const motivo = (code, isPaid, extra = {}) => ({ id: `id-${code}`, code, name: `Motivo ${code}`, is_paid: isPaid, active: true, ...extra })

describe('tiposDelGrupo · los grupos salen del catálogo (22-oct)', () => {
  const produccion = [
    motivo('enfermedad', true), motivo('vacaciones', true), motivo('licencia_remunerada', true),
    motivo('licencia_no_remunerada', false), motivo('no_presentacion', false),
    motivo('medico_sin_acompanamiento_del_tutor', false),
  ]

  it('un motivo nuevo sale en su grupo (antes no salía en ninguno)', () => {
    const no = tiposDelGrupo('no_remunerada', produccion)
    const nuevo = no.find((t) => t.code === 'medico_sin_acompanamiento_del_tutor')
    expect(nuevo).toMatchObject({ value: 'otra', id: 'id-medico_sin_acompanamiento_del_tutor' })
    expect(tiposDelGrupo('remunerada', produccion).some((t) => t.code === 'medico_sin_acompanamiento_del_tutor')).toBe(false)
  })

  it('si el catálogo dice que es remunerado, va en Remunerada', () => {
    const rem = tiposDelGrupo('remunerada', [...produccion, motivo('calamidad', true)])
    expect(rem.find((t) => t.code === 'calamidad')).toMatchObject({ value: 'calamidad', id: 'id-calamidad' })
  })

  it('los tipos base que el catálogo no trae siguen saliendo: el grupo nunca queda vacío', () => {
    const local = [motivo('cambio_horario', false), motivo('retraso_inicio', false)]
    const rem = tiposDelGrupo('remunerada', local)
    expect(rem.map((t) => t.code)).toEqual(expect.arrayContaining(['enfermedad', 'calamidad', 'vacaciones']))
  })

  it('un motivo inactivo no sale', () => {
    const rem = tiposDelGrupo('no_remunerada', [motivo('formato', false, { active: false })])
    expect(rem.some((t) => t.code === 'formato')).toBe(false)
  })

  it('no ofrece "Licencia remunerada" ni "Licencia no remunerada": ya lo dice el grupo', () => {
    const todos = [...tiposDelGrupo('remunerada', produccion), ...tiposDelGrupo('no_remunerada', produccion), ...tiposDelGrupo('remunerada', [])]
    expect(todos.some((t) => t.code === 'licencia_remunerada' || t.code === 'licencia_no_remunerada')).toBe(false)
  })

  it('un motivo del sistema eliminado del catálogo no vuelve a salir', () => {
    const sinVacaciones = produccion.filter((m) => m.code !== 'vacaciones')
    expect(tiposDelGrupo('remunerada', sinVacaciones).some((t) => t.code === 'vacaciones')).toBe(false)
  })

  it('sin catálogo, usa la lista fija', () => {
    expect(tiposDelGrupo('remunerada', []).length).toBeGreaterThan(0)
  })
})
