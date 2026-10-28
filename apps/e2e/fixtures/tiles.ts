import type { BrowserContext, Page } from '@playwright/test'

const CORS = { 'access-control-allow-origin': '*' }

/**
 * Tiles da Onside (`tiles.onside.sh`, WEB-456) sem rede: o TileJSON aponta
 * para o mesmo host e todo tile responde 204, como o Worker responde tile
 * vazio. O mapa da prévia monta e esmaece no tom do chão. Todo contexto do
 * `test` já vem com ele; chame na página, antes de navegar, para ter a lista
 * dos caminhos pedidos.
 */
export async function stubTiles(
  page: Page | BrowserContext
): Promise<string[]> {
  const pedidos: string[] = []
  await page.route('https://tiles.onside.sh/**', (route) => {
    const { pathname } = new URL(route.request().url())
    pedidos.push(pathname)
    if (pathname.endsWith('.json'))
      return route.fulfill({
        headers: CORS,
        json: {
          tilejson: '3.0.0',
          tiles: ['https://tiles.onside.sh/e2e/{z}/{x}/{y}.mvt'],
          minzoom: 0,
          maxzoom: 15
        }
      })
    return route.fulfill({ status: 204, headers: CORS })
  })
  return pedidos
}
