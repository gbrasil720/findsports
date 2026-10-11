import type { Locator } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
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

  // No celular o aviso é uma barra no pé da tela, bem onde a chamada do hero
  // termina. Enquanto a escolha está pendente a arte do hero cede a altura.
  test('celular: a barra não cobre a chamada principal da landing, e aceitar a tira', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    const hero = page.locator('.onside-hero [data-cta]')
    const stage = page.locator('.onside-hero-stage')

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
      // `poll`: a entrada do hero anima a chamada até o lugar dela.
      await expect
        .poll(async () => {
          const bar = await box(banner(page))
          const cta = await box(hero)
          return Math.round(cta.y + cta.height - bar.y)
        }, `chamada acima da barra em ${viewport.width}x${viewport.height}`)
        .toBeLessThanOrEqual(0)
      await expect(hero).toBeInViewport({ ratio: 1 })
    }

    const pending = (await box(stage)).height
    await banner(page).getByRole('button', { name: 'Aceitar' }).click()
    await expect(banner(page)).toBeHidden()
    // O hero volta ao normal: a arte recupera a altura que tinha cedido.
    await expect
      .poll(async () => (await box(stage)).height)
      .toBeGreaterThan(pending)

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

  // WEB-370. O que é fixo no pé da janela sobe para cima do aviso. A barra de
  // ação do bar, além disso, nem ficava presa à janela: o `transform` que a
  // animação de entrada deixava no `main` a mandava para o fim da página.
  test('celular: a barra de ação e o toast ficam acima do aviso, e a barra desce quando ele some', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    const { barId } = await createPub()
    // Torcedor próprio: o teste favorita o bar.
    await signIn(page, await createUser())
    const actions = page.locator('.onside-pub-actionbar')
    // Quanto o elemento passa do topo do aviso: até 0 ele está livre.
    const under = (locator: Locator) => async () => {
      const bar = await box(banner(page))
      const found = await box(locator)
      return Math.round(found.y + found.height - bar.y)
    }

    await page.goto(`/pub/${barId}`)
    await expect(banner(page)).toBeVisible()
    await expect(actions).toBeInViewport({ ratio: 1 })
    // E é o único "Como chegar": o botão do painel some onde a barra existe.
    await expect(page.getByRole('link', { name: 'Como chegar' })).toHaveCount(1)
    await expect(
      actions.getByRole('link', { name: 'Como chegar' })
    ).toBeVisible()
    await expect.poll(under(actions), 'barra de ação').toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click()
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible()
    await expect.poll(under(toast), 'toast').toBeLessThanOrEqual(0)

    await banner(page).getByRole('button', { name: 'Recusar' }).press('Enter')
    await expect(banner(page)).toBeHidden()
    // Sem o aviso ela volta para o pé da janela, e continua presa a ele.
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('sem viewport')
    const atBottom = async () => {
      const found = await box(actions)
      return Math.round(found.y + found.height)
    }
    await expect.poll(atBottom).toBe(viewport.height)
    await page.evaluate('scrollTo(0, 600)')
    await expect.poll(() => page.evaluate('scrollY')).toBeGreaterThan(0)
    await expect.poll(atBottom).toBe(viewport.height)
  })

  // Em 320x568 o "Acessar minha conta" do login cai na faixa do aviso. O
  // navegador o dava por visível e não rolava ao receber o foco.
  test('celular: botão que recebe o foco debaixo do aviso rola para cima dele', async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'só no projeto mobile')
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/login')
    await expect(banner(page)).toBeVisible()
    const submit = page.getByRole('button', { name: 'Acessar minha conta' })
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
