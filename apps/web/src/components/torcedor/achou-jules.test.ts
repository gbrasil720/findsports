import { expect, test } from 'bun:test'
import { buscouJules } from './achou-jules'

test('só "jules" acha o Jules: sem acento, maiúsculas nem espaços (WEB-555)', () => {
  for (const busca of ['jules', 'Jules', '  JULES ', 'Jùles'])
    expect(buscouJules(busca)).toBe(true)
  for (const busca of ['', 'jule', 'jules bar', 'julio'])
    expect(buscouJules(busca)).toBe(false)
})
