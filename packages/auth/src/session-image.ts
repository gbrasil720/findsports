const MAX_IMAGE_URL_LENGTH = 2048

/**
 * O cookie de sessão serializa o `user` inteiro. Uma data URL de foto
 * (~25 KB) estoura o Cookie header na Vercel (494 REQUEST_HEADER_TOO_LARGE).
 * Só aceitamos URL https curta, ou limpar o campo.
 */
export function isSafeUserImage(image: unknown): boolean {
  if (image == null) return true
  if (typeof image !== 'string') return false
  if (image.length === 0) return true
  if (image.length > MAX_IMAGE_URL_LENGTH) return false
  if (image.startsWith('data:')) return false
  try {
    const parsed = new URL(image)
    return parsed.protocol === 'https:' && !parsed.port
  } catch {
    return false
  }
}
