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

// A faixa fica por cima do conteúdo: o fim da página ganha a altura dela e,
// com o trilho de ícones, ela sai de cima de "Validar código" e da conta.
test('sem rede, a faixa não cobre nenhum botão, nem a 320 px', async ({
  page,
  context,
  isMobile
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 640 })
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')
  const nav = page.getByRole('navigation', { name: 'Painel do bar' })
  await expect(nav.getByRole('link', { name: 'Jogos' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)

  const faixa = page.locator('.painel-faixa-rede')
  for (const tela of ['Jogos', 'Desempenho', 'Meu espaço', 'Configurações']) {
    await nav.getByRole('link', { name: tela, exact: true }).click()
    await expect(faixa).toHaveAttribute('data-visivel', 'true')
    // A faixa sobe 8 px na entrada e a tela termina de montar: mede parado,
    // no fim da página.
    await page.waitForTimeout(400)
    await page.evaluate(
      'window.scrollTo(0, document.documentElement.scrollHeight)'
    )
    const f = await faixa.boundingBox()
    if (!f) throw new Error('faixa sem caixa')
    const viewportH = page.viewportSize()?.height ?? 0
    const cobertos: string[] = []
    for (const el of await page
      .locator('a, button, input, [role="button"]')
      .all()) {
      const r = await el.boundingBox()
      if (!r || !r.width || !r.height) continue
      if (r.y + r.height <= 0 || r.y >= viewportH) continue
      if (
        r.x < f.x + f.width &&
        r.x + r.width > f.x &&
        r.y < f.y + f.height &&
        r.y + r.height > f.y
      )
        cobertos.push(
          (await el.textContent())?.trim() ||
            ((await el.getAttribute('aria-label')) ?? '?')
        )
    }
    expect(cobertos, `${tela}: coberto pela faixa`).toEqual([])
    if (tela === 'Jogos')
      await page.screenshot({
        path: test
          .info()
          .outputPath(`faixa-${isMobile ? '320' : 'desktop'}.png`)
      })
  }
})
