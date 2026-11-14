import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays, type PubOptions } from '../../fixtures/pubs'
import {
  deliverSubscription,
  sendStripeWebhook,
  stripeSubscription
} from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// /admin/billing: plano atual e portal do Stripe, onde ficam faturas, cartão,
// troca de plano e cancelamento. A API do Stripe é o stub (`stubs/server.ts`):
// portal em `${STUB_URL}/stripe/portal/<customer>`.

async function openBilling(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  await page.goto('/admin/billing')
  return pub
}

const currentPlan = (page: Page) =>
  page.getByRole('region', { name: 'Seu plano' })

const cancelShortcut = (page: Page) =>
  page.getByRole('button', { name: 'Cancelar assinatura' })

test('o painel leva à cobrança e à validação', async ({ page }) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')

  // O menu do dono existe no trilho e no topo do celular; só um aparece.
  await page.getByRole('button', { name: /^Menu da conta/ }).click()
  await page
    .getByRole('navigation', { name: 'Conta' })
    .getByRole('link', { name: 'Plano e cobrança' })
    .click()
  await expect(page).toHaveURL(/\/admin\/billing$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Plano e cobrança' })
  ).toBeVisible()

  await page.goto('/admin')
  await page
    .getByRole('button', { name: 'Validar código', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Validar código' })
  await expect(dialog.getByLabel('Letra 1')).toBeFocused()
  await dialog.getByLabel('Letra 1').fill('A')
  await expect(dialog.getByLabel('Letra 2')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page
    .getByRole('button', { name: 'Validar código', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Validar código' })
    .getByRole('link', { name: 'Abrir a página de validação' })
    .click()
  await expect(page).toHaveURL(/\/admin\/validate$/)
})

test('a assinatura aparece sem esperar a consulta do cupom ao Stripe (WEB-348)', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  // `getFounderCouponAvailable` consulta o Stripe. Aqui ela nunca responde: se
  // voltar a viajar no mesmo lote HTTP da assinatura, o plano não aparece.
  let held = 0
  await page.route(/\/api\/trpc\/[^?]*pub\.getFounderCouponAvailable/, () => {
    held += 1
  })
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
  expect(held).toBe(1)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('a consulta do cupom sem resposta não deixa o card do trial em "Carregando preço…" (WEB-534)', async ({
  page
}) => {
  const pub = await createPub({
    subscription: { plan: 'elite', status: 'trialing' }
  })
  await signIn(page, pub.user)
  // A resposta do servidor nunca chega ao navegador. Passado o teto, o card
  // mostra a tabela cheia em vez de carregar para sempre.
  await page.route(/\/api\/trpc\/[^?]*pub\.getFounderCouponAvailable/, () => {})
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('R$ 297', { timeout: 15_000 })
  await expect(currentPlan(page)).not.toContainText('Carregando preço')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('Elite ativo: plano e portal do Stripe', async ({ page }) => {
  // O portal só existe para quem tem cliente no Stripe (WEB-264): o id da
  // assinatura e o do cliente são o rastro de quem já passou pelo checkout.
  const pub = await createPub({
    subscription: {
      externalSubscriptionId: `sub_e2e_${randomUUID()}`,
      monthlyDiscountReais: 28
    }
  })
  const customerId = `cus_e2e_${randomUUID()}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('R$ 269')
  await expect(currentPlan(page)).toContainText('R$ 297')
  await expect(currentPlan(page)).toContainText('Ativo')
  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect(
    currentPlan(page).getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveCount(0)
  await expect(
    page.getByText(/faturas e os recibos de cada cobrança ficam no portal/)
  ).toBeVisible()

  const navigations: string[] = []
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.url().startsWith(`${STUB_URL}/stripe/portal/`)
    ) {
      navigations.push(request.url())
    }
  })
  await page.getByRole('button', { name: 'Gerenciar assinatura' }).click()
  await expect(page).toHaveURL(`${STUB_URL}/stripe/portal/${customerId}`)
  // WEB-241: uma navegação só; a segunda abortava a primeira.
  expect(navigations).toHaveLength(1)
})

// WEB-339: o atalho abre o portal já no cancelamento, em português, pela
// rota do app (`pub.openSubscriptionCancel`), que antes confere a assinatura
// no Stripe.
test('assinatura ativa: "Cancelar assinatura" pergunta o motivo e abre o portal no fluxo de cancelamento (WEB-339, WEB-445)', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const customerId = `cus_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: { plan: 'pro', externalSubscriptionId: subscriptionId }
  })
  // O cliente fica no usuário e na linha do plugin, como o checkout grava.
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await query(
    'UPDATE stripe_subscription SET stripe_customer_id = $1 WHERE stripe_subscription_id = $2',
    [customerId, subscriptionId]
  )
  const seeded = await request.post(`${STUB_URL}/stripe/subscriptions`, {
    data: stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'pro',
      userId: pub.user.id,
      customerId
    })
  })
  expect(seeded.ok()).toBe(true)
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText(
    '“Cancelar assinatura” pergunta o motivo e abre o portal direto no cancelamento.'
  )
  // Ação secundária: "Gerenciar assinatura" segue sendo o botão do card.
  await expect(
    currentPlan(page).getByRole('button', { name: 'Gerenciar assinatura' })
  ).toBeVisible()
  // Fechar sem confirmar não abre o portal nem grava motivo (WEB-445).
  await cancelShortcut(page).click()
  const dialog = page.getByRole('dialog', { name: 'Cancelar o Pro?' })
  await expect(
    dialog.getByRole('button', { name: 'Manter o Pro' })
  ).toBeFocused()
  await dialog.getByRole('button', { name: 'Muito caro' }).click()
  await dialog.getByRole('button', { name: 'Manter o Pro' }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    (
      (await (await page.request.get(`${STUB_URL}/stripe/calls`)).json()) as {
        path: string
        body: Record<string, string>
      }[]
    ).filter(
      (call) =>
        call.path === '/billing_portal/sessions' &&
        call.body.customer === customerId
    )
  ).toHaveLength(0)

  await cancelShortcut(page).click()
  // Um motivo só: escolher outro troca.
  const muitoCaro = dialog.getByRole('button', { name: 'Muito caro' })
  const poucoMovimento = dialog.getByRole('button', { name: 'Pouco movimento' })
  await muitoCaro.click()
  await poucoMovimento.click()
  await expect(poucoMovimento).toHaveAttribute('aria-pressed', 'true')
  await expect(muitoCaro).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Cancelar mesmo assim' }).click()
  await expect(page).toHaveURL(`${STUB_URL}/stripe/portal/${customerId}`)
  expect(
    await query(
      'SELECT plan, reason FROM subscription_cancel_reason WHERE bar_id = $1',
      [pub.barId]
    )
  ).toEqual([{ plan: 'pro', reason: 'low_traffic' }])

  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  const sessions = calls.filter(
    (call) =>
      call.path === '/billing_portal/sessions' &&
      call.body.customer === customerId
  )
  expect(sessions).toHaveLength(1)
  expect(sessions[0]?.body).toMatchObject({
    'flow_data[type]': 'subscription_cancel',
    'flow_data[subscription_cancel][subscription]': subscriptionId,
    locale: 'pt-BR',
    return_url: `${BASE_URL}/admin/billing`
  })

  // O motivo só vai ao Stripe com o cancelamento feito no portal (WEB-445):
  // o webhook do agendamento o grava em `cancellation_details`, uma vez.
  const reasonUpdates = async () =>
    (
      (await (await request.get(`${STUB_URL}/stripe/calls`)).json()) as {
        method: string
        path: string
        body: Record<string, string>
      }[]
    ).filter(
      (call) =>
        call.method === 'POST' &&
        call.path === `/subscriptions/${subscriptionId}`
    )
  expect(await reasonUpdates()).toHaveLength(0)
  const scheduled = stripeSubscription({
    id: subscriptionId,
    status: 'active',
    plan: 'pro',
    userId: pub.user.id,
    customerId,
    cancelAt: inDays(20)
  })
  const event = {
    id: `evt_e2e_${randomUUID()}`,
    object: 'event',
    type: 'customer.subscription.updated',
    data: { object: scheduled }
  }
  expect(
    (
      await deliverSubscription(
        request,
        'customer.subscription.updated',
        scheduled
      )
    ).ok()
  ).toBe(true)
  // Repetido, sem semear de novo: o Stripe já tem o motivo, nada muda.
  expect((await sendStripeWebhook(request, event)).ok()).toBe(true)
  const updates = await reasonUpdates()
  expect(updates.map((call) => call.body)).toEqual([
    {
      'cancellation_details[feedback]': 'other',
      'cancellation_details[comment]':
        'Motivo escolhido no app: Pouco movimento'
    }
  ])
})

// WEB-444: "Dados da nota" grava no bar e no cliente do Stripe, que põe a
// razão social, o CNPJ e o e-mail nas faturas.
test('Dados da nota: razão social, CNPJ e e-mail vão para o bar e para o Stripe (WEB-444)', async ({
  page
}) => {
  const pub = await createPub()
  const customerId = `cus_e2e_${randomUUID()}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  const nota = page.getByRole('region', { name: 'Dados da nota' })
  await expect(nota.getByText('EM BREVE')).toHaveCount(0)
  await expect(nota.getByText(/^Não informado/)).toHaveCount(3)

  await nota.getByRole('button', { name: 'Editar Razão social' }).click()
  await nota
    .getByLabel('Razão social')
    .fill('Bar do Zé Comércio de Bebidas Ltda.')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(
    nota.getByText('Bar do Zé Comércio de Bebidas Ltda.')
  ).toBeVisible()

  await nota.getByRole('button', { name: 'Editar CNPJ' }).click()
  const cnpj = nota.getByLabel('CNPJ', { exact: true })
  await cnpj.fill('11.222.333/0001-82')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByRole('alert')).toHaveText(
    'CNPJ inválido. Confira os números.'
  )
  // Dígito certo, mas o Stripe recusa (o dublê recusa este): nada é gravado.
  await cnpj.fill('99.999.999/0001-91')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByRole('alert')).toHaveText(
    'O Stripe não aceitou estes dados. Confira e tente de novo.'
  )
  await cnpj.fill('11222333000181')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByText('11.222.333/0001-81')).toBeVisible()

  await nota.getByRole('button', { name: 'Editar E-mail para notas' }).click()
  await nota.getByLabel('E-mail para notas').fill('financeiro@bardoze.com.br')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByText('financeiro@bardoze.com.br')).toBeVisible()
  await expect(nota.getByText(/^Não informado/)).toHaveCount(0)
  // O foco volta ao "Editar" da linha; Esc fecha o campo sem salvar.
  const editarEmail = nota.getByRole('button', {
    name: 'Editar E-mail para notas'
  })
  await expect(editarEmail).toBeFocused()
  await editarEmail.click()
  await nota.getByLabel('E-mail para notas').fill('outro@bardoze.com.br')
  await page.keyboard.press('Escape')
  await expect(
    nota.getByLabel('E-mail para notas', { exact: true })
  ).toHaveCount(0)
  await expect(editarEmail).toBeFocused()
  await expect(nota.getByText('financeiro@bardoze.com.br')).toBeVisible()

  const [row] = await query(
    'SELECT legal_name, cnpj, invoice_email FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(row).toEqual({
    legal_name: 'Bar do Zé Comércio de Bebidas Ltda.',
    cnpj: '11222333000181',
    invoice_email: 'financeiro@bardoze.com.br'
  })

  const calls = (
    (await (await page.request.get(`${STUB_URL}/stripe/calls`)).json()) as {
      method: string
      path: string
      body: Record<string, string>
    }[]
  ).filter((call) => call.path.startsWith(`/customers/${customerId}`))
  const updates = calls.filter(
    (call) => call.method === 'POST' && call.path === `/customers/${customerId}`
  )
  expect(updates.at(-1)?.body).toMatchObject({
    business_name: 'Bar do Zé Comércio de Bebidas Ltda.',
    email: 'financeiro@bardoze.com.br'
  })
  expect(
    calls
      .filter(
        (call) => call.method === 'POST' && call.path.endsWith('/tax_ids')
      )
      .map((call) => call.body)
  ).toEqual([
    { type: 'br_cnpj', value: '99.999.999/0001-91' },
    { type: 'br_cnpj', value: '11.222.333/0001-81' }
  ])
})

test('Elite ativo sem desconto gravado: mostra só a tabela cheia', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'elite',
      monthlyDiscountReais: 0,
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await expect(currentPlan(page)).toContainText('R$ 297')
  await expect(currentPlan(page)).not.toContainText('R$ 269')
})

test('Starter vê o caminho para o upgrade', async ({ page }) => {
  await openBilling(page, { subscription: { plan: 'starter' } })
  await expect(currentPlan(page)).toContainText('Starter')
  await expect(
    currentPlan(page).getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveAttribute('href', '/plan?origin=billing')
})

test('pagamento atrasado mostra o plano parado e manda regularizar', async ({
  page
}) => {
  await openBilling(page, {
    subscription: { plan: 'pro', status: 'past_due' }
  })
  await expect(currentPlan(page)).toContainText('Pro')
  await expect(currentPlan(page)).toContainText('Pagamento pendente')
  await expect(currentPlan(page)).toContainText(
    'O último pagamento não foi confirmado.'
  )
})

test('trial vigente mostra "Teste grátis" e até quando', async ({ page }) => {
  await openBilling(page, {
    subscription: { plan: 'pro', status: 'trialing' }
  })
  await expect(currentPlan(page)).toContainText('Pro')
  await expect(currentPlan(page)).toContainText('Teste grátis até')
  await expect(currentPlan(page)).toContainText(/faltam \d+ dias/)
  // WEB-343: o card mostra o preço de fundador que /plan promete. O cupom
  // esgotado, com a tabela cheia, está em `checkout.serial.e2e.ts`.
  await expect(currentPlan(page)).toContainText('R$ 119')
  await expect(currentPlan(page)).toContainText(
    'Com desconto de fundador no checkout'
  )
  // WEB-264: trial do cadastro não tem cliente no Stripe — sem portal para
  // abrir e sem pagamento; o caminho é contratar em `/plan` (WEB-31).
  await expect(
    page.getByText('Nenhum pagamento registrado ainda.')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Gerenciar assinatura' })
  ).toHaveCount(0)
  // WEB-339: sem assinatura no Stripe não há o que cancelar lá.
  await expect(cancelShortcut(page)).toHaveCount(0)
  await expect(
    currentPlan(page).getByText('O teste grátis não pede cartão.')
  ).toBeVisible()
  await expect(
    currentPlan(page).getByRole('link', { name: 'Contratar plano' })
  ).toHaveAttribute('href', '/plan?origin=billing')
})

test('trial vencido sem pagamento mostra "Teste encerrado"', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - 86_400_000)
    }
  })
  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('Teste encerrado')
  await expect(currentPlan(page)).toContainText(
    'O teste grátis terminou sem pagamento confirmado.'
  )
  // WEB-357: sem contratar, esse bar sai do ar; não são só os recursos.
  await expect(currentPlan(page)).toContainText(
    'O bar sai das buscas e do mapa até um plano ser contratado.'
  )
  // WEB-249: sem assinatura no provedor não há o que regularizar no portal;
  // o caminho para pagar é o checkout em `/plan`.
  await expect(
    currentPlan(page).getByRole('link', { name: 'Continuar no Elite' })
  ).toHaveAttribute('href', '/plan?origin=billing')
  await expect(currentPlan(page)).not.toContainText(
    'Atualize o método de pagamento'
  )
})

// WEB-60: quem cancelou lê "Cancelado"; "Inativo" fica para a cobrança
// pausada. Nos dois o plano contratado aparece, sem próxima cobrança.
for (const [status, label] of [
  ['cancelled', 'Cancelado'],
  ['inactive', 'Inativo']
] as const) {
  test(`assinatura ${status} mostra "${label}" e o caminho para contratar`, async ({
    page
  }) => {
    await openBilling(page, {
      subscription: {
        plan: 'pro',
        status,
        externalSubscriptionId: `sub_e2e_${randomUUID()}`
      },
      bar: { is_active: false }
    })
    await expect(currentPlan(page)).toContainText('Pro')
    await expect(currentPlan(page)).toContainText(label)
    await expect(currentPlan(page)).toContainText('Assinatura encerrada')
    await expect(currentPlan(page)).not.toContainText('Próxima cobrança')
    await expect(cancelShortcut(page)).toHaveCount(0)
    await expect(
      currentPlan(page).getByRole('link', { name: 'Contratar plano' })
    ).toHaveAttribute('href', '/plan?origin=billing')
  })
}

// WEB-344: o plano do card não volta em "Os planos", e Hoje não
// chama de "Plano atual" a assinatura que acabou.
test('assinatura encerrada: "Os planos", Hoje e o Desempenho seguem o card', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'starter',
      status: 'cancelled',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    },
    bar: { is_active: false }
  })
  await expect(currentPlan(page)).toContainText('Starter')
  const others = page.getByRole('region', { name: 'Os planos' })
  await expect(
    others.getByRole('link', { name: 'Contratar Pro' })
  ).toBeVisible()
  await expect(others.getByRole('link', { name: /Starter/ })).toHaveCount(0)

  await page.goto('/admin')
  const overview = page.locator('#painel-main')
  await expect(
    overview.getByText('Assinatura encerrada', { exact: true })
  ).toBeVisible()
  await expect(overview).not.toContainText('Plano atual')
  await page.goto('/admin/desempenho')
  await expect(overview).toContainText(
    'Plano Starter · Assinatura do plano Starter encerrada'
  )
})

test('bar sem assinatura', async ({ page }) => {
  await openBilling(page, { subscription: null })
  await expect(
    page.getByText('Nenhuma assinatura ativa encontrada.')
  ).toBeVisible()
})

test('a fixture grava current_period_end em UTC em qualquer fuso (WEB-197)', async () => {
  const end = new Date('2030-01-15T12:00:00.000Z')
  const tz = process.env.TZ
  process.env.TZ = 'America/Sao_Paulo'
  let pub: Awaited<ReturnType<typeof createPub>>
  try {
    pub = await createPub({ subscription: { currentPeriodEnd: end } })
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
  const [row] = await query<{ end: string }>(
    `SELECT to_char(current_period_end, 'YYYY-MM-DD"T"HH24:MI:SS') AS end
     FROM subscription WHERE bar_id = $1`,
    [pub.barId]
  )
  expect(row?.end).toBe('2030-01-15T12:00:00')
})
