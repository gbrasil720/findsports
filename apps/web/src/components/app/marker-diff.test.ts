import { describe, expect, it } from 'bun:test'

import {
  diffMarkerState,
  type MarkerVisualState,
  nenhumaMudanca
} from './marker-diff'

const base: MarkerVisualState = {
  lat: -23.5505,
  lng: -46.6333,
  name: 'Bar do Zé',
  accent: 'acid',
  large: false
}

describe('atualização de pinos do mapa (ESC-16)', () => {
  it('pino novo aplica tudo', () => {
    const u = diffMarkerState(undefined, base)
    expect(u).toEqual({
      position: true,
      title: true,
      icon: true,
      zIndex: true
    })
  })

  it('estado idêntico não aplica nada', () => {
    const u = diffMarkerState(base, { ...base })
    expect(nenhumaMudanca(u)).toBe(true)
  })

  it('hover muda só ícone e ordem de empilhamento', () => {
    const u = diffMarkerState(base, { ...base, large: true })
    expect(u).toEqual({
      position: false,
      title: false,
      icon: true,
      zIndex: true
    })
  })

  it('mudança de posição não mexe no ícone', () => {
    const u = diffMarkerState(base, { ...base, lat: -23.6 })
    expect(u.position).toBe(true)
    expect(u.icon).toBe(false)
    expect(u.title).toBe(false)
  })

  it('mudança de nome não mexe na posição', () => {
    const u = diffMarkerState(base, { ...base, name: 'Outro nome' })
    expect(u.title).toBe(true)
    expect(u.position).toBe(false)
  })

  it('mudança de cor troca o ícone, mas não a ordem', () => {
    const u = diffMarkerState(base, { ...base, accent: 'live' })
    expect(u.icon).toBe(true)
    expect(u.zIndex).toBe(false)
  })

  it('o caso que mais se repete — mouse passando pela lista — não toca nos outros pinos', () => {
    // Numa lista de 30 bares, mover o mouse muda o estado de dois pinos.
    // Os 28 restantes precisam sair com zero chamadas.
    const outros = Array.from({ length: 28 }, (_, i) => ({
      ...base,
      name: `Bar ${i}`,
      lat: base.lat + i / 1000
    }))
    const semMudanca = outros.filter((estado) =>
      nenhumaMudanca(diffMarkerState(estado, { ...estado }))
    )
    expect(semMudanca).toHaveLength(28)
  })
})
