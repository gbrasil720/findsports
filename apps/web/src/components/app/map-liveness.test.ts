import { describe, expect, it } from 'bun:test'

import { isMapaVivo } from './map-liveness'

function mapa(getDiv: () => unknown): google.maps.Map {
  return { getDiv } as unknown as google.maps.Map
}

describe('mapa vivo', () => {
  it('sem mapa não há o que tocar', () => {
    expect(isMapaVivo(null)).toBe(false)
    expect(isMapaVivo(undefined)).toBe(false)
  })

  it('mapa cujo contêiner sumiu do documento está morto', () => {
    // É este o estado depois de o React desmontar a rota: a instância continua
    // na ref, o `<div>` não está mais no documento.
    expect(isMapaVivo(mapa(() => ({ isConnected: false })))).toBe(false)
  })

  it('mapa sem contêiner nenhum está morto', () => {
    // O caso exato do bug: `getDiv()` devolve `undefined` e o SDK faria
    // `undefined.getRootNode()`.
    expect(isMapaVivo(mapa(() => undefined))).toBe(false)
    expect(isMapaVivo(mapa(() => null))).toBe(false)
  })

  it('mapa que lança ao pedir o contêiner está morto', () => {
    expect(
      isMapaVivo(
        mapa(() => {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'div')"
          )
        })
      )
    ).toBe(false)
  })

  it('mapa com contêiner no documento está vivo', () => {
    expect(isMapaVivo(mapa(() => ({ isConnected: true })))).toBe(true)
  })
})
