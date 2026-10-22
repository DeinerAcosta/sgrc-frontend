import { describe, it, expect } from 'vitest'
import { pacientesDelTramo, horaDeCorte } from './tramos'

const franja = { desde: '07:00', hasta: '13:00' }

describe('horaDeCorte', () => {
  it('10 de 16 pacientes entre 07:00 y 13:00 terminan a las 10:45', () => {
    expect(horaDeCorte(16, franja, '07:00', 10)).toBe('10:45')
  })

  it('el tramo que sale tiene exactamente los pacientes pedidos', () => {
    for (let n = 1; n < 16; n++) {
      const hasta = horaDeCorte(16, franja, '07:00', n)
      expect(pacientesDelTramo(16, franja, { desde: '07:00', hasta })).toBe(n)
    }
  })

  it('dos médicos que se reparten la agenda suman todos los pacientes', () => {
    const corte = horaDeCorte(16, franja, '07:00', 7)
    const primero = pacientesDelTramo(16, franja, { desde: '07:00', hasta: corte })
    const segundo = pacientesDelTramo(16, franja, { desde: corte, hasta: '13:00' })
    expect(primero).toBe(7)
    expect(primero + segundo).toBe(16)
  })

  it('desde la mitad de la franja también cuadra', () => {
    const corte = horaDeCorte(16, franja, '10:45', 3)
    expect(pacientesDelTramo(16, franja, { desde: '10:45', hasta: corte })).toBe(3)
  })

  it('con muchos pacientes por hora sigue dando el número exacto', () => {
    const corta = { desde: '08:00', hasta: '10:00' }
    for (let n = 1; n < 40; n++) {
      const hasta = horaDeCorte(40, corta, '08:00', n)
      expect(pacientesDelTramo(40, corta, { desde: '08:00', hasta })).toBe(n)
    }
  })

  it('tomarlos todos llega al final de la franja', () => {
    expect(horaDeCorte(16, franja, '07:00', 16)).toBe('13:00')
  })
})
