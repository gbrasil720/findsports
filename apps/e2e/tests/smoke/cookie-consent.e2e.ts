import type { Locator } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createEvent, days } from '../../fixtures/fan'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Aviso de cookies (WEB-243). Em `vite dev` não há análise; a suíte liga só o
// aviso (`VITE_E2E_CONSENT_BANNER` em `env.ts`), e todo teste nasce com ele
// respondido. Aqui ele é o assunto.

const banner = (page: { getByTestId: (id: string) => Locator }) =>
  page.getByTestId('cookie-consent')

const box = async (locator: Locator) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error('elemento sem caixa')
  return found
}

test.describe('sem escolha feita', () => {
  test.use({ cookieConsent: 'pending' })

  // No celular o aviso é uma barra no pé da tela. A busca do topo (a ação da
  // primeira dobra) não pode ficar embaixo dela, e aceitar tira a barra.
  test('celular: a barra não cobre a busca da landing, e aceitar a tira', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    const go = page.locator('#busca button[type="submit"]')

    for (const viewport of [
      { width: 360, height: 740 },
      { width: 390, height: 844 },
      { width: 412, height: 839 },
      { width: 768, height: 1024 }
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect(banner(page)).toBeVisible()
      await expect(banner(page)).toContainText(
        'Usamos cookies de análise com a sua permissão.'
      )
      await go.scrollIntoViewIfNeeded()
      const bar = await box(banner(page))
      const button = await box(go)
      expect(
        button.y + button.height <= bar.y || button.y >= bar.y + bar.height,
        `busca livre da barra em ${viewport.width}x${viewport.height}`
      ).toBe(true)
    }

    await banner(page).getByRole('button', { name: 'Aceitar' }).click()
    await expect(banner(page)).toBeHidden()

    // A escolha fica: recarregar não traz o aviso de volta.
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-consent')
    await expect(banner(page)).toBeHidden()
  })

  // O aviso não pode surgir depois da página: ele já vem no HTML, e um script
  // do `<head>` decide antes do primeiro paint se aparece.
  test('o aviso vem no HTML do servidor e aparece sem esperar a hidratação', async ({
    page,
    request
  }) => {
    const html = await (await request.get('/login')).text()
    expect(html).toContain('data-testid="cookie-consent"')
    expect(html).toContain("setAttribute('data-consent','pending')")

    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute(
      'data-consent',
      'pending'
    )
    await expect(banner(page)).toBeVisible()

    // Pelo teclado: em `vite dev` o botão das devtools do TanStack Router fica
    // no canto de baixo, por cima de "Recusar" na barra do celular.
    await banner(page).getByRole('button', { name: 'Recusar' }).press('Enter')
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('html')).not.toHaveAttribute('data-consent')
  })

  // WEB-370. O que é fixo no pé da janela sobe para cima do aviso: na página
  // do bar, a barra do jogo, que aparece quando o cartão passou para cima.
  test('celular: a barra do jogo e o toast ficam acima do aviso, e a barra desce quando ele some', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    const { barId } = await createPub()
    await createEvent({ barId, startsAt: days(2) })
    // Torcedor próprio: o teste salva o bar.
    await signIn(page, await createUser())
    const actions = page.locator('.mcta')
    // Quanto o elemento passa do topo do aviso: até 0 ele está livre.
    const under = (locator: Locator) => async () => {
      const bar = await box(banner(page))
      const found = await box(locator)
      return Math.round(found.y + found.height - bar.y)
    }

    await page.goto(`/pub/${barId}`)
    await expect(banner(page)).toBeVisible()
    await page.evaluate('scrollTo(0, 1600)')
    await expect(actions).toHaveClass(/\bon\b/)
    await expect(actions).toBeInViewport({ ratio: 1 })
    await expect.poll(under(actions), 'barra do jogo').toBeLessThanOrEqual(0)

    await page.evaluate('scrollTo(0, 0)')
    await page
      .getByRole('button', { name: `Salvar o Bar E2E ${barId.slice(0, 8)}` })
      .click()
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible()
    await expect.poll(under(toast), 'toast').toBeLessThanOrEqual(0)

    await banner(page).getByRole('button', { name: 'Recusar' }).press('Enter')
    await expect(banner(page)).toBeHidden()
    // Sem o aviso ela volta para o pé da janela.
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('sem viewport')
    await page.evaluate('scrollTo(0, 1600)')
    await expect(actions).toHaveClass(/\bon\b/)
    await expect
      .poll(async () => {
        const found = await box(actions)
        return Math.round(found.y + found.height)
      })
      .toBe(viewport.height)
  })

  // Um aviso só, o "Placar", em todo o site: o Explorar mostrava o antigo,
  // centrado embaixo, e a página do bar o novo, no canto.
  test('um aviso só no DOM, o mesmo no Explorar, na página do bar e no login', async ({
    page,
    isMobile
  }) => {
    const { barId } = await createPub()
    await createEvent({ barId, startsAt: days(2) })
    const aparencia = async () => {
      await expect(banner(page)).toHaveCount(1)
      await expect(banner(page)).toBeVisible()
      await expect(page.locator('.onside-consent')).toHaveCount(1)
      // Texto, e não função: a suíte compila sem os tipos do DOM.
      return page.evaluate(
        "(() => { const c = getComputedStyle(document.querySelector('.onside-consent')); return [c.borderRadius, c.backgroundColor, c.width] })()"
      )
    }

    await page.goto('/dashboard')
    const explorar = await aparencia()
    if (!isMobile) {
      // No canto direito, não centrado.
      const viewport = page.viewportSize()
      const bar = await box(banner(page))
      if (!viewport) throw new Error('sem viewport')
      expect(Math.round(viewport.width - bar.x - bar.width)).toBe(32)
    }
    await page.goto(`/pub/${barId}`)
    expect(await aparencia()).toEqual(explorar)
    await page.goto('/login')
    expect(await aparencia()).toEqual(explorar)
  })

  // No celular, logado, o Explorar tem as abas de baixo e a folha de bares:
  // as duas acabam acima do aviso, que não as cobre.
  test('celular: no Explorar o aviso não cobre as abas nem a folha', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    await signIn(page, await createUser())
    await page.goto('/dashboard')
    await expect(banner(page)).toBeVisible()
    const abas = page.getByRole('navigation', { name: 'Sua conta' })
    const folha = page.getByRole('region', { name: 'Bares' })
    await expect(abas).toBeVisible()
    await expect(folha).toBeVisible()
    await expect
      .poll(async () => {
        const bar = await box(banner(page))
        const tabs = await box(abas)
        const mapa = await box(page.locator('.mx'))
        return [
          Math.round(tabs.y + tabs.height - bar.y),
          Math.round(mapa.y + mapa.height - bar.y)
        ]
      })
      .toEqual([0, 0])

    // Sem o aviso, as abas voltam ao pé da janela.
    await banner(page).getByRole('button', { name: 'Recusar' }).press('Enter')
    await expect(banner(page)).toBeHidden()
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('sem viewport')
    await expect
      .poll(async () => {
        const tabs = await box(abas)
        return Math.round(tabs.y + tabs.height)
      })
      .toBe(viewport.height)
  })

  // Em 320x568 o "Entrar" do login cai na faixa do aviso. O
  // navegador o dava por visível e não rolava ao receber o foco.
  test('celular: botão que recebe o foco debaixo do aviso rola para cima dele', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/login')
    await expect(banner(page)).toBeVisible()
    const submit = page.getByRole('button', { name: 'Entrar', exact: true })
    await submit.focus()
    await expect
      .poll(async () => {
        const bar = await box(banner(page))
        const button = await box(submit)
        return Math.round(button.y + button.height - bar.y)
      })
      .toBeLessThanOrEqual(0)
  })
})

test('quem já respondeu não vê o aviso, e o rodapé da landing o reabre com a escolha atual', async ({
  page
}) => {
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveAttribute('data-consent')
  await expect(banner(page)).toBeHidden()

  await page.getByRole('button', { name: 'Cookies', exact: true }).click()
  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText(
    'Hoje você recusa os cookies de análise.'
  )
  await banner(page).getByRole('button', { name: 'Aceitar' }).click()
  await expect(banner(page)).toBeHidden()
})
