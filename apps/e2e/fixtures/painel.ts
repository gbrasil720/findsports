import type { Page } from '@playwright/test'

/** Item da barra lateral do painel do bar ("Hoje", "Jogos", "Quem vai"…). */
export function painelLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Painel do bar' })
    .getByRole('link', { name })
}
