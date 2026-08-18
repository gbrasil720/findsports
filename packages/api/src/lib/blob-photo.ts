/**
 * Regras da foto do bar (ESC-15).
 *
 * O upload passou a ir do navegador direto para o armazenamento de blobs, sem
 * atravessar a função serverless. Isso tira o arquivo do caminho da função,
 * mas move a autorização: quem decide onde o arquivo pode cair é o servidor,
 * na hora de emitir o token.
 *
 * O helper do Vercel Blob entrega o caminho pedido pelo cliente e aceita que
 * o servidor RECUSE — não que o reescreva. Então a recusa é a defesa: sem
 * validar aqui, um bar autenticado poderia gravar na pasta de outro.
 */

/** 5 MB, o mesmo teto que a rota antiga aplicava. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const

/** Host público do Vercel Blob; o subdomínio varia por loja. */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

export function photoPathname(barId: string): string {
  return `bars/${barId}/photo`
}

/**
 * O caminho pedido é exatamente o da foto DESTE bar?
 *
 * Comparação exata, e não prefixo: aceitar `bars/<id>/…` deixaria o bar
 * gravar quantos arquivos quisesse na própria pasta, e a rota existe para uma
 * foto só.
 */
export function isOwnPhotoPathname(pathname: string, barId: string): boolean {
  return pathname === photoPathname(barId)
}

/**
 * A URL veio mesmo do nosso armazenamento e aponta para a pasta deste bar?
 *
 * Usada ao gravar `photoUrl`: como agora é o cliente que informa a URL depois
 * de subir o arquivo, aceitar qualquer string deixaria um bar apontar a
 * própria foto para um endereço arbitrário na internet.
 */
export function isOwnPhotoUrl(url: string, barId: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return false

  // O caminho pode ganhar sufixo do armazenamento; o que precisa bater é a
  // pasta do bar.
  return parsed.pathname.startsWith(`/${photoPathname(barId)}`)
}
