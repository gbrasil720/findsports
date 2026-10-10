import { randomUUID } from 'node:crypto'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import { createEvent } from '../../fixtures/reservations'
import { deliverSubscription, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// WEB-351: trocar para um plano menor confirma no app o que o bar perde antes
// de abrir o Stripe, e o retorno do portal avisa a troca quando ela aconteceu.
// Upgrade e contratação seguem sem confirmação: é o que
// `checkout.serial.e2e.ts` exercita.

const CREDIT_NOTICE =
  'A diferença vira crédito na sua conta e abate as próximas mensalidades (não é reembolsada no cartão).'
const EVENTS_NOTE =
  'Você tem 7 jogos futuros. Os jogos já cadastrados continuam no ar, mas no Starter só dá para criar 5 por ciclo de cobrança.'

test('plano menor: confirmação com o que o bar perde, portal só depois, e o retorno avisa a troca feita', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const customerId = `cus_e2e_${randomUUID()}`
  const { user, barId } = await createPub({
    subscription: { plan: 'elite', externalSubscriptionId: subscriptionId },
    bar: {
      house_offer: 'Chopp em dobro',
      menu_url: 'https://bar.example/cardapio',
      average_spend_cents: 6000,
      accepts_reservations: true
    }
  })
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    user.id
  ])
  for (let day = 1; day <= 7; day++) {
    await createEvent(barId, { startsAt: inDays(day) })
  }
  // A assinatura existe no Stripe: é ela que faz a troca ir para o portal.
  const inStripe = (plan: 'elite' | 'starter') =>
    stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan,
      userId: user.id,
      customerId
    })
  await request.post(`${STUB_URL}/stripe/subscriptions`, {
    data: inStripe('elite')
  })
  const portalSessions = async () =>
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

  await signIn(page, user)
  await page.goto('/plan')
  await expect(page.getByRole('radio', { name: /^Elite,/ })).toBeChecked()
  await page.getByRole('radio', { name: /^Starter,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Continuar com Starter' }).click()

  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Trocar para o Starter?' })
  ).toBeVisible()
  // A lista do catálogo, com os números deste bar.
  await expect(dialog).toContainText('Jogos ilimitados na agenda')
  await expect(dialog).toContainText(EVENTS_NOTE)
  await expect(dialog).toContainText(
    'Seu link do cardápio e seu gasto médio saem do perfil e ficam guardados.'
  )
  await expect(dialog).toContainText(
    'Sua oferta da casa sai do perfil e fica guardada.'
  )
  await expect(dialog).toContainText(
    'Seu bar para de receber novos pedidos de reserva.'
  )
  await expect(dialog).toContainText(CREDIT_NOTICE)
  // O aviso de crédito mora na confirmação, não solto na página.
  await expect(page.getByText(CREDIT_NOTICE)).toHaveCount(1)
  expect(await portalSessions()).toHaveLength(0)

  // Desistir fecha a confirmação e não abre nada no Stripe.
  await dialog.getByRole('button', { name: 'Manter o Elite' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await portalSessions()).toHaveLength(0)

  await page.getByRole('button', { name: 'Continuar com Starter' }).click()
  await dialog.getByRole('button', { name: 'Continuar com Starter' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/portal/**`)
  const [portal] = await portalSessions()
  const returnUrl = `${BASE_URL}/admin/billing?planFrom=elite&planTo=starter`
  expect(portal?.body).toMatchObject({
    'flow_data[type]': 'subscription_update_confirm',
    'flow_data[subscription_update_confirm][items][0][price]':
      'price_e2e_starter_monthly',
    return_url: returnUrl,
    'flow_data[after_completion][redirect][return_url]': returnUrl
  })

  // Voltou do portal sem confirmar: o plano é o mesmo, e nada de aviso.
  const currentPlan = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Plano atual' })
  })
  await page.goto(returnUrl)
  await expect(currentPlan).toContainText('Elite')
  await expect(page.getByText(/Plano alterado para/)).toHaveCount(0)

  // A troca feita chega pelo webhook, depois do navegador: a página espera.
  const webhook = await deliverSubscription(
    request,
    'customer.subscription.updated',
    inStripe('starter')
  )
  expect(webhook.ok(), await webhook.text()).toBe(true)
  const notice = page.getByRole('status').filter({
    hasText: 'Plano alterado para Starter.'
  })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(EVENTS_NOTE)
  await expect(notice).toContainText(
    'Sua oferta da casa sai do perfil e fica guardada.'
  )
  await expect(currentPlan).toContainText('Starter')

  // Recarregar não repete o aviso.
  await expect(page).toHaveURL(`${BASE_URL}/admin/billing`)
  await page.reload()
  await expect(currentPlan).toContainText('Starter')
  await expect(page.getByText(/Plano alterado para/)).toHaveCount(0)
})

test('teste grátis: plano menor também confirma, sem prometer crédito, e segue para o checkout', async ({
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

  await expect(
    page.getByRole('heading', { name: /^Você está no trial do Elite até / })
  ).toBeVisible()
  await page.getByRole('radio', { name: /^Pro,/ }).check({ force: true })
  await page.getByRole('button', { name: 'Contratar Pro' }).click()

  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Trocar para o Pro?' })
  ).toBeVisible()
  await expect(dialog).toContainText('Reserva de mesa pela plataforma')
  await expect(dialog).not.toContainText('Jogos ilimitados na agenda')
  // Em teste grátis não há o que creditar (WEB-350).
  await expect(page.getByText(CREDIT_NOTICE)).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Contratar Pro' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
})
