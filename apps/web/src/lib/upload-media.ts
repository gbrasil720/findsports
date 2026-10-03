/**
 * Sobe uma foto direto para o R2 (WEB-202): pede a URL assinada à rota do app
 * (`/api/bar/photo` ou `/api/user/avatar`), faz o `PUT` e devolve a URL
 * pública a gravar. O `content-type` precisa ser o mesmo da assinatura.
 */
export async function uploadMedia(
  signRoute: string,
  file: Blob
): Promise<string> {
  const sign = await fetch(signRoute, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size })
  })
  if (!sign.ok) throw new Error(`assinatura ${sign.status}`)
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
