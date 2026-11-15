import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert } from '../../fixtures/db'
import { createEvent } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-467: o Desempenho do bar com pouca história. Bloco sem dado some; sem
// jogo fica o cartão do primeiro jogo, antes do jogo a contagem e "Até
// agora", e no primeiro mês os números saem sem comparação inventada.

const DAY = 86_400_000
const brasilia = (at: Date) =>
  at.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
/** "11/10", como o rótulo do gráfico. */
const ddmm = (at: Date) => {
  const day = brasilia(at)
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

/** Pelo começo do nome: a dica (`MetricHint`) entra no nome de alguns. */
const region = (page: Page, name: string) =>
  page.getByRole('region', { name: new RegExp(`^${name}`) })

async function openDesempenho(page: Page, user: Parameters<typeof signIn>[1]) {
  await signIn(page, user)
  await page.goto('/admin/desempenho')
}

test('sem nenhum jogo: o cartão do primeiro jogo no lugar dos blocos', async ({
  page
}, testInfo) => {
  const pub = await createPub({ subscription: { plan: 'pro' } })
  await openDesempenho(page, pub.user)

  const card = region(page, 'Ainda sem número')
  await expect(card).toContainText('Os números chegam com o primeiro jogo')
  await expect(
    page.getByRole('heading', { name: 'Depois do primeiro jogo, aparece aqui' })
  ).toBeVisible()
  for (const name of [
    'Resumo do período',
    'Atividade diária',
    'Como te procuraram',
    'Quem foi pela Onside',
    'Como cada jogo foi'
  ])
    await expect(region(page, name)).toHaveCount(0)
  await expect(page.locator('#painel-main')).not.toContainText('dias antes')
  await print(page, testInfo, 'desempenho-sem-jogo', 300)

  await card.getByRole('button', { name: 'Publicar um jogo' }).click()
  await expect(page.getByRole('dialog', { name: 'Novo jogo' })).toBeVisible()
})

test('antes do primeiro jogo: a contagem e o que já se sabe dele', async ({
  page
}, testInfo) => {
  const pub = await createPub({ subscription: { plan: 'pro' } })
  const { championship } = await createEvent(pub.barId, {
    startsAt: inDays(1)
  })
  await openDesempenho(page, pub.user)

  const first = region(page, 'Seu primeiro jogo')
  await expect(first).toContainText(championship)
  await expect(first).toContainText(/Faltam \d+/)
  const soFar = region(page, 'Até agora')
  await expect(soFar).toContainText('se interessaram')
  await expect(soFar).toContainText('nas últimas 24 h')
  await expect(soFar).toContainText(/bares? do bairro com ele/)
  await expect(region(page, 'Ainda sem número')).toHaveCount(0)
  await expect(region(page, 'Resumo do período')).toHaveCount(0)
  await print(page, testInfo, 'desempenho-antes-do-jogo', 300)
})

test('primeiro mês: números sem comparação e o gráfico desde o no ar', async ({
  page
}, testInfo) => {
  const created = new Date(Date.now() - 5 * DAY)
  const pub = await createPub({
    subscription: { plan: 'pro' },
    bar: { created_at: created }
  })
  await createEvent(pub.barId, { startsAt: inDays(-2) })
  const fan = await createUser()
  await insert('bar_commercial_event', {
    id: randomUUID(),
    bar_id: pub.barId,
    actor_user_id: fan.id,
    type: 'profile_view',
    occurred_at: new Date(),
    commercial_day: brasilia(new Date())
  })
  await openDesempenho(page, pub.user)

  await expect(region(page, 'Resumo do período')).toContainText(
    'abriram 1 vez a página do bar'
  )
  await expect(page.getByRole('note')).toContainText(
    /A comparação com os 30 dias anteriores aparece em \d{1,2} \S+\./
  )
  await expect(page.locator('#painel-main')).not.toContainText('dias antes')
  await expect(
    region(page, 'Atividade diária').getByRole('slider')
  ).toHaveAttribute(
    'aria-label',
    `Atividade diária, de ${ddmm(created)} a ${ddmm(new Date())}`
  )
  await expect(region(page, 'Como cada jogo foi')).toBeVisible()
  await print(page, testInfo, 'desempenho-primeiro-mes', 300)
})
