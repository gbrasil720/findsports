import { describe, expect, it } from 'bun:test'

import { pmtiles_path, tile_path } from './tile-path'

describe('pmtiles_path (WEB-218)', () => {
  it('acrescenta .pmtiles quando não há template', () => {
    expect(pmtiles_path('foo')).toBe('foo.pmtiles')
  })

  it('substitui {name} no template do bucket', () => {
    expect(pmtiles_path('onside-br-20260906', 'maps/{name}.pmtiles')).toBe(
      'maps/onside-br-20260906.pmtiles'
    )
  })
})

describe('tile_path (WEB-218)', () => {
  it('parseia tile MVT', () => {
    expect(tile_path('/onside-br-20260906/14/4823/6156.mvt')).toEqual({
      ok: true,
      name: 'onside-br-20260906',
      tile: [14, 4823, 6156],
      ext: 'mvt'
    })
  })

  it('parseia TileJSON', () => {
    expect(tile_path('/onside-br-20260906.json')).toEqual({
      ok: true,
      name: 'onside-br-20260906',
      ext: 'json'
    })
  })

  it('recusa caminho inválido', () => {
    expect(tile_path('/maps/onside-br-20260906.pmtiles')).toMatchObject({
      ok: false
    })
    expect(tile_path('/')).toMatchObject({ ok: false })
  })
})
