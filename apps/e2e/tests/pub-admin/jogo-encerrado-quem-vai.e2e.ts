import { randomUUID } from 'node:crypto'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// O jogo encerrado aberto em Jogos (Elite) mostra quem foi e quem validou,
// mesmo com a janela de validação fechada: antes vinha "0 vão assistir · 0
// validaram · Ninguém marcou este jogo".

const HOUR = 3_600_000

test('jogo encerrado no Elite: o jogo aberto mostra quem marcou e quem validou', async ({
  page
}, testInfo) => {
  const pub = await createPub()
  const ontem = new Date(Date.now() - 24 * HOUR)
  const { eventId, championship } = await createEvent(pub.barId, {
    startsAt: ontem
  })
  const chegaram = [await createTicket(eventId), await createTicket(eventId)]
  const faltou = await createTicket(eventId)
  for (const { code } of chegaram) {
    await query(
      `INSERT INTO reservation_code_use (id, code_id, used_at)
       SELECT $1, id, $2 FROM reservation_code WHERE code = $3`,
      [randomUUID(), new Date(ontem.getTime() + HOUR / 4), code]
    )
  }

  const desktop = testInfo.project.name === 'desktop'
  await page.setViewportSize(
    desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 }
  )
  await signIn(page, pub.user)
  await page.goto('/admin/jogos')
  await page.getByRole('tab', { name: /^Passados/ }).click()
  await page.getByRole('button', { name: new RegExp(championship) }).click()

  const trio = page.locator('.pn-trio')
  await expect(trio).toContainText(/3\s*vão assistir/)
  await expect(trio).toContainText(/2\s*validaram/)
  await expect(page.getByText('3 marcaram')).toBeVisible()
  await expect(page.getByText(faltou.guestName)).toBeVisible()
  for (const { guestName } of chegaram) {
    await expect(page.getByText(guestName)).toBeVisible()
  }
  await expect(page.getByText('Ninguém marcou este jogo.')).toHaveCount(0)
  await print(page, testInfo, 'jogo-encerrado-quem-vai', 400)
})
