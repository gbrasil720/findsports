import type { Page } from '@playwright/test'
import { MEDIA_PUBLIC_ORIGIN } from '../env'

/** PNG 1x1 transparente: o que toda URL de mídia devolve no E2E. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

export type InterceptedUpload = { pathname: string; contentType: string }

/**
 * O upload de foto/avatar sai do navegador direto para o R2, numa URL que a
 * rota real do app assina (WEB-202). Aqui o `PUT` é respondido como o R2
 * responderia, sem rede, e qualquer leitura em `MEDIA_PUBLIC_ORIGIN` devolve
 * um pixel.
 *
 * Chame antes de navegar. Devolve a lista de uploads recebidos, com a chave
 * dentro do bucket e o `content-type` enviado.
 */
export async function interceptMediaUploads(
  page: Page
): Promise<InterceptedUpload[]> {
  const uploads: InterceptedUpload[] = []

  await page.route(
    /^https:\/\/[^/]+\.r2\.cloudflarestorage\.com\//,
    async (route) => {
      const request = route.request()
      if (request.method() === 'PUT') {
        uploads.push({
          pathname: new URL(request.url()).pathname.replace(
            /^\/onside-media\//,
            ''
          ),
          contentType: request.headers()['content-type'] ?? ''
        })
      }
      // Nada segue para a rede; o preflight leva o mesmo CORS do bucket.
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT',
          'access-control-allow-headers': 'content-type'
        }
      })
    }
  )

  await page.route(`${MEDIA_PUBLIC_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL })
  )

  return uploads
}
