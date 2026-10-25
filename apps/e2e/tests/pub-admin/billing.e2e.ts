import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent, createTicket } from '../../fixtures/going'
import { painelLink } from '../../fixtures/painel'
import { createPub, inDays, type PubOptions } from '../../fixtures/pubs'
import {
  deliverSubscription,
  seedStripeInvoices,
  sendStripeWebhook,
  stripeInvoice,
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
  page.getByRole('button', { name: 'Cancelar plano' })

test('o painel leva à cobrança e à validação', async ({ page }) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')

  await painelLink(page, 'Plano e cobrança').click()
  await expect(page).toHaveURL(/\/admin\/billing$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Plano e cobrança' })
  ).toBeVisible()

  await page.goto('/admin')
  await page.getByRole('link', { name: 'Validar código' }).click()
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

const faturas = (page: Page) => page.getByRole('region', { name: 'Faturas' })

test('Elite ativo: plano, faturas e portal do Stripe', async ({
  page,
  request
}) => {
  // O portal só existe para quem tem cliente no Stripe (WEB-264): o id da
  // assinatura e o do cliente são o rastro de quem já passou pelo checkout.
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: {
      externalSubscriptionId: subscriptionId,
      monthlyDiscountReais: 28
    }
  })
  const customerId = `cus_e2e_${randomUUID()}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  // O mês do bar (WEB-446): dois marcaram que iam a um jogo de agora, um
  // código validado no balcão.
  const { eventId } = await createEvent(pub.barId, { startsAt: new Date() })
  const [ticket] = await Promise.all([
    createTicket(eventId),
    createTicket(eventId)
  ])
  await query(
    `INSERT INTO reservation_code_use (id, code_id)
     SELECT gen_random_uuid()::text, id FROM reservation_code WHERE reservation_id = $1`,
    [ticket.reservationId]
  )
  // Faturas do Stripe (WEB-443, 3o): a paga de outubro e a de R$ 0 que o
  // Stripe emitiu ao abrir o teste. Rascunho não aparece.
  await seedStripeInvoices(
    request,
    { id: subscriptionId, customer: customerId },
    [
      stripeInvoice({
        id: `in_draft_${subscriptionId}`,
        customer: customerId,
        status: 'draft',
        total: 26900,
        created: new Date('2026-11-12T15:00:00Z')
      }),
      stripeInvoice({
        id: `in_out_${subscriptionId}`,
        customer: customerId,
        status: 'paid',
        total: 26900,
        created: new Date('2026-10-12T15:00:00Z')
      }),
      stripeInvoice({
        id: `in_teste_${subscriptionId}`,
        customer: customerId,
        status: 'paid',
        total: 0,
        created: new Date('2026-08-20T15:00:00Z'),
        trialEnd: new Date('2026-10-12T15:00:00Z')
      })
    ]
  )
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('R$ 269')
  await expect(currentPlan(page)).toContainText('R$ 297')
  await expect(currentPlan(page)).toContainText('Preço de fundador')
  await expect(currentPlan(page)).toContainText(/por mês · renova \d+ /)
  // O que o plano rendeu no mês (3o).
  const kpi = (label: string) =>
    currentPlan(page).locator('dl > div', { hasText: label })
  await expect(kpi('marcaram que iam este mês')).toContainText('2')
  await expect(kpi('clássicos no topo este mês')).toContainText('0')
  await expect(kpi('código validado este mês')).toContainText('1')
  const rows = faturas(page).getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Outubro 2026')
  await expect(rows.nth(0)).toContainText('Pago em 12 out')
  await expect(rows.nth(0)).toContainText('R$ 269')
  await expect(rows.nth(0)).toContainText('Pago')
  await expect(
    rows.nth(0).getByRole('link', { name: /^Baixar PDF/ })
  ).toHaveAttribute(
    'href',
    `https://pay.stripe.com/invoice/in_out_${subscriptionId}/pdf`
  )
  await expect(rows.nth(1)).toContainText('Agosto 2026')
  await expect(rows.nth(1)).toContainText('Elite grátis até 12 out')
  await expect(rows.nth(1)).toContainText('R$ 0')
  await expect(rows.nth(1)).toContainText('Teste')
  await expect(rows.nth(1).getByRole('link')).toHaveCount(0)
  await expect(faturas(page).getByText('em breve')).toHaveCount(0)
  // PIX ainda não existe: aparece "em breve".
  await expect(page.getByRole('button', { name: 'Usar PIX' })).toBeDisabled()

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

// WEB-444: "Dados da nota" (3o) grava no bar e no cliente do Stripe, que põe
// a razão social, o CNPJ e o e-mail nas faturas.
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
  await expect(nota.getByText('em breve')).toHaveCount(0)
  await expect(nota.getByText('Não informado')).toHaveCount(3)

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
  await cnpj.fill('11222333000181')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByText('11.222.333/0001-81')).toBeVisible()

  await nota.getByRole('button', { name: 'Editar E-mail para notas' }).click()
  await nota.getByLabel('E-mail para notas').fill('financeiro@bardoze.com.br')
  await nota.getByRole('button', { name: 'Salvar' }).click()
  await expect(nota.getByText('financeiro@bardoze.com.br')).toBeVisible()
  await expect(nota.getByText('Não informado')).toHaveCount(0)

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
  ).toEqual([{ type: 'br_cnpj', value: '11.222.333/0001-81' }])
})

// WEB-339: o atalho abre o portal já no cancelamento, em português, pela
// rota do app (`pub.openSubscriptionCancel`), que antes confere a assinatura
// no Stripe.
test('assinatura ativa: "Cancelar assinatura" abre o portal no fluxo de cancelamento (WEB-339)', async ({
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

  await expect(
    page.getByRole('button', { name: 'Gerenciar assinatura' })
  ).toBeVisible()
  // Fora do Elite o card segue com as visitas do mês (WEB-446).
  await expect(currentPlan(page)).toContainText('viram o bar este mês')
  await expect(currentPlan(page)).toContainText('se interessaram este mês')
  await expect(currentPlan(page)).not.toContainText('marcaram que iam')
  // Antes do portal, a retenção (3q): o que se perde e a troca para baixo.
  await cancelShortcut(page).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: /Cancelar\s*o Pro\?/ })
  ).toBeVisible()
  await expect(dialog).toContainText('Mudar para o Starter')
  // Presenças e clássicos são do Elite: o Pro vê quem viu o bar.
  await expect(dialog).toContainText('pessoas que viram o bar este mês')
  await expect(dialog).not.toContainText('marcaram que iam')
  await expect(dialog).not.toContainText('clássicos')
  // Fechar sem confirmar não grava motivo (WEB-445).
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
  // Um motivo só: escolher outro troca (3q).
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
    currentPlan(page).getByRole('link', { name: 'Trocar plano' })
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
  await expect(currentPlan(page)).toContainText('cobrança não confirmada')
  // O motivo sobe para o aviso do topo (3s).
  const aviso = page.getByRole('region', { name: 'Aviso do plano' })
  await expect(aviso).toContainText('Plano Pro com pagamento pendente')
  await expect(aviso).toContainText('O último pagamento não foi confirmado.')
  await expect(aviso).toContainText('o cardápio no perfil')
})

// WEB-443 (3s): a fatura do mês fica pendente, com a data em que o cartão
// foi recusado, e o card diz de que dia é a cobrança não confirmada.
test('pagamento pendente: fatura pendente com a data da recusa', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const customerId = `cus_e2e_${randomUUID()}`
  await seedStripeInvoices(
    request,
    { id: subscriptionId, customer: customerId },
    [
      stripeInvoice({
        id: `in_out_${subscriptionId}`,
        customer: customerId,
        status: 'open',
        total: 26900,
        created: new Date('2026-10-12T12:00:00Z'),
        attempts: 2
      })
    ],
    [
      { status: 'failed', created: new Date('2026-10-14T15:00:00Z') },
      { status: 'failed', created: new Date('2026-10-12T13:00:00Z') }
    ]
  )
  await openBilling(page, {
    subscription: {
      plan: 'elite',
      status: 'past_due',
      externalSubscriptionId: subscriptionId
    }
  })

  await expect(currentPlan(page)).toContainText(
    'por mês · cobrança de 14 out não confirmada'
  )
  const row = faturas(page).getByRole('listitem')
  await expect(row).toContainText('Outubro 2026')
  await expect(row).toContainText('Cartão recusado em 14 out')
  await expect(row).toContainText('Pendente')
  await expect(row.getByRole('link', { name: /^Baixar PDF/ })).toBeVisible()
})

test('assinatura no Stripe sem fatura emitida', async ({ page }) => {
  await openBilling(page, {
    subscription: { externalSubscriptionId: `sub_e2e_${randomUUID()}` }
  })
  await expect(
    faturas(page).getByText('Nenhuma fatura emitida ainda.')
  ).toBeVisible()
})

test('trial vigente mostra "Trial gratuito" e até quando', async ({ page }) => {
  await openBilling(page, {
    subscription: { plan: 'pro', status: 'trialing' }
  })
  await expect(currentPlan(page)).toContainText('Pro')
  await expect(currentPlan(page)).toContainText('Trial gratuito até')
  await expect(currentPlan(page)).toContainText(/faltam \d+ dias/)
  // WEB-343: o card mostra o preço de fundador que /plan promete. O cupom
  // esgotado, com a tabela cheia, está em `checkout.serial.e2e.ts`.
  await expect(currentPlan(page)).toContainText('R$ 119')
  await expect(currentPlan(page)).toContainText('Preço de fundador')
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

test('trial vencido sem pagamento mostra "Trial encerrado"', async ({
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
  await expect(currentPlan(page)).toContainText('Trial encerrado')
  await expect(currentPlan(page)).toContainText(
    'O trial gratuito terminou sem pagamento confirmado.'
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
    await expect(currentPlan(page)).not.toContainText('renova')
    await expect(cancelShortcut(page)).toHaveCount(0)
    await expect(
      currentPlan(page).getByRole('link', { name: 'Contratar plano' })
    ).toHaveAttribute('href', '/plan?origin=billing')
  })
}

// WEB-344: o card mostra o plano encerrado; os outros planos ficam em `/plan`
// ("Ver todos os planos").
test('assinatura encerrada: o card segue o plano encerrado', async ({
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
  await expect(
    page.getByRole('link', { name: 'Ver todos os planos' })
  ).toHaveAttribute('href', '/plan?origin=billing')
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
