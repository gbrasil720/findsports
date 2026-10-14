import { describe, expect, it } from 'bun:test'

import { ADMIN_2FA_REQUIRED_MESSAGE, adminRouteRefusal } from './admin-guard'

const admin = (twoFactorEnabled: boolean) => ({
  user: { role: 'admin', twoFactorEnabled }
})

describe('guarda das rotas /admin/*', () => {
  it('exige 2FA de admin para agir', () => {
    expect(adminRouteRefusal('/admin/ban-user', admin(false))).toBe(
      ADMIN_2FA_REQUIRED_MESSAGE
    )
    expect(adminRouteRefusal('/admin/impersonate-user', admin(true))).toBeNull()
  })

  it('deixa tirar a pele sem conferir 2FA (a sessão é a da pele)', () => {
    expect(
      adminRouteRefusal('/admin/stop-impersonating', {
        user: { role: 'fan', twoFactorEnabled: false }
      })
    ).toBeNull()
  })

  it('desliga rotas que o app não usa, mesmo para admin com 2FA', () => {
    expect(adminRouteRefusal('/admin/remove-user', admin(true))).not.toBeNull()
    expect(
      adminRouteRefusal('/admin/set-user-password', admin(true))
    ).not.toBeNull()
  })

  it('não mexe no que não é /admin/*', () => {
    expect(adminRouteRefusal('/sign-in/email', admin(false))).toBeNull()
  })
})
