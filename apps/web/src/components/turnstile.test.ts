import { expect, test } from 'bun:test'

import { createTokenGate } from './turnstile'

// WEB-254: o envio feito antes de o Turnstile responder tem de esperar o
// token, e não mandar o header vazio.
test('quem envia antes do token espera por ele', async () => {
  const gate = createTokenGate(1_000)
  const pending = gate.wait()
  gate.set('token-1')
  expect(await pending).toBe('token-1')
  expect(await gate.wait()).toBe('token-1')
})

test('sem token até o teto, o envio segue vazio', async () => {
  const gate = createTokenGate(10)
  expect(await gate.wait()).toBeUndefined()
})

test('depois do reset o token usado não é reaproveitado', async () => {
  const gate = createTokenGate(10)
  gate.set('token-1')
  gate.set(undefined)
  expect(await gate.wait()).toBeUndefined()
})
