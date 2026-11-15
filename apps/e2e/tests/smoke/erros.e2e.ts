import { expect, test } from '../../fixtures/test'

// As páginas de erro do Jules (WEB-554): uma página só, que troca o número,
// a frase e o botão principal. A vitrine `/erro/<código>` só existe no
// `vite dev` e no build do E2E.

const ERROS = [
  ['403', 'Cartão vermelho.', 'Entrar com outra conta'],
  ['500', 'Caiu o sinal.', 'Tentar de novo'],
  ['503', 'Intervalo técnico.', 'Tentar de novo'],
  ['429', 'Calma, craque.', 'Tentar de novo'],
  ['off', 'Sem sinal.', 'Tentar de novo']
] as const

for (const [codigo, titulo, botao] of ERROS) {
  test(`página de erro ${codigo}`, async ({ page }) => {
    await page.goto(`/erro/${codigo}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo)
    await expect(
      page.getByRole(codigo === '403' ? 'link' : 'button', { name: botao })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Voltar ao início' })
    ).toBeVisible()
    if (codigo === '500')
      await expect(page.getByText('Código para o suporte:')).toBeVisible()
  })
}

test('a 404 é a página do Jules e continua 404', async ({ page }) => {
  const response = await page.goto('/nao-existe-jules-e2e')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bola fora.')
  await expect(
    page.getByRole('link', { name: 'Ver jogos de hoje' })
  ).toBeVisible()
})
