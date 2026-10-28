/**
 * Sobe uma foto direto para o R2 (WEB-202): pede a URL assinada à rota do app
 * (`/api/bar/photo` ou `/api/user/avatar`), faz o `PUT` e devolve a URL
 * pública a gravar. O `content-type` precisa ser o mesmo da assinatura.
 */
/** A rota recusou o upload; `message` é a frase para mostrar. */
export class UploadRecusado extends Error {}

export async function uploadMedia(
  signRoute: string,
  file: Blob
): Promise<string> {
  const sign = await fetch(signRoute, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size })
  })
  if (!sign.ok) {
    // A rota responde a frase pronta (`{ error }`): galeria cheia, plano, R2
    // fora do ar ("Upload de foto indisponível no momento.").
    const body = (await sign.json().catch(() => null)) as {
      error?: string
    } | null
    throw new UploadRecusado(body?.error ?? `assinatura ${sign.status}`)
  }
  const { uploadUrl, url } = (await sign.json()) as {
    uploadUrl: string
    url: string
  }

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file
  })
  if (!put.ok) throw new Error(`upload ${put.status}`)
  return url
}
