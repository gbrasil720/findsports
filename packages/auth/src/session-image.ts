/**
 * Onde moram as fotos que o app grava: o domínio público do bucket R2
 * (`MEDIA_PUBLIC_ORIGIN`) e, até o script do WEB-202 reescrever o banco, o
 * store antigo do Vercel Blob (`BLOB_STORE_ID`). O `env` do servidor serve
 * direto aqui.
 */
export type MediaHosts = {
  BLOB_STORE_ID?: string
  MEDIA_PUBLIC_ORIGIN?: string
}

/**
 * A URL aponta exatamente para `pathname` num dos NOSSOS hosts de mídia?
 *
 * Regra única das fotos que o cliente informa depois do upload direto (foto
 * do bar, avatar do usuário): sem ela, qualquer um apontaria a foto para um
 * host próprio e veria IP e horário de quem a carrega. Comparação exata do
 * caminho, sem porta, sem outro store. A query (`?v=`, que fura o cache da
 * borda no overwrite) fica de fora da comparação.
 */
export function isOwnMediaUrl(
  url: string,
  pathname: string,
  hosts: MediaHosts
): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:' || parsed.port) return false
  if (parsed.pathname !== `/${pathname}`) return false

  const media = hosts.MEDIA_PUBLIC_ORIGIN
  if (media && parsed.origin === new URL(media).origin) return true

  // ponytail: host do Vercel Blob só até a migração do WEB-202; sai no passo 9.
  const store = hosts.BLOB_STORE_ID
  return (
    !!store &&
    parsed.hostname === `${store.toLowerCase()}.public.blob.vercel-storage.com`
  )
}

export function avatarPathname(userId: string): string {
  return `users/${userId}/avatar`
}

/**
 * Valor aceito em `user.image`: limpar o campo, ou o avatar deste usuário num
 * dos nossos hosts. O teto de tamanho mantém o cookie de sessão pequeno — ele
 * serializa o `user` inteiro, e uma data URL estourava o header na Vercel
 * (494); query string no nosso host ainda passaria sem ele.
 */
export function isSafeUserImage(
  image: unknown,
  userId: string | undefined,
  hosts: MediaHosts
): boolean {
  if (image == null || image === '') return true
  if (typeof image !== 'string' || image.length > 2048 || !userId) return false
  return isOwnMediaUrl(image, avatarPathname(userId), hosts)
}
