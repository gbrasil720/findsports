import { expect, test } from 'bun:test'
import { packMarker } from './pending-marker'
import { verifiedGate } from './verified-gate'

const NOW = 1_000_000
const stored = packMarker('verificador', 60_000, NOW)

test('resgata só com o código do link e o verificador no prazo', () => {
  expect(verifiedGate('onside://verified?c=abc&code=XYZ', stored, NOW)).toEqual(
    { kind: 'redeem', code: 'XYZ', verifier: 'verificador' }
  )
})

test('sem verificador (outro aparelho) ou vencido, não resgata', () => {
  const url = 'onside://verified?c=abc&code=XYZ'
  expect(verifiedGate(url, null, NOW)).toEqual({
    kind: 'leave',
    notice: 'confirmed'
  })
  expect(verifiedGate(url, stored, NOW + 60_000).kind).toBe('leave')
})

test('cookie na URL (link forjado ou servidor antigo) nunca vira sessão', () => {
  expect(verifiedGate('onside://verified?cookie=s%3D1', stored, NOW).kind).toBe(
    'leave'
  )
})

test('erro do servidor diz que o link venceu; sem erro, que o e-mail confirmou', () => {
  expect(
    verifiedGate('onside://verified?error=TOKEN_EXPIRED', stored, NOW)
  ).toEqual({ kind: 'leave', notice: 'expired' })
  expect(verifiedGate('onside://verified', stored, NOW)).toEqual({
    kind: 'leave',
    notice: 'confirmed'
  })
  expect(verifiedGate(null, stored, NOW).kind).toBe('leave')
})
