import { expect, test } from 'bun:test'

import { turnstileAllows } from './turnstile'

function siteverify(success: boolean) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return Response.json({ success })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

test('sem segredo, deixa passar sem consultar a Cloudflare', async () => {
  const { calls, fetchImpl } = siteverify(false)
  expect(await turnstileAllows(undefined, '1.2.3.4', '', fetchImpl)).toBe(true)
  expect(calls).toHaveLength(0)
})

test('com segredo, token ausente é recusado sem consultar', async () => {
  const { calls, fetchImpl } = siteverify(true)
  expect(await turnstileAllows(undefined, '1.2.3.4', 'secret', fetchImpl)).toBe(
    false
  )
  expect(await turnstileAllows('', '1.2.3.4', 'secret', fetchImpl)).toBe(false)
  expect(calls).toHaveLength(0)
})

test('recusa quando o siteverify diz que não', async () => {
  const { fetchImpl } = siteverify(false)
  expect(await turnstileAllows('tok', '1.2.3.4', 'secret', fetchImpl)).toBe(
    false
  )
})

test('aceita quando o siteverify confirma, com o IP do cliente', async () => {
  const { calls, fetchImpl } = siteverify(true)
  expect(await turnstileAllows('tok', '1.2.3.4', 'secret', fetchImpl)).toBe(
    true
  )
  expect(calls[0]).toEqual({
    url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    body: { secret: 'secret', response: 'tok', remoteip: '1.2.3.4' }
  })
})

test('não manda remoteip quando o IP é desconhecido', async () => {
  const { calls, fetchImpl } = siteverify(true)
  await turnstileAllows('tok', 'unknown', 'secret', fetchImpl)
  expect(calls[0]?.body).toEqual({ secret: 'secret', response: 'tok' })
})
