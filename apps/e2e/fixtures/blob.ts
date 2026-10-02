import type { Page } from '@playwright/test'
import { BLOB_STORE_ID } from '../env'

/** PNG 1x1 transparente: o que toda URL de blob devolve no E2E. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

export type InterceptedUpload = { pathname: string; contentType: string }

/**
 * O upload de foto/avatar sai do navegador direto para o Vercel Blob. Aqui o
 * PUT é respondido como o Blob responderia, com URL do store `e2e` — o mesmo
 * `BLOB_STORE_ID` do servidor, então a URL passa em `blob-photo.ts` — e
 * qualquer leitura dessa URL devolve um pixel. O token do cliente continua
 * saindo da rota real do app.
 *
 * Chame antes de navegar. Devolve a lista de uploads recebidos.
 */
export async function interceptBlobUploads(
  page: Page
): Promise<InterceptedUpload[]> {
  const uploads: InterceptedUpload[] = []

  await page.route(/^https:\/\/vercel\.com\/api\/blob\//, async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).searchParams.get('pathname') ?? ''
    const contentType =
      request.headers()['x-content-type'] ?? 'application/octet-stream'
    uploads.push({ pathname, contentType })
    const url = `https://${BLOB_STORE_ID}.public.blob.vercel-storage.com/${pathname}`
    await route.fulfill({
      json: {
        url,
        downloadUrl: `${url}?download=1`,
        pathname,
        contentType,
        contentDisposition: `inline; filename="${pathname.split('/').at(-1)}"`
      }
    })
  })

  await page.route(
    /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//,
    (route) => route.fulfill({ contentType: 'image/png', body: PIXEL })
  )

  return uploads
}
