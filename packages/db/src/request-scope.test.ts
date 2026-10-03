import { expect, test } from 'bun:test'
import { createHttpDb, db, runWithDb } from '.'

// WEB-201: sem consulta — o Pool do `pg` só conecta na primeira query.
const scopedUrl = 'postgres://worker:x@127.0.0.1:1/hyperdrive'
const clientUrl = (d: { $client: unknown }) =>
  (d.$client as { options: { connectionString: string } }).options
    .connectionString

test('db e o banco do auth resolvem a instância da requisição', async () => {
  const authDb = createHttpDb()
  const outside = clientUrl(db)
  expect(outside).not.toBe(scopedUrl)

  await runWithDb(scopedUrl, async () => {
    await Promise.resolve()
    expect(clientUrl(db)).toBe(scopedUrl)
    expect(clientUrl(authDb)).toBe(scopedUrl)
    expect(typeof db.transaction).toBe('function')
  })

  expect(clientUrl(db)).toBe(outside)
})

test('cada requisição tem a sua instância', async () => {
  const seen = await Promise.all(
    ['a', 'b'].map((name) =>
      runWithDb(`postgres://w:x@127.0.0.1:1/${name}`, async () => {
        await new Promise((r) => setTimeout(r, 5))
        return clientUrl(db)
      })
    )
  )
  expect(seen).toEqual([
    'postgres://w:x@127.0.0.1:1/a',
    'postgres://w:x@127.0.0.1:1/b'
  ])
})
