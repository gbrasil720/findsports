import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { painelLink } from '../../fixtures/painel'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Gating por plano no painel do bar: cada recurso pago (cardápio = Pro,
// oferta da casa e a lista de quem vai = Elite) mostra o aviso certo para
// cada plano, e o servidor recusa o que a tela esconde.

async function openSpace(page: Page, options: PubOptions) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  await page.goto('/admin/meu-espaco')
  await expect(painelLink(page, 'Meu espaço')).toHaveAttribute(
    'aria-current',
    'page'
  )
  return pub
}

/** Card de recurso pago: `section` rotulada pelo título. */
const card = (page: Page, title: string) =>
  page.getByRole('region', { name: title, exact: true })

test('Starter: cardápio, oferta e Quem vai bloqueados, com link para os planos', async ({
  page
}) => {
  await openSpace(page, { subscription: { plan: 'starter' } })

  await expect(card(page, 'Cardápio e preço médio')).toContainText(
    'Disponível nos planos Pro e Elite'
  )
  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
  await expect(
    card(page, 'Cardápio e preço médio').getByRole('link', {
      name: 'Ver planos'
    })
  ).toHaveAttribute('href', /\/plan\?origin=admin/)
  await expect(painelLink(page, 'Quem vai')).toHaveCount(0)
})

test('sem assinatura: tudo bloqueado, como no Starter', async ({ page }) => {
  await openSpace(page, { subscription: null })

  await expect(card(page, 'Cardápio e preço médio')).toContainText(
    'Disponível nos planos Pro e Elite'
  )
  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
  await expect(painelLink(page, 'Quem vai')).toHaveCount(0)
})

test('a barra lateral leva às rotas, o hash antigo também, e Configurações renderiza', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')
  await expect(painelLink(page, 'Hoje')).toHaveAttribute('aria-current', 'page')

  await painelLink(page, 'Configurações').click()
  await expect(page).toHaveURL(/\/admin\/configuracoes$/)
  await expect(
    page.getByRole('heading', { name: 'Configurações', level: 1 })
  ).toBeVisible()

  // Link salvo das abas de antes (`/admin#admin-grade`) cai na rota nova.
  await page.goto('/admin#admin-grade')
  await expect(page).toHaveURL(/\/admin\/jogos$/)
  await expect(
    page.getByRole('heading', { name: 'Minha grade', level: 2 })
  ).toBeVisible()
})

test('Pro: cardápio liberado e salvo; oferta e Quem vai seguem bloqueadas', async ({
  page
}) => {
  const { barId } = await openSpace(page, { subscription: { plan: 'pro' } })

  const menu = card(page, 'Cardápio e preço médio')
  await expect(menu).not.toContainText('Disponível nos planos')
  await menu
    .getByLabel(/link do cardápio/i)
    .fill('https://cardapio.e2e.test/menu')
  await menu.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(async () => {
      const [bar] = await query('SELECT menu_url FROM bar WHERE id = $1', [
        barId
      ])
      return bar?.menu_url
    })
    .toBe('https://cardapio.e2e.test/menu')

  await expect(card(page, 'Oferta da casa')).toContainText(
    'Disponível no plano Elite'
  )
})

test('Elite tem a aba Quem vai, e o jogo novo não pergunta de reserva', async ({
  page
}) => {
  await openSpace(page, { subscription: { plan: 'elite' } })
  await expect(painelLink(page, 'Quem vai')).toBeVisible()
  await page.goto('/admin/jogos')
  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo evento' })
  await expect(dialog.getByLabel('Campeonato')).toBeVisible()
  await expect(dialog).not.toContainText(/reserva/i)
})

test('Elite com pagamento atrasado vê "Regularizar assinatura", não os planos', async ({
  page
}) => {
  await openSpace(page, {
    subscription: { plan: 'elite', status: 'past_due' }
  })

  const offer = card(page, 'Oferta da casa')
  await expect(
    offer.getByRole('link', { name: 'Regularizar assinatura' })
  ).toHaveAttribute('href', '/admin/billing')
  await expect(offer.getByRole('link', { name: 'Ver planos' })).toHaveCount(0)
  // Sem código em aberto, a lista de quem vai some com o plano.
  await expect(painelLink(page, 'Quem vai')).toHaveCount(0)
})

test('o servidor recusa recurso pago fora do plano', async ({ page }) => {
  const pub = await createPub({ subscription: { plan: 'starter' } })
  await signIn(page, pub.user)
  const call = (path: string, data: unknown) =>
    page.request.post(`/api/trpc/${path}`, { data })

  expect(
    (
      await call('pub.updateMenuInfo', {
        menuUrl: 'https://cardapio.e2e.test'
      })
    ).status()
  ).toBe(403)
  expect(
    (
      await call('pub.updateHouseOffer', { houseOffer: 'Chope grátis' })
    ).status()
  ).toBe(403)

  const [bar] = await query(
    'SELECT menu_url, house_offer FROM bar WHERE id = $1',
    [pub.barId]
  )
  expect(bar).toEqual({ menu_url: null, house_offer: null })
})
