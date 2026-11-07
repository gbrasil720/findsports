import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-501: o cadastro do bar até o "no ar" e o que vem depois dele: primeiro
// jogo, "Assim o torcedor vê" e o plano do teste, que é obrigatório.

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' })

async function barOf(userId: string) {
  const [bar] = await query<{
    id: string
    plan: string
    escolhido: boolean
    routine: unknown
    fim: string
    jogos: number
  }>(
    `SELECT b.id, s.plan, b.trial_plan_chosen_at IS NOT NULL AS escolhido,
            b.routine, s.current_period_end::text AS fim,
            (SELECT count(*)::int FROM event e
              WHERE e.bar_id = b.id AND e.published_at IS NOT NULL) AS jogos
     FROM bar b JOIN subscription s ON s.bar_id = b.id WHERE b.user_id = $1`,
    [userId]
  )
  return bar
}

/** Do "Começar" até o comprovante. `wants` são as escolhas da rotina. */
async function cadastrar(
  page: Page,
  name: string,
  city: string,
  wants: RegExp[] = []
) {
  const owner = await createUser({ role: 'pub', onboardingCompleted: false })
  await signIn(page, owner)
  await page.goto('/onboarding/pub')
  await button(page, 'Começar').click()
  await page.getByLabel('Nome do estabelecimento').fill(name)
  await page
    .getByLabel('Rua', { exact: true })
    .fill(`Rua Valor ${randomUUID().slice(0, 8)}`)
  await page.getByLabel('Número', { exact: true }).fill('10')
  await page.getByLabel('Bairro').fill('Centro')
  await page.getByLabel('Cidade', { exact: true }).fill(city)
  await page.getByLabel('Estado (UF)').selectOption('SP')
  await button(page, 'Continuar').click()
  await button(page, 'Pular').click()
  for (const want of wants) await button(page, want).click()
  await button(page, 'Continuar').click()
  await expect(page.getByRole('heading', { name: 'Tudo certo?' })).toBeVisible()
  return owner
}

test('sem pular: comprovante sem plano, primeiro jogo por sugestão, o torcedor vê, plano escolhido e o passeio', async ({
  page
}, testInfo) => {
  // Cidade só deste teste: as sugestões são dos bares da mesma cidade.
  const tag = randomUUID().slice(0, 6)
  const city = `Ribeirão ${tag}`
  const vizinho = await createPub({ bar: { city, uf: 'SP' } })
  const classico = `Clássico de Ribeirão ${tag}`
  await createEvent(vizinho.barId, {
    startsAt: inDays(2),
    championship: classico
  })

  const owner = await cadastrar(page, 'Bar do Valor', city, [/cardápio/])
  // A revisão diz a rotina e que o plano vem depois do primeiro jogo.
  const main = page.getByRole('main')
  await expect(
    main.getByText('12 jogos por mês', { exact: true })
  ).toBeVisible()
  await expect(
    main.getByText(/O plano você escolhe logo depois do primeiro jogo/)
  ).toBeVisible()
  await print(page, testInfo, '01-revisao')
  await button(page, 'Colocar meu bar no ar').click()

  const recibo = page.getByRole('document', { name: 'Comprovante de cadastro' })
  await expect(recibo.getByText('TESTE GRÁTIS')).toBeVisible()
  await expect(recibo.getByText('você escolhe já já')).toBeVisible()
  await expect(recibo.getByText('por conta da Onside')).toBeVisible()
  await expect(recibo.getByText(/^PLANO /)).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Bar do Valor está no ar' })
  ).toBeVisible()
  // O teste começou no plano que a rotina recomenda, ainda a escolher.
  const nasceu = await barOf(owner.id)
  expect(nasceu).toMatchObject({
    plan: 'pro',
    escolhido: false,
    routine: { games: 12, spend: 80, wants: ['cardapio'] }
  })
  await print(page, testInfo, '02-comprovante', 4000)
  await button(page, 'Publicar o primeiro jogo').click()

  // Seu primeiro jogo: um toque na sugestão publica.
  await expect(page).toHaveURL(/\/onboarding\/pub\/no-ar$/)
  await expect(
    page.getByRole('heading', { name: 'Seu primeiro jogo' })
  ).toBeVisible()
  const sugestoes = page.getByRole('region', {
    name: 'Jogos que outros bares perto já marcaram'
  })
  await expect(sugestoes.getByText(classico)).toBeVisible()
  await print(page, testInfo, '03-primeiro-jogo')
  await sugestoes.getByRole('button', { name: new RegExp(classico) }).click()

  // Assim o torcedor vê: o card do Explorar, a página e o link do bar.
  await expect(page).toHaveURL(/passo=torcedor/)
  await expect(
    page.getByRole('heading', { name: 'Funcionou. Seu jogo já aparece' })
  ).toBeVisible()
  await expect(page.locator('.ob-tc .bc')).toContainText('Bar do Valor')
  await expect(
    page.getByRole('link', { name: 'Mandar no WhatsApp' })
  ).toBeVisible()
  await expect(
    page.getByText(/\/bar\/bar-do-valor-centro-/).first()
  ).toBeVisible()
  // O primeiro jogo publicado ganha o visto no topo.
  await expect(page.locator('.ob-steps li.ok')).toHaveCount(1)
  await print(page, testInfo, '04-torcedor-ve', 1500)
  expect((await barOf(owner.id))?.jogos).toBe(1)
  await button(page, 'Continuar').click()

  // Plano do teste: o recomendado vem marcado; o dono escolhe outro.
  await expect(
    page.getByRole('heading', { name: 'O Pro é o plano do Bar do Valor' })
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked()
  await expect(page.locator('.ob-steps li.ok')).toHaveCount(2)
  await print(page, testInfo, '05-plano')
  await page.getByText('Escolher o Starter').click()
  await button(page, 'Testar o Starter grátis').click()

  // A escolha não mexe no fim do teste, e o passeio começa.
  await expect(page).toHaveURL(/\/admin\/?$/)
  await expect(
    page.getByRole('dialog', { name: 'Seu jogo já está no ar' })
  ).toBeVisible()
  expect(await barOf(owner.id)).toMatchObject({
    plan: 'starter',
    escolhido: true,
    fim: nasceu?.fim
  })
  // O primeiro jogo é por conta da Onside: o Starter segue com os 5.
  const policy = await page.request.get(
    '/api/trpc/pub.getMyEventCreationPolicy'
  )
  expect((await policy.json()).result.data).toMatchObject({
    used: 0,
    remaining: 5
  })
})

test('pulando: "Ir para o painel" vai ao plano sem marcar os passos pulados, e o painel não abre sem ele', async ({
  page
}, testInfo) => {
  const owner = await cadastrar(page, 'Bar Apressado', 'Franca')
  await button(page, 'Colocar meu bar no ar').click()
  await button(page, 'Publicar o primeiro jogo').click()
  await expect(
    page.getByRole('heading', { name: 'Seu primeiro jogo' })
  ).toBeVisible()

  await button(page, 'Ir para o painel').click()
  await expect(page).toHaveURL(/passo=plano/)
  await expect(
    page.getByText('Falta só o plano do teste. Depois dele, o painel.')
  ).toBeVisible()
  // Pulados não são feitos: nada de visto no topo.
  await expect(page.locator('.ob-steps li.ok')).toHaveCount(0)
  await print(page, testInfo, '06-plano-pulando')

  // Sem escolher, o painel leva de volta à escolha (outro aparelho, link).
  await page.goto('/admin/jogos')
  await expect(page).toHaveURL(/\/onboarding\/pub\/no-ar\?passo=plano$/)
  await expect(
    page.getByRole('heading', { name: 'O Pro é o plano do Bar Apressado' })
  ).toBeVisible()

  await button(page, 'Testar o Pro grátis').click()
  await expect(page).toHaveURL(/\/admin\/?$/)
  const tip = page.getByRole('dialog', { name: 'O jogo da casa aparece aqui' })
  await expect(tip).toBeVisible()
  await expect(tip.getByText('1 DE 5')).toBeVisible()
  // Esc pausa; o card continua de onde parou.
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(
    page.getByText('Passeio pausado. Continue pelo Primeiros passos, em Hoje.')
  ).toBeVisible()
  const card = page.getByRole('region', {
    name: /Primeiros passos do Bar Apressado/
  })
  await expect(
    card.getByRole('button', { name: 'Continuar o passeio' })
  ).toBeVisible()
  await expect(card.getByText('1 de 6 feitos')).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await print(page, testInfo, '07-primeiros-passos')
  expect(await barOf(owner.id)).toMatchObject({
    plan: 'pro',
    escolhido: true,
    jogos: 0
  })
})
