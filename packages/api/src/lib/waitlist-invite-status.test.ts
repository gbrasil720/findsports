import { describe, expect, it } from 'bun:test'

import { deriveWaitlistInviteStatus } from './waitlist-invite-status'

/**
 * ONS-25: a query antiga filtrava os quatro predicados de uma vez e devolvia
 * zero linha, então todo convite recusado virava a mesma frase. O que estes
 * casos travam é a precedência — qual motivo a pessoa lê quando mais de um
 * vale ao mesmo tempo.
 */
const CONVITE_BOM = {
  cancelled: false,
  activated: false,
  approved: true,
  inviteFresh: true
}

describe('deriveWaitlistInviteStatus', () => {
  it('aceita o convite aprovado, dentro do prazo e não usado', () => {
    expect(deriveWaitlistInviteStatus(CONVITE_BOM)).toBe('valid')
  })

  it('chama de expirado só o prazo vencido', () => {
    expect(
      deriveWaitlistInviteStatus({ ...CONVITE_BOM, inviteFresh: false })
    ).toBe('expired')
  })

  it('diz que a conta já existe em vez de negar o convite', () => {
    expect(
      deriveWaitlistInviteStatus({ ...CONVITE_BOM, activated: true })
    ).toBe('activated')
  })

  it('separa quem ainda não foi aprovado de quem perdeu o prazo', () => {
    expect(
      deriveWaitlistInviteStatus({
        ...CONVITE_BOM,
        approved: false,
        inviteFresh: false
      })
    ).toBe('not_approved')
  })

  it('cancelamento vence os outros motivos', () => {
    // `leave` zera `approved_at` e `invite_expires_at` junto com o
    // cancelamento: sem esta precedência, quem saiu da lista leria "ainda na
    // fila" ou "expirou".
    expect(
      deriveWaitlistInviteStatus({
        cancelled: true,
        activated: false,
        approved: false,
        inviteFresh: false
      })
    ).toBe('cancelled')
  })

  it('conta ativada vence a falta de prazo', () => {
    expect(
      deriveWaitlistInviteStatus({
        ...CONVITE_BOM,
        activated: true,
        inviteFresh: false
      })
    ).toBe('activated')
  })
})
