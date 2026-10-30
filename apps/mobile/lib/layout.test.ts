import { describe, expect, test } from 'bun:test'
import { classify, locksPortrait } from './layout'

// Medidas dos aparelhos do design (gen/adapt-dev.js), em pt e dp.
const ios = (width: number, height: number, isPad = false) =>
  classify({ width, height, os: 'ios', isPad })
const android = (width: number, height: number) =>
  classify({ width, height, os: 'android', isPad: false })

describe('classify', () => {
  test('celular e capas ficam no layout de sempre', () => {
    expect(ios(390, 844)).toMatchObject({ kind: 'phone', nav: 'tabs' })
    expect(ios(440, 956)).toMatchObject({ kind: 'phone', nav: 'tabs' })
    expect(android(475, 760)).toMatchObject({ kind: 'phone', nav: 'tabs' })
    expect(android(411, 960)).toMatchObject({ kind: 'phone', nav: 'tabs' })
  })

  test('iPhone Duo: faixa da direita, fechado e aberto', () => {
    expect(ios(466, 678)).toMatchObject({ kind: 'duoClosed', nav: 'duoRail' })
    expect(ios(951, 669)).toMatchObject({ kind: 'split', nav: 'duoRail' })
  })

  test('iPad: em pé empilha, deitado divide, barra flutuante', () => {
    expect(ios(744, 1133, true)).toMatchObject({ kind: 'stack', nav: 'float' })
    expect(ios(1133, 744, true)).toMatchObject({
      kind: 'split',
      nav: 'float',
      split: 370,
      wide: false
    })
    expect(ios(1180, 820, true)).toMatchObject({ split: 400, wide: false })
    expect(ios(1376, 1032, true)).toMatchObject({ split: 440, wide: true })
    // A iPad 13″ em pé é tão quadrada quanto um Fold, mas não dobra.
    expect(ios(1032, 1376, true)).toMatchObject({ kind: 'stack' })
  })

  test('Galaxy Tab: rail à esquerda', () => {
    expect(android(800, 1280)).toMatchObject({ kind: 'stack', nav: 'rail' })
    expect(android(1480, 924)).toMatchObject({
      kind: 'split',
      nav: 'rail',
      wide: true
    })
  })

  test('Fold aberto divide na dobra, com a barra flutuante', () => {
    expect(android(704, 932)).toMatchObject({
      kind: 'split',
      nav: 'float',
      split: 352
    })
    expect(android(859, 954)).toMatchObject({ kind: 'split', split: 430 })
  })

  test('iPad em Split View estreito vira celular', () => {
    expect(ios(320, 1032, true)).toMatchObject({ kind: 'phone', nav: 'tabs' })
  })
})

test('locksPortrait: só o celular trava', () => {
  expect(locksPortrait({ width: 390, height: 844 })).toBe(true)
  expect(locksPortrait({ width: 475, height: 760 })).toBe(true)
  expect(locksPortrait({ width: 704, height: 932 })).toBe(false)
  expect(locksPortrait({ width: 1032, height: 1376 })).toBe(false)
})
