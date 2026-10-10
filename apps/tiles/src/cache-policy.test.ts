import { describe, expect, it } from 'bun:test'

import { chaveDeCache, podeGravarNoCache } from './cache-policy'

describe('cache-policy (WEB-218)', () => {
  it('usa a URL inteira como chave — um tile por entrada', () => {
    const a = 'https://tiles.onside.sh/onside-br-20260906/10/1/2.mvt'
    const b = 'https://tiles.onside.sh/onside-br-20260906/10/1/3.mvt'
    expect(chaveDeCache(a)).toBe(a)
    expect(chaveDeCache(a)).not.toBe(chaveDeCache(b))
  })

  it('só grava resposta 200 no Cache API', () => {
    expect(podeGravarNoCache(200)).toBe(true)
    expect(podeGravarNoCache(204)).toBe(false)
    expect(podeGravarNoCache(206)).toBe(false)
    expect(podeGravarNoCache(404)).toBe(false)
  })
})
