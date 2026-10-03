/**
 * A URL aponta exatamente para `pathname` no NOSSO store do Vercel Blob?
 *
 * Regra única das fotos que o cliente informa depois do upload direto (foto
 * do bar, avatar do usuário): sem ela, qualquer um apontaria a foto para um
 * host próprio e veria IP e horário de quem a carrega. Comparação exata do
 * caminho, sem porta, sem outro store.
 */
export function isOwnBlobUrl(
  url: string,
  pathname: string,
  storeId: string | undefined
): boolean {
  if (!storeId) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.port) return false
  if (
    parsed.hostname !==
    `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
  ) {
    return false
  }

  return parsed.pathname === `/${pathname}`
}

export function avatarPathname(userId: string): string {
  return `users/${userId}/avatar`
}

/**
 * Valor aceito em `user.image`: limpar o campo, ou o avatar deste usuário no
 * nosso store. O teto de tamanho mantém o cookie de sessão pequeno — ele
 * serializa o `user` inteiro, e uma data URL estourava o header na Vercel
 * (494); query string no nosso store ainda passaria sem ele.
 */
export function isSafeUserImage(
  image: unknown,
  userId: string | undefined,
  storeId: string | undefined
): boolean {
  if (image == null || image === '') return true
  if (typeof image !== 'string' || image.length > 2048 || !userId) return false
  return isOwnBlobUrl(image, avatarPathname(userId), storeId)
}
