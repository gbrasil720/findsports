import { expect, test } from 'bun:test'

import { LANDING_COPY } from './onside-landing-content'

test('a landing promete apenas capacidades confirmadas', () => {
  const copy = JSON.stringify(LANDING_COPY)

  expect(LANDING_COPY.hero.title).toBe(
    '“Onde vai passar o jogo?” finalmente tem uma (ótima) resposta.'
  )
  expect(LANDING_COPY.primaryCta).toBe('Criar conta')
  expect(copy).not.toMatch(/download|app store|playstore|3 mil|lotação/i)
})

test('as chamadas levam ao cadastro, e o bar chega com o papel escolhido', async () => {
  const landing = await Bun.file(
    new URL('./onside-landing.tsx', import.meta.url)
  ).text()

  expect(landing).toContain("href: '/signup'")
  expect(landing).toContain("BAR_SIGNUP_HREF = '/signup?role=pub'")
  expect(landing).not.toMatch(/#lista|#bar-form/)
})
