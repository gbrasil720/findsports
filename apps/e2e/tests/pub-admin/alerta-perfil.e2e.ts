import { signIn } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Alerta de perfil do painel: o bar sem horário vê o aviso no topo, o link
// leva a Meu espaço no campo, e o X o tira por 3 dias (na conta, não na aba).

const TITULO = 'Seu bar está sem horário de funcionamento'

test('bar sem horário: alerta, link para Meu espaço e "Agora não"', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin/desempenho')

  const alerta = page.getByRole('status').filter({ hasText: TITULO })
  await expect(alerta).toBeVisible()

  await alerta.getByRole('link', { name: 'Informar horário' }).click()
  await expect(page).toHaveURL(/\/admin\/meu-espaco#esp-hor$/)
  await expect(
    page.getByRole('switch', { name: 'Aberto segunda' })
  ).toBeFocused()
  // Meu espaço não mostra o alerta.
  await expect(page.getByText(TITULO)).toHaveCount(0)

  await page.goto('/admin/desempenho')
  await alerta.getByRole('button', { name: /Agora não/ }).click()
  await expect(alerta).toHaveCount(0)
  await expect(
    page.getByText(/Tudo bem\. Lembramos de novo em \d+ \w+\./)
  ).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(TITULO)).toHaveCount(0)
})
