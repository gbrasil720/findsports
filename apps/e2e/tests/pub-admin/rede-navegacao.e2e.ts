import { signIn } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Troca de tela sem rede no painel (WEB-470): a sessão da raiz não chega ao
// servidor, e a navegação fica com a última conferida em vez de cair na
// página de erro. O código e o CSS das telas já vieram com o painel.

test('sem rede, o menu troca de tela com a faixa de "sem conexão" e sem página de erro', async ({
  page,
  context
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')
  const nav = page.getByRole('navigation', { name: 'Painel do bar' })
  const faixa = page
    .getByText('Sem conexão. O painel se atualiza quando a rede voltar.')
    .first()
  const erro = page.getByText('Não deu pra')
  await expect(nav.getByRole('link', { name: 'Jogos' })).toBeVisible()
  // As telas baixam depois de o painel abrir: espera a de Jogos chegar.
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  await expect(faixa).toBeVisible()

  await nav.getByRole('link', { name: 'Jogos' }).click()
  await expect(page).toHaveURL(/\/admin\/jogos$/)
  await expect(page.getByRole('heading', { name: 'Jogos' })).toBeVisible()
  // O CSS da tela veio com o painel: a barra de filtros está de pé.
  await expect(page.locator('.jogos-barra')).toHaveCSS('display', 'flex')
  await expect(faixa).toBeVisible()
  await expect(erro).toHaveCount(0)

  await nav.getByRole('link', { name: 'Desempenho' }).click()
  await expect(page).toHaveURL(/\/admin\/desempenho$/)
  await expect(faixa).toBeVisible()
  await expect(erro).toHaveCount(0)

  await context.setOffline(false)
  await expect(faixa).toBeHidden()
  await nav.getByRole('link', { name: 'Hoje' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(erro).toHaveCount(0)
})
