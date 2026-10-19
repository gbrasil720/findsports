import { randomUUID } from 'node:crypto'
import { query } from '../../fixtures/db'
import {
  createEvent,
  days,
  pubAt,
  signInFanAt,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'

// O diálogo do código do balcão: abre quando "Vou assistir aqui" emite o
// código (bar Elite), diz onde ele fica e leva até lá.

/** "A7K·29Q", como a tela mostra (`formatCode`). */
const shown = (code: string) => `${code.slice(0, 3)}·${code.slice(3)}`

async function codeOf(userId: string, eventId: string) {
  const [row] = await query<{ code: string }>(
    `SELECT c.code
       FROM reservation r JOIN reservation_code c ON c.reservation_id = r.id
      WHERE r.user_id = $1 AND r.event_id = $2 AND c.retired_at IS NULL`,
    [userId, eventId]
  )
  return row?.code
}

async function markAttendance(plan?: 'pro') {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, {
    ...(plan ? { subscription: { plan } } : {}),
    bar: { house_offer: 'Porção de fritas no intervalo' }
  })
  const freeText = `Diálogo ${randomUUID().slice(0, 6)}`
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(2),
    freeText
  })
  return { pub, freeText, eventId, spot }
}

test('bar Elite: o código abre num diálogo, com foco, Esc e o caminho para Meus jogos', async ({
  page
}) => {
  const { pub, freeText, eventId, spot } = await markAttendance()
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  const game = page.getByRole('group', { name: freeText })
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()

  const dialog = page.getByRole('dialog', { name: 'Seu código para o balcão' })
  await expect(dialog).toBeVisible()
  await expect.poll(() => codeOf(fan.id, eventId)).toMatch(/^[A-Z0-9]{6}$/)
  const code = (await codeOf(fan.id, eventId)) as string

  await expect(dialog.getByText(shown(code), { exact: true })).toBeVisible()
  await expect(dialog).toContainText(
    'Mostre este código no balcão do bar no dia do jogo para ganhar a oferta da casa.'
  )
  await expect(dialog).toContainText(
    'Oferta da casa: Porção de fritas no intervalo'
  )
  await expect(dialog).toContainText('fica guardado em Meus jogos')
  await expect(dialog.getByRole('button', { name: 'Fechar' })).toBeFocused()

  // Esc fecha e devolve o foco ao botão, que agora desfaz.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(game.getByRole('button', { name: 'Desfazer' })).toBeFocused()

  // Desfazer e marcar de novo emite outro código, e o diálogo mostra o novo.
  await game.getByRole('button', { name: 'Desfazer' }).click()
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()
  await expect(dialog).toBeVisible()
  await expect.poll(() => codeOf(fan.id, eventId)).not.toBe(code)
  const again = (await codeOf(fan.id, eventId)) as string
  await expect(dialog.getByText(shown(again), { exact: true })).toBeVisible()

  await dialog.getByRole('link', { name: 'Ver em Meus jogos' }).click()
  await expect(page).toHaveURL(/\/dashboard\/games$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('article', { name: pub.name })).toContainText(
    shown(again)
  )
})

test('fora do Elite, marcar não abre diálogo', async ({ page }) => {
  const { pub, freeText, spot } = await markAttendance('pro')
  await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  const game = page.getByRole('group', { name: freeText })
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()
  await expect(
    game.getByText('Você vai assistir aqui', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
