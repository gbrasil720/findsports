import { describe, expect, it } from 'bun:test'
import { canFavoriteBars, shellVariantForViewer } from './viewer'

describe('shellVariantForViewer', () => {
  it('dá ao torcedor o cabeçalho de torcedor', () => {
    expect(shellVariantForViewer('fan')).toBe('fan')
  })

  it('dá ao dono de bar o cabeçalho de bar', () => {
    expect(shellVariantForViewer('pub')).toBe('pub')
  })

  it('trata admin como visitante neutro', () => {
    expect(shellVariantForViewer('admin')).toBe('public')
  })

  it('trata sessão ausente como visitante neutro', () => {
    expect(shellVariantForViewer(null)).toBe('public')
    expect(shellVariantForViewer(undefined)).toBe('public')
  })

  it('não confia em papel desconhecido', () => {
    expect(shellVariantForViewer('moderator')).toBe('public')
  })
})

describe('canFavoriteBars', () => {
  it('libera só para torcedor', () => {
    expect(canFavoriteBars('fan')).toBe(true)
  })

  it('bloqueia dono de bar, admin e anônimo', () => {
    expect(canFavoriteBars('pub')).toBe(false)
    expect(canFavoriteBars('admin')).toBe(false)
    expect(canFavoriteBars(null)).toBe(false)
  })
})
