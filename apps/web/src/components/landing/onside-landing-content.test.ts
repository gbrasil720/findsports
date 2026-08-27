import { expect, test } from 'bun:test'

import { LANDING_COPY } from './onside-landing-content'

test('a landing promete apenas a waitlist e capacidades confirmadas', () => {
  const copy = JSON.stringify(LANDING_COPY)

  expect(LANDING_COPY.hero.title).toBe(
    '“Onde vai passar o jogo?” finalmente tem uma (ótima) resposta.'
  )
  expect(LANDING_COPY.primaryCta).toBe('Quero a Onside na minha cidade')
  expect(copy).not.toMatch(/download|app store|playstore|3 mil|lotação/i)
})
