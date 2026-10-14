import { describe, expect, test } from 'bun:test'
import {
  impersonationModeFrom,
  isAuthWrite,
  isReadOnlyImpersonation
} from './impersonation-mode'

const skin = { session: { id: 's1', impersonatedBy: 'admin-1' } }
const cookie = (value: string) =>
  new Headers({ cookie: `outro=x; onside_impersonation_mode=${value}` })

describe('modo da pele (WEB-390)', () => {
  test('só "Pode agir" desta sessão libera; o resto é "Só olhar"', () => {
    const mode = (header: string | null) => impersonationModeFrom(header, 's1')
    expect(mode('onside_impersonation_mode=s1:act')).toBe('act')
    expect(mode('onside_impersonation_mode=s1%3Aact')).toBe('act')
    expect(mode('onside_impersonation_mode=%E0%A4%A')).toBe('look')
    expect(mode(null)).toBe('look')
    expect(mode('onside_impersonation_mode=s1:look')).toBe('look')
    expect(mode('onside_impersonation_mode=s2:act')).toBe('look')
    expect(mode('onside_impersonation_mode=lixo')).toBe('look')
    expect(mode('x_onside_impersonation_mode=s1:act')).toBe('look')
  })

  test('trava só sessão impersonada sem "Pode agir"', () => {
    expect(isReadOnlyImpersonation(skin, undefined)).toBe(true)
    expect(isReadOnlyImpersonation(skin, cookie('s2:act'))).toBe(true)
    expect(isReadOnlyImpersonation(skin, cookie('s1:act'))).toBe(false)
    expect(
      isReadOnlyImpersonation(
        { session: { id: 's1', impersonatedBy: null } },
        undefined
      )
    ).toBe(false)
    expect(isReadOnlyImpersonation(null, cookie('s1:act'))).toBe(false)
  })

  test('rotas do better-auth: o que passa em "Só olhar"', () => {
    const open = [
      ['/admin/stop-impersonating', 'POST'],
      ['/sign-out', 'POST'],
      ['/get-session', 'GET'],
      ['/get-session', 'POST'],
      ['/get-session', undefined],
      ['/expire-session-cache', 'POST'],
      ['/list-sessions', 'GET'],
      ['/subscription/list', 'get']
    ] as const
    for (const [path, method] of open) {
      expect([path, isAuthWrite(path, method)]).toEqual([path, false])
    }
    const writes = [
      ['/update-user', 'POST'],
      ['/change-password', 'POST'],
      ['/delete-user', 'POST'],
      ['/revoke-session', 'POST'],
      ['/two-factor/enable', 'POST'],
      ['/subscription/upgrade', 'POST'],
      ['/subscription/billing-portal', 'POST'],
      ['/admin/impersonate-user', 'POST'],
      ['/update-user', undefined]
    ] as const
    for (const [path, method] of writes) {
      expect([path, isAuthWrite(path, method)]).toEqual([path, true])
    }
  })
})
