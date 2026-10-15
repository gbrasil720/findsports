import { describe, expect, it } from 'bun:test'
import { buildTrustedOrigins } from './trusted-origins'

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
