import { describe, expect, it } from 'bun:test'

import { decideHoudiniGate, type GateSession } from './houdini-gate'

function session(
  role: string,
  { twoFactor = true, impersonatedBy = null as string | null } = {}
): GateSession {
  return {
    user: {
      role,
      name: 'Ana',
      email: 'ana@x.test',
      twoFactorEnabled: twoFactor
    },
    session: { impersonatedBy }
  }
}

const HOUDINI = new URL('https://houdini.onside.sh/houdini/pessoas')
const WWW = new URL('https://www.onside.sh/houdini')
const PREVIEW = new URL('https://onside-web-preview.x.workers.dev/houdini')

describe('portão do Houdini', () => {
  it('esconde o Houdini de quem não é admin', () => {
    expect(decideHoudiniGate(HOUDINI, session('fan')).kind).toBe('hidden')
    expect(decideHoudiniGate(HOUDINI, session('pub')).kind).toBe('hidden')
    expect(decideHoudiniGate(PREVIEW, session('pub')).kind).toBe('hidden')
  })

  it('visitante só vê a Entrada, que leva ao login do www', () => {
    expect(decideHoudiniGate(HOUDINI, null)).toEqual({
      kind: 'visitor',
      loginHref: 'https://www.onside.sh/login?callbackUrl=%2Fhoudini'
    })
    expect(decideHoudiniGate(PREVIEW, null)).toEqual({
      kind: 'visitor',
      loginHref: '/login?callbackUrl=%2Fhoudini'
    })
  })

  it('exige 2FA do admin', () => {
    expect(
      decideHoudiniGate(HOUDINI, session('admin', { twoFactor: false }))
    ).toEqual({ kind: 'needs2fa', env: 'produção' })
    expect(decideHoudiniGate(HOUDINI, session('admin'))).toEqual({
      kind: 'ok',
      env: 'produção'
    })
    expect(decideHoudiniGate(PREVIEW, session('admin'))).toEqual({
      kind: 'ok',
      env: 'preview'
    })
  })

  it('no domínio público, só admin é mandado ao host próprio', () => {
    expect(decideHoudiniGate(WWW, session('admin'))).toEqual({
      kind: 'blocked',
      redirectTo: 'https://houdini.onside.sh/'
    })
    expect(decideHoudiniGate(WWW, session('fan'))).toEqual({
      kind: 'blocked',
      redirectTo: null
    })
    expect(decideHoudiniGate(WWW, null)).toEqual({
      kind: 'blocked',
      redirectTo: null
    })
  })

  it('sessão impersonada não entra: só oferece tirar a pele', () => {
    const pele = session('fan', { impersonatedBy: 'admin-1' })
    expect(decideHoudiniGate(HOUDINI, pele).kind).toBe('impersonating')
    expect(decideHoudiniGate(WWW, pele)).toEqual({
      kind: 'blocked',
      redirectTo: null
    })
  })
})
