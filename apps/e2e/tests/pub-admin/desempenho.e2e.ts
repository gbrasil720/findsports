import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { painelLink } from '../../fixtures/painel'
import { createPub, type Plan } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Desempenho (`/admin/desempenho`) e Jogos · Passados ("Como cada jogo foi"):
// o que cada plano vê. As métricas que o plano não tem vêm nulas do servidor.

const DAY = 86_400_000
const brDay = (at: Date) =>
  at.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/**
 * Um torcedor abre o bar pelo jogo, há três dias, e (opcional) chama no
 * WhatsApp: é o que o app grava em `bar_commercial_event`.
 */
async function visita(
  barId: string,
  eventId: string,
  tipos: string[] = ['profile_view']
) {
  const fan = await createUser()
  const at = new Date(Date.now() - 3 * DAY)
  for (const type of tipos) {
    await insert('bar_commercial_event', {
      id: randomUUID(),
      bar_id: barId,
      actor_user_id: fan.id,
      type,
      source_event_id: eventId,
      occurred_at: at,
      commercial_day: brDay(at)
    })
  }
}

/** Bar do plano com um jogo há três dias: 3 viram, 2 chamaram no WhatsApp. */
async function openDesempenho(page: Page, plan: Plan) {
  const pub = await createPub({ subscription: { plan } })
  const jogo = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 3 * DAY)
  })
  await visita(pub.barId, jogo.eventId, ['profile_view', 'whatsapp_opened'])
  await visita(pub.barId, jogo.eventId, ['profile_view', 'whatsapp_opened'])
  await visita(pub.barId, jogo.eventId)
  await signIn(page, pub.user)
  await page.goto('/admin')
  await painelLink(page, 'Desempenho').click()
  await expect(page).toHaveURL(/\/admin\/desempenho$/)
  await expect(
    page.getByRole('heading', { name: 'Desempenho', level: 1 })
  ).toBeVisible()
  return { pub, jogo }
}

const numeros = (page: Page) =>
  page.getByRole('region', { name: 'Os números do bar' })
const periodo = (page: Page) => page.getByRole('group', { name: 'Período' })
const atividade = (page: Page) =>
  page.locator('.desemp-ativ').filter({
    has: page.getByRole('heading', { name: 'Atividade diária' })
  })
const card = (page: Page, titulo: string) =>
  page.locator('.painel-card').filter({
    has: page.getByRole('heading', { name: titulo, exact: true })
  })

test('Elite: tudo do Desempenho e Passados com Comparar jogos', async ({
  page
}) => {
  const { jogo } = await openDesempenho(page, 'elite')
  await createTicket(jogo.eventId)
  await createTicket(jogo.eventId)

  await expect(numeros(page)).toContainText('Pessoas que viram seu bar')
  await expect(numeros(page)).toContainText('abriram 3 vezes no total')
  await expect(numeros(page)).toContainText('66,7%')
  await expect(
    periodo(page).getByRole('button', { name: 'Tudo' })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Atividade diária' })
  ).toBeVisible()
  await expect(
    page.getByRole('slider', { name: /Gráfico de atividade diária/ })
  ).toBeVisible()
  await expect(card(page, 'Entrega Elite nos clássicos')).toBeVisible()
  await expect(card(page, 'Como te procuraram')).toContainText(
    'Mais usado: WhatsApp'
  )
  await expect(card(page, 'Comparado com o período anterior')).toBeVisible()

  // Os códigos foram criados depois da primeira leitura: recarrega.
  await page.reload()
  await expect(card(page, 'Quem foi pela Onside')).toContainText(
    'Códigos gerados'
  )
  await expect(card(page, 'Quem foi pela Onside')).toContainText('2')

  const resumo = card(page, 'Como cada jogo foi')
  await expect(resumo).toContainText('3 viram')
  await expect(resumo).toContainText('2 interessados')
  await resumo
    .getByRole('link', { name: /Ver o jogo em Jogos · Passados/ })
    .click()

  await expect(page).toHaveURL(/\/admin\/jogos\?passados=1/)
  await expect(
    page.getByRole('heading', { name: 'Como cada jogo foi' })
  ).toBeVisible()
  await expect(page.getByText('Melhor jogo:')).toContainText('(2 interessados)')
  const linha = page
    .getByRole('list', { name: 'Jogos do período' })
    .getByRole('button', { name: new RegExp(jogo.championship) })
  await expect(linha).toContainText('Códigos: 2')
  await linha.click()
  await expect(linha).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Mais usado', { exact: true })).toBeVisible()

  const comparar = page.getByRole('region', { name: 'Comparar jogos' })
  await expect(comparar).toContainText('Elite')
  await expect(
    comparar.getByRole('radio', { name: 'Jogo contra média do bar' })
  ).toBeVisible()
})

test('Pro: atividade diária, sem itens do Elite; compara jogos', async ({
  page
}) => {
  const { jogo } = await openDesempenho(page, 'pro')

  await expect(numeros(page)).toContainText('abriram 3 vezes no total')
  await expect(
    periodo(page).getByRole('button', { name: '12 meses' })
  ).toBeVisible()
  await expect(periodo(page).getByRole('button', { name: 'Tudo' })).toHaveCount(
    0
  )
  await expect(card(page, 'Como te procuraram')).toContainText(
    'Mais usado: WhatsApp'
  )
  // A atividade diária é de todos os planos (WEB-449).
  await expect(atividade(page)).toContainText('Aberturas3')
  await expect(atividade(page)).toContainText('WhatsApp, rota e telefone2')
  await expect(card(page, 'Entrega Elite nos clássicos')).toHaveCount(0)
  await expect(card(page, 'Quem foi pela Onside')).toHaveCount(0)

  await page.goto('/admin/jogos')
  await page.getByRole('button', { name: /^Passados/ }).click()
  const linha = page
    .getByRole('list', { name: 'Jogos do período' })
    .getByRole('button', { name: new RegExp(jogo.championship) })
  await expect(linha).toContainText('Interesse: 2')
  await expect(linha).not.toContainText('Códigos')
  await expect(
    page.getByRole('region', { name: 'Comparar jogos' })
  ).toContainText('Pro')
})

test('Starter: só 30 dias, canais travados e sem Comparar jogos', async ({
  page
}) => {
  const { jogo } = await openDesempenho(page, 'starter')

  await expect(numeros(page)).toContainText('abriram 3 vezes no total')
  await expect(
    periodo(page).getByRole('button', { name: '12 meses' })
  ).toHaveCount(0)
  await expect(card(page, 'Como te procuraram')).toContainText(
    'Exclusivo do plano superior'
  )
  // Sem os canais um a um, a atividade diária traz os contatos somados.
  await expect(atividade(page)).toContainText('WhatsApp, rota e telefone2')

  // O personalizado respeita o histórico do plano.
  await periodo(page).getByRole('button', { name: 'Personalizado' }).click()
  const hoje = brDay(new Date())
  await page
    .getByLabel('De', { exact: true })
    .fill(brDay(new Date(Date.now() - 40 * DAY)))
  await page.getByLabel('Até', { exact: true }).fill(hoje)
  await page.getByRole('button', { name: 'Consultar período' }).click()
  await expect(page.locator('.desemp-erro')).toContainText(
    'Seu plano permite até 30 dias.'
  )

  await page.goto('/admin/jogos?passados=1')
  const linha = page
    .getByRole('list', { name: 'Jogos do período' })
    .getByRole('button', { name: new RegExp(jogo.championship) })
  await expect(linha).toContainText('Viram: 3')
  await expect(page.getByText('Melhor jogo:')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Comparar jogos' })
  ).toHaveCount(0)
})

test('Comparar jogos: quatro à vista, o resto atrás do "+N" (1z)', async ({
  page
}) => {
  const pub = await createPub({ subscription: { plan: 'pro' } })
  const jogos = []
  for (let i = 1; i <= 6; i++) {
    jogos.push(
      await createEvent(pub.barId, {
        startsAt: new Date(Date.now() - (i + 1) * DAY)
      })
    )
  }
  await signIn(page, pub.user)
  await page.goto('/admin/jogos?passados=1')

  const escolha = page
    .getByRole('region', { name: 'Comparar jogos' })
    .getByRole('group', { name: 'Jogos comparados' })
  const chips = escolha.getByRole('button', { name: /^Campeonato E2E/ })
  await expect(chips).toHaveCount(4)
  await expect(escolha.getByRole('button', { pressed: true })).toHaveCount(3)
  const mais = escolha.getByRole('button', { name: 'Mostrar mais 2 jogos' })
  await expect(mais).toHaveText('+2')
  await mais.click()
  await expect(mais).toHaveCount(0)
  await expect(chips).toHaveCount(6)

  // Qualquer jogo do período entra na comparação.
  const ultimo = jogos.at(-1)?.championship ?? ''
  await escolha.getByRole('button', { name: ultimo }).click()
  await expect(escolha.getByRole('button', { name: ultimo })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})
