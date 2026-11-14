import { randomUUID } from 'node:crypto'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

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

test('depois do jogo no Elite: quem veio pela primeira vez sob "viram o bar"', async ({
  page
}, testInfo) => {
  const pub = await createPub()
  const antes = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 14 * 24 * HOUR)
  })
  const ontem = new Date(Date.now() - 24 * HOUR)
  const { eventId, championship } = await createEvent(pub.barId, {
    startsAt: ontem
  })

  // Um já tinha ido; dois vieram pela primeira vez.
  const voltou = await createTicket(antes.eventId)
  await validate(voltou.code, new Date(Date.now() - 14 * 24 * HOUR + HOUR))
  const chegada = new Date(ontem.getTime() + HOUR / 4)
  await validate(
    (await createTicket(eventId, { fan: voltou.fan })).code,
    chegada
  )
  await validate((await createTicket(eventId)).code, chegada)
  await validate((await createTicket(eventId)).code, chegada)

  // Quem abriu o bar e chamou por esse jogo, para a faixa não sair zerada.
  for (const [type, n] of [
    ['profile_view', 9],
    ['whatsapp_opened', 4]
  ] as const) {
    for (let i = 0; i < n; i++) {
      const fan = await createUser({ name: `Visitante ${i}` })
      await query(
        `INSERT INTO bar_commercial_event
           (id, bar_id, actor_user_id, type, source_event_id, occurred_at, commercial_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          pub.barId,
          fan.id,
          type,
          eventId,
          ontem,
          ontem.toISOString().slice(0, 10)
        ]
      )
    }
  }

  const desktop = testInfo.project.name === 'desktop'
  await page.setViewportSize(
    desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 }
  )
  await signIn(page, pub.user)
  await page.goto('/admin/jogos')
  await page.getByRole('tab', { name: /^Passados/ }).click()
  const linha = page.getByRole('button', { name: new RegExp(championship) })
  await expect(linha).toContainText(
    /viram o bar por ele\s*2 vieram pela primeira vez/
  )
  // No celular o jogo aberto cobre a lista: um print de cada.
  if (!desktop) await print(page, testInfo, 'faixa-depois-lista')
  await linha.click()
  await print(
    page,
    testInfo,
    desktop ? 'faixa-depois' : 'faixa-depois-aberto',
    400
  )
})
