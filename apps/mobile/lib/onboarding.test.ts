import { describe, expect, test } from 'bun:test'
import { classify } from './layout'
import { coverNote, frameOf, stepOf } from './onboarding'

const frame = (
  width: number,
  height: number,
  os: 'ios' | 'android',
  extra: Partial<Parameters<typeof classify>[0]> = {}
) => {
  const layout = classify({ width, height, os, isPad: os === 'ios', ...extra })
  const fold = layout.gap > 0 || (os === 'android' && layout.nav === 'float')
  return frameOf(layout, fold)
}

describe('stepOf', () => {
  test('o passo pela rota', () => {
    expect(stepOf('/onboarding')).toBe(0)
    expect(stepOf('/onboarding/sports')).toBe(1)
    expect(stepOf('/onboarding/teams')).toBe(2)
    expect(stepOf('/onboarding/review')).toBe(5)
    expect(stepOf('/outra')).toBe(0)
  })
})

describe('frameOf', () => {
  test('celular e Duo fechado ficam como sempre', () => {
    expect(frame(390, 844, 'ios', { isPad: false })).toEqual({ kind: 'phone' })
    expect(frame(466, 678, 'ios', { isPad: false })).toEqual({ kind: 'phone' })
  })

  test('tablet deitado: painel de 42% (40% no 13″), coluna até 470', () => {
    expect(frame(1133, 744, 'ios')).toEqual({
      kind: 'side',
      panel: 476,
      pane: 657,
      column: 470
    })
    expect(frame(1376, 1032, 'ios')).toMatchObject({ panel: 550 })
  })

  test('dobrável aberto: o painel vai até a dobra', () => {
    expect(frame(704, 932, 'android')).toEqual({
      kind: 'side',
      panel: 352,
      pane: 352,
      column: 340
    })
  })

  test('tablet em pé: faixa de 30% da altura, coluna até 540', () => {
    expect(frame(744, 1133, 'ios')).toEqual({
      kind: 'band',
      band: 340,
      column: 540
    })
    expect(frame(800, 1280, 'android')).toMatchObject({ band: 384 })
  })

  test('mesa: a metade de cima e a dobra', () => {
    expect(
      frame(932, 704, 'android', {
        posture: {
          state: 'half',
          orientation: 'horizontal',
          hinge: { x: 0, y: 338, width: 932, height: 28 }
        }
      })
    ).toEqual({ kind: 'table', top: 338, gap: 28, column: 884 })
  })

  test('tela de fora do Flip', () => {
    expect(frame(360, 400, 'android')).toEqual({ kind: 'cover' })
  })
})

describe('coverNote', () => {
  test('o que está salvo e o que falta', () => {
    expect(coverNote(['Futebol', 'Basquete', 'Fórmula 1'], 2)).toBe(
      'Futebol, Basquete e F1 salvos. Falta escolher os times.'
    )
    expect(coverNote(['Vôlei'], 3)).toBe(
      'Vôlei salvo. Falta escolher a distância.'
    )
    expect(coverNote([], 1)).toBe('Falta escolher os esportes.')
  })
})
