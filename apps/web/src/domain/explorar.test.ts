import { describe, expect, test } from 'bun:test'
import {
  type BarDoJogo,
  baresDoJogo,
  diasDaRegua,
  distancia,
  estadoDoJogo,
  type JogoDaRegua,
  jogoInicial,
  jogosDaBusca,
  regua
} from './explorar'

const bar = (over: Partial<BarDoJogo>): BarDoJogo => ({
  eventId: 'e',
  barId: 'b',
  name: 'Bar',
  neighborhood: 'Pinheiros',
  photoUrl: null,
  latitude: 0,
  longitude: 0,
  distanceKm: 1,
  elite: false,
  amenities: [],
  onBigScreen: false,
  withSound: false,
  offer: null,
  rating: null,
  closes: null,
  attendanceEnabled: true,
  going: null,
  ...over
})
// 21:30 e 23:00 de Brasília em 7/11/2026 (UTC-3).
const jogo = (
  key: string,
  startsAt: string,
  bars: BarDoJogo[] = []
): JogoDaRegua => ({
  key,
  title: key,
  championship: 'Brasileirão',
  startsAt,
  endsAt: null,
  bars
})

describe('explorar', () => {
  test('dias da régua: hoje, amanhã e os dois seguintes', () => {
    expect(diasDaRegua('2026-11-05').map((d) => d.rotulo)).toEqual([
      'Hoje',
      'Amanhã',
      'Sáb 7',
      'Dom 8'
    ])
  })

  test('estado e jogo inicial: o ao vivo antes do próximo', () => {
    const now = Date.parse('2026-11-08T00:45:00Z') // 21:45 de Brasília
    const fla = jogo('Fla × Pal', '2026-11-08T00:30:00Z')
    const nba = jogo('Lakers × Celtics', '2026-11-08T02:00:00Z')
    const velho = jogo('Real × City', '2026-11-07T20:00:00Z')
    expect(estadoDoJogo(fla, now)).toBe('live')
    expect(estadoDoJogo(nba, now)).toBe('next')
    expect(estadoDoJogo(velho, now)).toBe('past')
    expect(jogoInicial([velho, nba, fla], undefined, now)?.key).toBe(
      'Fla × Pal'
    )
    expect(jogoInicial([velho, nba, fla], 'Real × City', now)?.key).toBe(
      'Real × City'
    )
  })

  test('régua: 16h às 2h e faixa nova quando os jogos se cruzam', () => {
    const r = regua(
      [
        jogo('a', '2026-11-08T00:30:00Z'),
        jogo('b', '2026-11-08T01:00:00Z'),
        jogo('c', '2026-11-08T04:00:00Z')
      ],
      '2026-11-07',
      Date.parse('2026-11-07T23:00:00Z')
    )
    expect(r.horas[0]?.hora).toBe(16)
    expect(r.horas.at(-1)?.hora).toBe(4) // o jogo da 1h vai até as 4h
    expect(r.faixas.map((f) => f.lane)).toEqual([0, 1, 0])
    expect(r.agora).not.toBeNull()
  })

  test('filtro, busca e ordem dos bares de um jogo', () => {
    const j = jogo('Fla × Pal', '2026-11-08T00:30:00Z', [
      bar({ barId: 'perto', distanceKm: 0.4, amenities: [1] }),
      bar({
        barId: 'cheio',
        distanceKm: 2,
        amenities: [1, 4],
        going: { count: 30, initials: [] }
      }),
      bar({ barId: 'oferta', name: 'Zé', distanceKm: 1, offer: 'Chopp' })
    ])
    const ids = (o: Parameters<typeof baresDoJogo>[1]) =>
      baresDoJogo(j, o).map((b) => b.barId)
    const base = {
      amenities: [],
      oferta: false,
      busca: '',
      ordem: 'perto' as const
    }
    expect(ids(base)).toEqual(['perto', 'oferta', 'cheio'])
    expect(ids({ ...base, ordem: 'gente' })[0]).toBe('cheio')
    expect(ids({ ...base, amenities: [1, 4] })).toEqual(['cheio'])
    expect(ids({ ...base, oferta: true })).toEqual(['oferta'])
    expect(ids({ ...base, busca: 'ze' })).toEqual(['oferta'])
    expect(ids({ ...base, busca: 'fla' })).toHaveLength(3)
    expect(jogosDaBusca([j], 'palmeiras')).toHaveLength(0)
    expect(jogosDaBusca([j], 'zé')).toHaveLength(1)
  })

  test('distância em metros ou km', () => {
    expect(distancia(0.45)).toBe('450 m')
    expect(distancia(1.234)).toBe('1,2 km')
  })
})
