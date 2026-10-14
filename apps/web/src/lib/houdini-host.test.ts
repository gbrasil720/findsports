import { describe, expect, it } from 'bun:test'

import {
  appHref,
  houdiniHref,
  houdiniRewriteInput,
  houdiniRewriteOutput,
  isPublicAppHost
} from './houdini-host'

const input = (href: string) => houdiniRewriteInput(new URL(href))?.href
const output = (href: string) => houdiniRewriteOutput(new URL(href))?.href

describe('rewrite do host do Houdini', () => {
  it('põe o prefixo nas páginas e deixa a API como está', () => {
    expect(input('https://houdini.onside.sh/')).toBe(
      'https://houdini.onside.sh/houdini'
    )
    expect(input('https://houdini.onside.sh/pessoas?q=a')).toBe(
      'https://houdini.onside.sh/houdini/pessoas?q=a'
    )
    expect(input('https://houdini.onside.sh/api/trpc/x')).toBeUndefined()
    expect(input('https://houdini.onside.sh/houdini/pessoas')).toBeUndefined()
  })

  it('não mexe em outro host', () => {
    expect(input('https://www.onside.sh/pessoas')).toBeUndefined()
    expect(output('https://www.onside.sh/houdini/pessoas')).toBeUndefined()
  })

  it('tira o prefixo na saída', () => {
    expect(output('https://houdini.onside.sh/houdini')).toBe(
      'https://houdini.onside.sh/'
    )
    expect(output('https://houdini.onside.sh/houdini/bares')).toBe(
      'https://houdini.onside.sh/bares'
    )
  })
})

describe('endereços entre o app e o Houdini', () => {
  it('reconhece o domínio público', () => {
    expect(isPublicAppHost('www.onside.sh')).toBe(true)
    expect(isPublicAppHost('onside.sh')).toBe(true)
    expect(isPublicAppHost('houdini.onside.sh')).toBe(false)
    expect(isPublicAppHost('onside-web-preview.x.workers.dev')).toBe(false)
    expect(isPublicAppHost('localhost')).toBe(false)
  })

  it('leva do Houdini para o app', () => {
    expect(appHref('/login', new URL('https://houdini.onside.sh/'))).toBe(
      'https://www.onside.sh/login'
    )
    expect(appHref('/admin', new URL('http://houdini.localhost:3001/'))).toBe(
      'http://localhost:3001/admin'
    )
    expect(appHref('/admin', new URL('http://localhost:3001/houdini'))).toBe(
      '/admin'
    )
  })

  it('leva do app para o Houdini', () => {
    expect(
      houdiniHref('/houdini/pessoas', new URL('https://www.onside.sh/x'))
    ).toBe('https://houdini.onside.sh/pessoas')
    expect(
      houdiniHref('/houdini/pessoas', new URL('https://preview.workers.dev/'))
    ).toBe('/houdini/pessoas')
  })
})
