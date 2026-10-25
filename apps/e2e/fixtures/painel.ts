import type { Page } from '@playwright/test'

/** Item da barra lateral do painel do bar ("Hoje", "Jogos", "Quem vai"…). */
export function painelLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Painel do bar' })
    .getByRole('link', { name })
}

/** Larguras de celular em que o painel não pode rolar de lado. */
export const LARGURAS_CELULAR = [320, 375, 390] as const

/**
 * O que passa da borda direita do `main` (a página corta com `overflow-x:
 * clip`, então não rola: some). Vazio = cabe. Rolagem de propósito, como a
 * linha do tempo de Hoje, não conta.
 */
export function vazamentoLateral(page: Page) {
  return page.getByRole('main').evaluate((main) => {
    const borda = main.getBoundingClientRect().right + 0.5
    const fora: string[] = []
    for (const el of main.querySelectorAll('*')) {
      let rola = false
      for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
        const estilo = a.ownerDocument.defaultView?.getComputedStyle(a)
        if (estilo && estilo.overflowX !== 'visible') rola = true
      }
      const caixa = el.getBoundingClientRect()
      if (!rola && caixa.width > 0 && caixa.right > borda) {
        fora.push(`${el.tagName} "${el.textContent?.slice(0, 30)}"`)
      }
    }
    return fora
  })
}
