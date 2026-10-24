import { randomUUID } from 'node:crypto'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import {
  deliverSubscription,
  seedStripeInvoices,
  stripeInvoice,
  stripeSubscription
} from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// `/plan` e `/plan/confirmed`. O checkout em si está em
// `checkout.serial.e2e.ts`.

/** A marca que `/plan` grava antes de mandar para o Stripe (WEB-59). */
const CHECKOUT_INTENT_KEY = 'onside:checkout-intent'

test('mostra Starter, Pro e Elite para quem ainda não assinou', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('heading', { name: 'Escolha o plano do seu bar.' })
  ).toBeVisible()
  // A tabela vem primeiro (tela 3h): uma coluna por plano, cada uma com a
  // contratação, e o Pro marcado para quem nunca teve plano.
  for (const plan of ['Starter', 'Pro', 'Elite']) {
    await expect(
      page.getByRole('heading', { name: plan, exact: true })
    ).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: `Contratar o ${plan}` })
    ).toBeVisible()
  }
  await expect(page.getByText('Ilimitados').first()).toBeVisible()
  await expect(page.getByText('5 por ciclo')).toBeVisible()
})

test('diz em nome de quem a assinatura sai, com o caminho para corrigir o bar (WEB-328)', async ({
  page
}) => {
  const { user, barId } = await createPub({
    subscription: null,
    user: { name: 'Dona Marta' }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // O checkout não pede nome nem empresa: saem do cadastro, e a confirmação
  // avisa antes de mandar para o Stripe.
  await page.getByRole('button', { name: 'Contratar o Pro' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Confirmar Pro' })
  ).toBeVisible()
  await expect(
    dialog.getByText(
      `Assinatura em nome de Dona Marta · Bar E2E ${barId.slice(0, 8)}.`
    )
  ).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: 'Alterar o nome do bar' })
  ).toHaveAttribute('href', '/admin/meu-espaco')
})

test('confirmar: resume plano, desconto de fundador e o que sai hoje, sem pedir cartão (3j)', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')

  await page.getByRole('button', { name: 'Contratar o Elite' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Plano EliteR$ 297/mês')
  await expect(dialog).toContainText('Desconto de fundador−R$ 28/mês')
  await expect(dialog).toContainText('TotalR$ 269/mês')
  // Sem teste em vigor a primeira cobrança é hoje.
  await expect(dialog).toContainText('Hoje você pagaR$ 269')
  await expect(dialog).not.toContainText('Primeira cobrança')
  // O cartão é digitado no checkout do Stripe; PIX ainda não existe.
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog).toContainText('PIX em breve')
  await expect(
    dialog.getByRole('button', { name: 'Confirmar · R$ 269 hoje' })
  ).toBeEnabled()

  await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(dialog).toHaveCount(0)
})

test('pagamento pendente: aviso para regularizar, sem checkout novo', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: { plan: 'pro', status: 'past_due' }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('Pagamento pendente').first()).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Regularize seu plano Pro.' })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(
    page.getByRole('button', { name: /^(Contratar|Continuar|Mudar|Garantir)/ })
  ).toHaveCount(0)
  // WEB-328: sem checkout, não há o que anunciar.
  await expect(page.getByText(/Assinatura em nome de/)).toHaveCount(0)
})

// WEB-249: o trial do onboarding é uma linha local, sem assinatura no
// provedor. Vencido, não há o que regularizar: o bar ainda não contratou. O
// clique que abre o checkout está em `checkout.serial.e2e.ts`.
test('trial encerrado sem assinatura no provedor: checkout do plano do trial', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(-1)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('Trial encerrado')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Continue no plano Elite.' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continuar no Elite' })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveCount(0)
})

test('trial encerrado com assinatura no provedor: regulariza, sem checkout novo', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(-1),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('link', { name: 'Regularizar assinatura' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^(Contratar|Continuar|Mudar|Garantir)/ })
  ).toHaveCount(0)
})

test('trial em vigor: sem cartão, e contratar qualquer plano já é possível (WEB-31)', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(14)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // WEB-261: quem ainda não paga não lê "alterar plano" nem "próximo ciclo de
  // cobrança". O card do Starter fala em ciclo de cobrança, mas do limite de
  // jogos (WEB-353).
  await expect(
    page.getByRole('heading', { name: /^Você está no Elite até / })
  ).toBeVisible()
  await expect(page.getByText('Trial gratuito · sem cartão')).toBeVisible()
  await expect(page.getByText('Alterar plano')).toHaveCount(0)
  await expect(page.getByText(/próximo ciclo de cobrança/)).toHaveCount(0)
  await expect(page.getByText('O teste grátis não pede cartão.')).toBeVisible()
  await expect(
    page.getByText(/primeira cobrança só sai em \d+ de /)
  ).toBeVisible()

  // WEB-249: a coluna marcada é a do plano do trial. Ele ainda não foi
  // contratado: o botão garante o plano, não diz "Plano atual".
  await expect(page.getByText('Seu teste')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plano atual' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Garantir Elite · R$ 0' })
  ).toBeVisible()

  // A primeira cobrança é no fim do teste.
  await page
    .getByRole('button', { name: 'Garantir o Elite · R$ 0 hoje' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Hoje você pagaR$ 0')
  await expect(dialog).toContainText('Primeira cobrança')
  await dialog.getByRole('button', { name: 'Fechar' }).click()

  // Contratar outro plano já, sem testar antes; o menor confirma o que perde.
  await page.getByRole('button', { name: 'ou contratar o Pro' }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Trocar para o Pro?' })
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Contratar o Pro' }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Confirmar Pro' })
  ).toBeVisible()
})

// WEB-358: o teste do cadastro não é só do Elite. Sem cartão e com o checkout
// desligado (o padrão daqui): testar não passa pela contratação.
test('trial em vigor: testa outro plano sem cartão, confirma o que perde no menor, e a troca sobrevive ao recarregar', async ({
  page
}) => {
  const { user, barId } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(100)
    },
    bar: { house_offer: 'Chopp em dobro' }
  })
  const stored = async () =>
    (
      await query<{
        plan: string
        bar_plan: string
        status: string
        external_subscription_id: string | null
        fim: string
      }>(
        `SELECT s.plan, b.plan AS bar_plan, s.status, s.external_subscription_id,
                s.current_period_end::text AS fim
         FROM subscription s JOIN bar b ON b.id = s.bar_id
         WHERE s.bar_id = $1`,
        [barId]
      )
    )[0]
  const before = await stored()
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('heading', { name: /^Você está no Elite até / })
  ).toBeVisible()
  await expect(
    page.getByText('Até lá você pode testar qualquer plano abaixo')
  ).toBeVisible()
  // Plano em teste ainda não é o plano contratado, e não tem para onde trocar.
  await expect(page.getByText('Seu teste')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Testar o Elite grátis' })
  ).toHaveCount(0)

  // Plano menor: o mesmo aviso do que se perde da troca paga (WEB-351).
  await page.getByRole('button', { name: 'Testar o Starter grátis' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Trocar para o Starter?' })
  ).toBeVisible()
  await expect(dialog).toContainText('Jogos ilimitados na agenda')
  await expect(dialog).toContainText(
    // Teste grátis não tem cobrança: o limite conta por mês.
    'no Starter só dá para criar 5 por mês.'
  )
  await expect(dialog).toContainText(
    'Sua oferta da casa sai do perfil e fica guardada.'
  )
  await dialog.getByRole('button', { name: 'Manter o Elite' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toEqual(before)

  await page.getByRole('button', { name: 'Testar o Starter grátis' }).click()
  await dialog.getByRole('button', { name: 'Testar o Starter grátis' }).click()
  await expect(
    page.getByRole('heading', { name: /^Você está no Starter até / })
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({
      hasText: 'Agora você está testando o Starter.'
    })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/plan$/)
  // Só o plano muda: mesma data, ainda sem cartão e sem Stripe.
  expect(await stored()).toEqual({
    ...before,
    plan: 'starter',
    bar_plan: 'starter'
  })

  await page.reload()
  await expect(
    page.getByRole('heading', { name: /^Você está no Starter até / })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Garantir Starter · R$ 0' })
  ).toBeVisible()
  await expect(page.getByText(/Agora você está testando/)).toHaveCount(0)

  // Plano maior troca direto, e dá para trocar de novo.
  await page.getByRole('button', { name: 'Testar o Pro grátis' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: /^Você está no Pro até / })
  ).toBeVisible()
  expect(await stored()).toEqual({ ...before, plan: 'pro', bar_plan: 'pro' })
})

// Teste vencido não troca de plano sem cartão: o caminho é contratar.
test('trial encerrado e trial que já é do Stripe não oferecem testar outro plano', async ({
  page
}) => {
  for (const subscription of [
    { currentPeriodEnd: inDays(-1) },
    {
      currentPeriodEnd: inDays(14),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  ]) {
    const { user } = await createPub({
      subscription: { plan: 'elite', status: 'trialing', ...subscription }
    })
    await page.context().clearCookies()
    await signIn(page, user)
    await page.goto('/plan')
    await expect(
      page.getByRole('button', { name: /^(Contratar|Mudar para) o Pro$/ })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Test/ })).toHaveCount(0)
    await expect(page.getByText('Seu teste')).toHaveCount(0)
  }
})

test('trial que já é do Stripe: troca de plano, com o plano contratado como atual', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(14),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByText('Alterar plano')).toBeVisible()
  await expect(page.getByText('Seu plano')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plano atual' })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Mudar para o Elite' })
  ).toBeVisible()
})

// WEB-347: depois de contratar no teste, "Plano e cobrança" confirma que
// "pegou" — selo próprio e a primeira cobrança, em vez do "Trial gratuito" de
// quem não pagou. O Hoje do painel novo não fala de plano: é só aqui.
test('trial que já é do Stripe: /admin/billing diz contratado e quando sai a primeira cobrança', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(100),
      externalSubscriptionId: `sub_e2e_${randomUUID()}`,
      monthlyDiscountReais: 28
    }
  })
  await signIn(page, user)
  await page.goto('/admin/billing')

  const currentPlan = page.getByRole('region', { name: 'Seu plano' })
  await expect(currentPlan).toContainText('Contratado · em teste')
  await expect(currentPlan).toContainText(
    /Primeira cobrança de R\$ 269 em \d{2}\/\d{2}\/\d{4}/
  )
  await expect(currentPlan).not.toContainText('Trial gratuito')
  await expect(
    page.getByRole('button', { name: 'Gerenciar assinatura' })
  ).toBeVisible()
  // Nem no rodapé nem em outro canto da página.
  await expect(page.getByText('Trial gratuito')).toHaveCount(0)
})

test('assinatura paga abre no próprio plano, sem checkout de outro por padrão', async ({
  page
}) => {
  const { user } = await createPub({ subscription: { plan: 'starter' } })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(page.getByRole('button', { name: 'Plano atual' })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: /^Mudar para o / })
  ).toHaveCount(2)
})

test('/plan/confirmed sem a marca do checkout volta para /plan', async ({
  page
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan/confirmed')

  await expect(page).toHaveURL(/\/plan$/)
  await expect(
    page.getByRole('heading', { name: 'Escolha o plano do seu bar.' })
  ).toBeVisible()
})

test('/plan/confirmed com a marca espera o webhook e imprime o recibo', async ({
  page,
  request
}) => {
  const { user } = await createPub({ subscription: null })
  await signIn(page, user)
  // A marca vive no localStorage da origem: grava numa página do app antes.
  await page.goto('/plan')
  // Em string: o tsconfig da suíte não carrega os tipos do DOM.
  await page.evaluate(
    `localStorage.setItem(${JSON.stringify(CHECKOUT_INTENT_KEY)}, ${JSON.stringify(
      JSON.stringify({ plan: 'pro', expiresAt: Date.now() + 30 * 60_000 })
    )})`
  )

  await page.goto('/plan/confirmed')
  // O visor da impressora é o `status` que anuncia cada estágio.
  const screen = page.locator('.onside-receipt-screen')
  await expect(screen).toHaveText(/Confirmando a assinatura/)
  await expect(page).toHaveURL(/\/plan\/confirmed$/)

  const subscriptionId = `sub_e2e_${user.id}`
  const subscription = stripeSubscription({
    id: subscriptionId,
    status: 'active',
    plan: 'pro',
    userId: user.id,
    founderDiscount: true
  })
  // A fatura que o checkout gerou, de onde sai o PDF do comprovante.
  await seedStripeInvoices(request, subscription, [
    stripeInvoice({
      id: `in_${subscriptionId}`,
      customer: subscription.customer,
      status: 'paid',
      total: 11900,
      created: new Date()
    })
  ])
  const webhook = await deliverSubscription(
    request,
    'customer.subscription.created',
    subscription
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)

  // A tela consulta a cada 2s; o recibo sai e é carimbado.
  await expect(screen).toHaveText(/Assinatura confirmada/, { timeout: 20_000 })
  await expect(
    page.getByRole('heading', { level: 1, name: /^Pro ativo no/ })
  ).toBeVisible()
  await expect(page.getByText('Pagamento confirmado')).toBeVisible()
  const receipt = page.locator('.onside-receipt-paper')
  await expect(receipt).toContainText('Pago e liberado')
  await expect(receipt).toContainText('Pro · mensalR$ 147,00')
  await expect(receipt).toContainText('Desconto de fundador−R$ 28,00')
  await expect(receipt).toContainText('Total pagoR$ 119,00')
  // Próximos passos do Pro: sem oferta da casa nem validação, que são do Elite.
  await expect(
    page.getByRole('link', { name: /Cadastre os jogos da semana/ })
  ).toHaveAttribute('href', '/admin/jogos')
  await expect(page.getByText('Revise a oferta da casa')).toHaveCount(0)
  // O PDF é o da fatura da contratação, no Stripe (WEB-443).
  await expect(page.getByRole('link', { name: 'Baixar PDF' })).toHaveAttribute(
    'href',
    `https://pay.stripe.com/invoice/in_${subscriptionId}/pdf`
  )
  await expect(receipt).toContainText(subscriptionId.slice(-16))
  // Recibo confirmado apaga a marca.
  const { origins } = await page.context().storageState()
  expect(
    origins.flatMap((origin) => origin.localStorage).map((item) => item.name)
  ).not.toContain(CHECKOUT_INTENT_KEY)
})

test('/plan/confirmed de quem contratou no teste grátis espera o Stripe, não imprime o plano do teste (WEB-31)', async ({
  page,
  request
}) => {
  const trialEnd = inDays(100)
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: trialEnd
    }
  })
  await signIn(page, user)
  await page.goto('/plan')
  await page.evaluate(
    `localStorage.setItem(${JSON.stringify(CHECKOUT_INTENT_KEY)}, ${JSON.stringify(
      JSON.stringify({ plan: 'starter', expiresAt: Date.now() + 30 * 60_000 })
    )})`
  )

  await page.goto('/plan/confirmed')
  const screen = page.locator('.onside-receipt-screen')
  // O bar já tem plano vigente (o teste do Elite), mas o que ele contratou
  // ainda não chegou: a tela espera em vez de imprimir o Elite.
  await expect(screen).toHaveText(/Confirmando a assinatura/)

  const webhook = await deliverSubscription(
    request,
    'customer.subscription.created',
    stripeSubscription({
      id: `sub_e2e_${user.id}`,
      status: 'trialing',
      plan: 'starter',
      userId: user.id,
      currentPeriodEnd: trialEnd
    })
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)

  await expect(screen).toHaveText(/Assinatura confirmada/, { timeout: 20_000 })
  const receipt = page.locator('.onside-receipt-paper')
  await expect(receipt).toContainText('Starter')
  // Contratou no teste: nada foi pago ainda.
  await expect(receipt).not.toContainText('Total pago')
  // Contratou durante o teste: o mesmo selo de `/admin/billing` (WEB-347).
  await expect(receipt).toContainText('Contratado · em teste')
  await expect(receipt).not.toContainText('Trial gratuito')
})

test.describe('torcedor', () => {
  test.use({ storageState: storageState('fan') })

  for (const path of ['/plan', '/plan/confirmed']) {
    test(`${path} manda para a página do app`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/torcedor$/)
    })
  }
})
