import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createEvent } from '../../fixtures/going'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Jogos que não carregaram não são "0 jogos" (WEB-471): Hoje e Jogos põem o
// traço no lugar do número e deixam o erro dizer o que houve.

/**
 * `pub.getMyEvents` responde 500 em toda tentativa. O lote do tRPC pode levar
 * outras consultas junto: elas seguem com a resposta de verdade.
 */
async function failMyEvents(page: Page) {
  await page.route(/\/api\/trpc\/[^?]*pub\.getMyEvents/, async (route) => {
    const paths = decodeURIComponent(
      new URL(route.request().url()).pathname.replace('/api/trpc/', '')
    ).split(',')
    const real = paths.length > 1 ? await (await route.fetch()).json() : []
    const body = paths.map((path, i) =>
      path === 'pub.getMyEvents'
        ? {
            error: {
              message: 'Falha de teste',
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500, path }
            }
          }
        : real[i]
    )
    await route.fulfill({ status: 500, json: body })
  })
}

/** Nenhum número solto: "0", "12"... (o traço e as palavras passam). */
const SEM_NUMERO = /^\D*$/

test('Hoje: jogos sem carregar deixam o traço no cabeçalho e nos cards, nunca "0"', async ({
  page
}) => {
  const pub = await createPub()
  await createEvent(pub.barId, { startsAt: new Date(Date.now() + 3_600_000) })
  await signIn(page, pub.user)
  await failMyEvents(page)
  await page.goto('/admin')

  // As tentativas da falha passageira (1 s, 2 s, 4 s) vêm antes do erro.
  await expect(
    page.getByText('Não foi possível carregar os jogos.')
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('— jogos', { exact: true })).toBeVisible()
  await expect(page.locator('.painel-page-head-linha')).toHaveText(SEM_NUMERO)

  const kpis = page
    .getByRole('region', { name: 'Números de hoje' })
    .locator('> *')
  await expect(kpis).toHaveCount(4)
  for (const rotulo of [
    'jogos hoje',
    'vão assistir hoje',
    'códigos validados'
  ]) {
    const card = kpis.filter({ hasText: rotulo })
    await expect(card).toContainText('—')
    await expect(card).toHaveText(SEM_NUMERO)
  }
  // O traço não muda a largura dos cards.
  const larguras = await kpis.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width))
  )
  expect(new Set(larguras).size).toBe(1)
})

test('Jogos: grade sem carregar não conta "0" em Próximos, Rascunhos e Passados', async ({
  page
}) => {
  const pub = await createPub()
  await createEvent(pub.barId, { startsAt: new Date(Date.now() + 3_600_000) })
  await signIn(page, pub.user)
  await failMyEvents(page)
  await page.goto('/admin/jogos')

  await expect(
    page.getByText('Não foi possível carregar a grade.')
  ).toBeVisible({ timeout: 20_000 })
  const filtros = page.getByRole('group', { name: 'Quais jogos' })
  for (const nome of ['Próximos', 'Rascunhos', 'Passados'])
    await expect(filtros.getByRole('button', { name: nome })).toHaveText(
      `${nome} · —`
    )
})
