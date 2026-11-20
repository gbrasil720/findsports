import { describe, expect, it } from 'bun:test'
import {
  APP_SCHEME,
  buildTrustedOrigins,
  isForeignPost,
  isSafeResetRedirect,
  resetRedirectTarget
} from './trusted-origins'

describe('origens confiáveis do auth', () => {
  it('confia na origem canônica e no par www em produção', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'https://onside.sh/api/auth',
        nodeEnv: 'production',
        developmentOrigin: 'https://tunnel.ngrok-free.dev'
      })
    ).toEqual([
      'https://onside.sh',
      'https://www.onside.sh',
      'https://houdini.onside.sh'
    ])
  })

  it('aceita um túnel HTTPS exato somente em desenvolvimento', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'http://localhost:3001',
        nodeEnv: 'development',
        developmentOrigin: 'https://tunnel.ngrok-free.dev'
      })
    ).toEqual([
      'http://localhost:3001',
      'http://houdini.localhost:3001',
      'https://tunnel.ngrok-free.dev'
    ])
  })

  it('não confia no Houdini fora do domínio da Onside', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'https://onside-web-preview.x.workers.dev',
        nodeEnv: 'production'
      })
    ).not.toContain('https://houdini.onside.sh')
  })

  it('confia no esquema do app nativo, e nas origens do Expo só em desenvolvimento', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'https://onside.sh/api/auth',
        nodeEnv: 'production',
        appScheme: 'onside'
      })
    ).toEqual([
      'https://onside.sh',
      'https://www.onside.sh',
      'https://houdini.onside.sh',
      'onside://'
    ])

    expect(
      buildTrustedOrigins({
        baseUrl: 'http://localhost:3001',
        nodeEnv: 'development',
        appScheme: 'onside'
      })
    ).toEqual([
      'http://localhost:3001',
      'http://houdini.localhost:3001',
      'onside://',
      'exp://',
      'http://localhost:8081'
    ])
  })

  it('recusa origem insegura ou wildcard', () => {
    for (const developmentOrigin of [
      'http://tunnel.ngrok-free.dev',
      'https://*.ngrok-free.dev'
    ]) {
      expect(() =>
        buildTrustedOrigins({
          baseUrl: 'http://localhost:3001',
          nodeEnv: 'development',
          developmentOrigin
        })
      ).toThrow()
    }
  })
})

describe('destino do link de redefinição de senha', () => {
  const origins = buildTrustedOrigins({
    baseUrl: 'https://www.onside.sh/api/auth',
    nodeEnv: 'production',
    appScheme: APP_SCHEME
  })

  it('aceita caminho do site e origem https confiável', () => {
    expect(isSafeResetRedirect('/reset-password', origins)).toBe(true)
    expect(
      isSafeResetRedirect('https://www.onside.sh/reset-password', origins)
    ).toBe(true)
    expect(
      isSafeResetRedirect('https://onside.sh/reset-password', origins)
    ).toBe(true)
    expect(isSafeResetRedirect(undefined, origins)).toBe(true)
  })

  it('recusa o esquema do app, mesmo confiável para o resto do auth', () => {
    expect(origins).toContain('onside://')
    expect(isSafeResetRedirect('onside://reset-password', origins)).toBe(false)
    expect(isSafeResetRedirect('onside://x?y=1', origins)).toBe(false)
    expect(isSafeResetRedirect('exp://127.0.0.1:8081/--/x', origins)).toBe(
      false
    )
  })

  it('recusa host de fora e caminho que vira outro host', () => {
    expect(isSafeResetRedirect('https://evil.example/reset', origins)).toBe(
      false
    )
    expect(isSafeResetRedirect('//evil.example/reset', origins)).toBe(false)
    expect(isSafeResetRedirect('/\\evil.example', origins)).toBe(false)
    expect(isSafeResetRedirect('http://www.onside.sh/reset', origins)).toBe(
      false
    )
    expect(isSafeResetRedirect(42, origins)).toBe(false)
  })
})

describe('destino do reset que vale de fato', () => {
  const origins = buildTrustedOrigins({
    baseUrl: 'https://www.onside.sh/api/auth',
    nodeEnv: 'production',
    appScheme: APP_SCHEME
  })

  it('mantém o seguro, troca o esquema do app pelo site e recusa o resto', () => {
    expect(resetRedirectTarget('/reset-password', origins)).toEqual({
      keep: true
    })
    expect(resetRedirectTarget('onside://reset-password', origins)).toEqual({
      replace: '/reset-password'
    })
    expect(resetRedirectTarget('exp://127.0.0.1:8081/--/x', origins)).toEqual({
      replace: '/reset-password'
    })
    expect(resetRedirectTarget('https://evil.example/r', origins)).toBeNull()
    expect(resetRedirectTarget('//evil.example/r', origins)).toBeNull()
  })
})

describe('origem do POST no tRPC', () => {
  const trusted = buildTrustedOrigins({
    baseUrl: 'https://www.onside.sh',
    nodeEnv: 'production',
    appScheme: APP_SCHEME
  })

  it('recusa POST de outro site, inclusive Origin null', () => {
    expect(isForeignPost('POST', 'https://evil.example', trusted)).toBe(true)
    expect(
      isForeignPost('post', 'https://onside.sh.evil.example', trusted)
    ).toBe(true)
    expect(isForeignPost('POST', 'null', trusted)).toBe(true)
  })

  it('aceita o site, o apex, o Houdini e o POST sem Origin (app, servidor)', () => {
    expect(isForeignPost('POST', 'https://www.onside.sh', trusted)).toBe(false)
    expect(isForeignPost('POST', 'https://onside.sh', trusted)).toBe(false)
    expect(isForeignPost('POST', 'https://houdini.onside.sh', trusted)).toBe(
      false
    )
    expect(isForeignPost('POST', null, trusted)).toBe(false)
  })

  it('não mexe no GET (consultas)', () => {
    expect(isForeignPost('GET', 'https://evil.example', trusted)).toBe(false)
  })

  it('aceita preview, dev local e E2E pela própria base', () => {
    const preview = 'https://onside-web-preview.x.workers.dev'
    expect(
      isForeignPost(
        'POST',
        preview,
        buildTrustedOrigins({ baseUrl: preview, nodeEnv: 'production' })
      )
    ).toBe(false)
    const dev = buildTrustedOrigins({
      baseUrl: 'http://localhost:3001',
      nodeEnv: 'development',
      appScheme: APP_SCHEME
    })
    expect(isForeignPost('POST', 'http://localhost:3001', dev)).toBe(false)
    expect(isForeignPost('POST', 'http://houdini.localhost:3001', dev)).toBe(
      false
    )
    expect(isForeignPost('POST', 'http://localhost:8081', dev)).toBe(false)
    const e2e = 'http://127.0.0.1:3201'
    expect(
      isForeignPost(
        'POST',
        e2e,
        buildTrustedOrigins({ baseUrl: e2e, nodeEnv: 'production' })
      )
    ).toBe(false)
  })
})
