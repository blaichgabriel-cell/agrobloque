/** @jest-environment node */

import { moonPhase } from './moon'

// Fechas y horas UTC publicadas por el Astronomical Applications Department
// del U.S. Naval Observatory para noviembre de 2026.
describe('fases lunares frente a efemérides USNO', () => {
  test.each([
    ['2026-11-01T20:28:00Z', 'Cuarto menguante', 0.5],
    ['2026-11-09T07:02:00Z', 'Luna nueva', 0],
    ['2026-11-17T11:48:00Z', 'Cuarto creciente', 0.5],
    ['2026-11-24T14:53:00Z', 'Luna llena', 1],
  ])('%s corresponde a %s', (fecha, etiqueta, iluminacionEsperada) => {
    const fase = moonPhase(new Date(fecha))
    expect(fase.label).toBe(etiqueta)
    expect(Math.abs(fase.fraction - iluminacionEsperada)).toBeLessThan(0.02)
  })

  test('el 13 de noviembre de 2026 está en creciente', () => {
    expect(moonPhase(new Date('2026-11-13T15:00:00Z')).label).toBe('Creciente')
  })
})
