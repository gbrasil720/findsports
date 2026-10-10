import type { Page } from '@playwright/test'
import { expect, test } from '../../fixtures/test'

// WEB-333: a cena 3D da landing só existe no desktop. Fora dele — e no desktop
// sem WebGL — quem aparece é o pôster, e o three nem é baixado no celular.

/** O módulo das cenas e o three, em `vite dev` e no build. */
const THREE_CHUNK = /onside-scenes|[/_.-]three[/_.-]/

const stage = (page: Page) => page.locator('.onside-hero-stage')

test('celular: pôster com os cards, sem pedir o three', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'só no projeto mobile')
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))

  await page.goto('/')
  await expect(stage(page)).toHaveAttribute('data-scene', 'poster')
  await expect(stage(page).locator('img')).toBeVisible()
  // A imagem é a do retrato, e chegou.
  const image = stage(page).locator('img')
  await expect(image).toHaveJSProperty('complete', true)
  expect(await image.evaluate((img) => img.currentSrc)).toContain(
    'hero-mapa-retrato'
  )
  expect(await image.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)

  // O ciclo é CSS: sempre há um card de bar à mostra (fora o meio segundo da
  // troca), e é um dos do conjunto em retrato.
  const cards = stage(page).locator(
    '.onside-hero-spots.is-portrait .onside-map-card'
  )
  await expect(cards).toHaveCount(6)
  // (`ownerDocument.defaultView`: a suíte compila sem os tipos do DOM.)
  await expect
    .poll(() =>
      cards.evaluateAll((list) =>
        Math.max(
          ...list.map((card) =>
            Number(
              card.ownerDocument.defaultView?.getComputedStyle(
                card.parentElement ?? card
              ).opacity
            )
          )
        )
      )
    )
    .toBeGreaterThan(0.9)
  await expect(cards.first()).toBeInViewport()

  // Tempo de sobra para o `import()` do desktop ter saído, se fosse sair.
  await page.waitForTimeout(1500)
  expect(requested.filter((url) => THREE_CHUNK.test(url))).toEqual([])
  await expect(stage(page)).toHaveAttribute('data-scene', 'poster')
})

test('desktop sem WebGL: o pôster fica, sem erro no console', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'só no projeto desktop')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(`
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type.includes('webgl') ? null : getContext.call(this, type, ...rest)
    }
  `)

  // O desktop pede as cenas; é a criação do contexto que falha.
  const scenes = page.waitForResponse((response) =>
    THREE_CHUNK.test(response.url())
  )
  await page.goto('/')
  await scenes
  await page.waitForTimeout(1500)

  await expect(stage(page)).toHaveAttribute('data-scene', 'poster')
  await expect(stage(page).locator('img')).toBeVisible()
  await expect(stage(page).locator('canvas')).toHaveCSS('opacity', '0')
  expect(errors).toEqual([])
})

test('o CTA do bar leva ao cadastro com "Dono de Bar" marcado', async ({
  page
}) => {
  await page.goto('/')
  const cta = page.locator('[data-cta="footer_pub_signup"]')
  await expect(cta).toHaveText('Cadastre seu bar')
  await expect(cta).toHaveAttribute('href', '/signup?role=pub')

  await cta.click()
  await expect(page).toHaveURL(/\/signup\?role=pub$/)
  await expect(
    page.getByRole('button', { name: 'Dono de Bar' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Torcedor' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
})
