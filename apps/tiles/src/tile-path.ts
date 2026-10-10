/**
 * Parsing de URL do Worker de tiles (WEB-218).
 *
 * Espelha `serverless/shared/index.ts` do repositório PMTiles — mantido aqui
 * para testar sem puxar o monólito deles.
 */

export const pmtiles_path = (name: string, setting?: string): string => {
  if (setting) {
    return setting.replaceAll('{name}', name)
  }
  return `${name}.pmtiles`
}

const TILE =
  /^\/(?<NAME>[0-9a-zA-Z/!\-_.*'()]+)\/(?<Z>\d+)\/(?<X>\d+)\/(?<Y>\d+).(?<EXT>[a-z]+)$/

const TILESET = /^\/(?<NAME>[0-9a-zA-Z/!\-_.*'()]+).json$/

export const tile_path = (
  path: string
): {
  ok: boolean
  name: string
  tile?: [number, number, number]
  ext: string
} => {
  const tile_match = path.match(TILE)

  if (tile_match?.groups) {
    const { NAME, Z, X, Y, EXT } = tile_match.groups
    if (NAME && Z && X && Y && EXT) {
      return { ok: true, name: NAME, tile: [+Z, +X, +Y], ext: EXT }
    }
  }

  const tileset_match = path.match(TILESET)

  if (tileset_match?.groups?.NAME) {
    return { ok: true, name: tileset_match.groups.NAME, ext: 'json' }
  }

  return { ok: false, name: '', tile: [0, 0, 0], ext: '' }
}
