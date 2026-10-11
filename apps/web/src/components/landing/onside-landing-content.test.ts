import { expect, test } from 'bun:test'

import {
  DEFINITION_POINTS,
  FAQ_ITEMS,
  LANDING_COPY
} from './onside-landing-content'

test('a landing fala do produto no ar e não promete lista de espera', () => {
  const copy = JSON.stringify([LANDING_COPY, FAQ_ITEMS, DEFINITION_POINTS])

  expect(LANDING_COPY.hero.title.join(' ')).toBe(
    '“Onde vai passar o jogo?” finalmente tem uma (ótima) resposta.'
  )
  expect(LANDING_COPY.primaryCta).toBe('Entrar / Criar conta')
  expect(copy).not.toMatch(
    /download|app store|playstore|3 mil|lotação|lista de espera|waitlist|no lançamento|ainda não/i
  )
})

test('o bar vai para o cadastro, sem formulário na landing', async () => {
  const landing = await Bun.file(
    new URL('./onside-landing.tsx', import.meta.url)
  ).text()

  expect(landing).toContain("href: '/signup'")
  expect(landing).toContain("BAR_SIGNUP_HREF = '/signup?role=pub'")
  expect(landing).not.toMatch(/id="(lista|bar-form)"|Waitlist/)
})
