import { randomUUID } from 'node:crypto'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// "Primeira vez no bar" na faixa do jogo ao vivo em Jogos (WEB-530): no
// Elite, a terceira célula conta quem chegou com código sem visita anterior.

const HOUR = 3_600_000

/** O código passou no balcão em `usedAt` (direto no banco, jogo começado). */
async function validate(code: string, usedAt: Date) {
  await query(
    `INSERT INTO reservation_code_use (id, code_id, used_at)
     SELECT $1, id, $2 FROM reservation_code WHERE code = $3`,
    [randomUUID(), usedAt, code]
  )
}

test('ao vivo no Elite: quem vai, quem chegou e quem veio pela primeira vez', async ({
  page
}, testInfo) => {
  const pub = await createPub()
  const antes = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 7 * 24 * HOUR)
  })
  const { eventId, championship } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - HOUR / 2)
  })

  // Um já tinha ido ao bar na semana passada; dois vêm pela primeira vez.
  const voltou = await createTicket(antes.eventId)
  await validate(voltou.code, new Date(Date.now() - 7 * 24 * HOUR + HOUR))
  const agora = new Date(Date.now() - HOUR / 4)
  await validate((await createTicket(eventId, { fan: voltou.fan })).code, agora)
  await validate((await createTicket(eventId)).code, agora)
  await validate((await createTicket(eventId)).code, agora)
  await createTicket(eventId)

  await signIn(page, pub.user)
  await page.goto('/admin/jogos')
  const linha = page.getByRole('button', { name: new RegExp(championship) })
  await expect(linha).toContainText('ao vivo')
  await expect(linha).toContainText(/4\s*vão/)
  await expect(linha).toContainText(/3\s*chegaram com código/)
  await expect(linha).toContainText(/2\s*primeira vez no bar/)
  await print(page, testInfo, 'faixa-primeira-vez')
})
