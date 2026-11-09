import { describe, expect, it } from 'bun:test'
import {
  canFavoriteBars,
  canRecordCommercialEvents,
  shellVariantForViewer
} from './viewer'

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

describe('canRecordCommercialEvents', () => {
  it('libera só para torcedor na própria sessão', () => {
    expect(canRecordCommercialEvents('fan')).toBe(true)
    expect(canRecordCommercialEvents('fan', null)).toBe(true)
  })

  it('bloqueia dono de bar, admin, anônimo e sessão personificada', () => {
    expect(canRecordCommercialEvents('pub')).toBe(false)
    expect(canRecordCommercialEvents('admin')).toBe(false)
    expect(canRecordCommercialEvents(null)).toBe(false)
    expect(canRecordCommercialEvents(undefined)).toBe(false)
    expect(canRecordCommercialEvents('fan', 'admin-1')).toBe(false)
  })
})
