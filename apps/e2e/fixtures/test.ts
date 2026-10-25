import { randomInt } from 'node:crypto'
import { type BrowserContext, test as base, expect } from '@playwright/test'

/**
 * O aviso de cookies aparece para quem ainda não escolheu, e no celular é uma
 * barra no pé da tela, por cima de botão. Isto grava a recusa antes de
 * qualquer script da página, que é o estado de quem já respondeu. Contexto
 * criado à mão (`browser.newContext`) precisa chamar; o do teste já vem assim.
 */
export async function answerCookieConsent(context: BrowserContext) {
  // Texto, e não função: a suíte compila sem os tipos do DOM. O `try` é para
  // o `about:blank`, que não tem armazenamento.
  await context.addInitScript({
    content:
      "try{localStorage.setItem('onside:analytics-consent','denied')}catch{}"
  })
}

// "Hydration failed…" quando o React refaz a árvore; "…didn't match the
// client properties" quando só um atributo difere e o HTML fica como veio.
const HYDRATION_MISMATCH = /Hydration failed|didn't match the client properties/

type Options = {
  /** `pending`: o teste é sobre o aviso e quer vê-lo. */
  cookieConsent: 'answered' | 'pending'
}

/**
 * `test` da suíte: importe daqui, não de `@playwright/test`.
 */
export const test = base.extend<Options>({
  cookieConsent: ['answered', { option: true }],

  context: async ({ context, cookieConsent }, use) => {
    if (cookieConsent === 'answered') await answerCookieConsent(context)
    await use(context)
  },

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
   * HTML do servidor diferente do primeiro render do cliente. Atributo
   * diferente (um `href`, uma classe) não derruba a hidratação, e o React só
   * avisa no console sem corrigir o HTML: conta também (WEB-472).
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
      if (HYDRATION_MISMATCH.test(text)) hydrationErrors.push(text)
    }
    page.on('console', (msg) => record(msg.text()))
    page.on('pageerror', (error) => record(error.message))
    await use(page)
    expect(hydrationErrors, 'erro de hidratação no navegador').toEqual([])
  }
})

export { expect }
