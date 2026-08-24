import { describe, expect, it } from 'bun:test'
import { buildTrustedOrigins } from './trusted-origins'

describe('origens confiáveis do auth', () => {
  it('confia somente na origem canônica em produção', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'https://onside.app/api/auth',
        nodeEnv: 'production',
        developmentOrigin: 'https://tunnel.ngrok-free.dev'
      })
    ).toEqual(['https://onside.app'])
  })

  it('aceita um túnel HTTPS exato somente em desenvolvimento', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'http://localhost:3001',
        nodeEnv: 'development',
        developmentOrigin: 'https://tunnel.ngrok-free.dev'
      })
    ).toEqual(['http://localhost:3001', 'https://tunnel.ngrok-free.dev'])
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
