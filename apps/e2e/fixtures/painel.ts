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
 * Quanto o conteúdo do painel passa da largura do `main`, em px (0 = cabe).
 * Rolagem de propósito (a linha do tempo de Hoje) não conta: ela não
 * transborda para o `main`.
 */
export function vazamentoLateral(page: Page) {
  return page
    .getByRole('main')
    .evaluate((main) => main.scrollWidth - main.clientWidth)
}
