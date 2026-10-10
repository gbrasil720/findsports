import { randomInt } from 'node:crypto'
import { test as base, expect } from '@playwright/test'

/**
 * `test` da suíte: importe daqui, não de `@playwright/test`.
 */
export const test = base.extend({
  /**
   * Cada teste sai com um `x-forwarded-for` próprio. O rate limit do
   * better-auth (3 logins por 10s) conta por IP no banco; com todos os testes
   * vindo de 127.0.0.1, os workers paralelos dividiriam o mesmo balde e
   * derrubariam uns aos outros.
   */
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
    await use({ ...extraHTTPHeaders, 'x-forwarded-for': ip })
  },

  /**
   * `page.goto` só volta depois que o React hidratou (`html[data-hydrated]`,
   * gravado no `__root.tsx`). Antes disso o formulário é HTML puro: preencher
   * e clicar faz submit nativo (POST, WEB-189) em vez do envio do app.
   *
   * E falha o teste se o React acusar "Hydration failed" na página (WEB-196):
   * HTML do servidor diferente do primeiro render do cliente.
   */
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
      return response
    }
    const hydrationErrors: string[] = []
    const record = (text: string) => {
      if (text.includes('Hydration failed')) hydrationErrors.push(text)
    }
    page.on('console', (msg) => record(msg.text()))
    page.on('pageerror', (error) => record(error.message))
    await use(page)
    expect(hydrationErrors, 'erro de hidratação no navegador').toEqual([])
  }
})

export { expect }
