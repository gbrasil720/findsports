/**
 * Endereço público do bar (`/bar/bar-do-ze-vila-madalena-3f2a9c1b`): nome e
 * bairro para quem lê o link, e os 8 primeiros hex do id para achar o bar. O
 * nome é enfeite: quem resolve é o prefixo, e nome trocado só redireciona.
 *
 * Sem imports: o web monta o link, o servidor resolve, o app pode copiar.
 *
 * ponytail: o prefixo de 8 hex (32 bits) pode bater em dois bares; aí os dois
 * respondem 404 até alguém resolver. Com N bares a chance de alguma colisão é
 * ~N²/2³³ (1% perto de 10 mil bares). O caminho é uma coluna `slug` única no
 * `bar`, preenchida a partir deste mesmo `barSlug` — fica para quando a
 * branch de integração entregar as migrations dela.
 */

/** Quantos hex do id vão no fim do endereço. */
export const BAR_REF_LENGTH = 8

const HEX_PREFIX = /^[0-9a-f]{8}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** "Bar do Zé", "Vila Madalena" → "bar-do-ze-vila-madalena". */
export function barSlug(name: string, neighborhood?: string | null): string {
  return [name, neighborhood ?? '']
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

/** O caminho canônico da página do bar. */
export function barPath(bar: {
  id: string
  name: string
  neighborhood?: string | null
}): string {
  const ref = bar.id.slice(0, BAR_REF_LENGTH).toLowerCase()
  const slug = barSlug(bar.name, bar.neighborhood)
  return `/bar/${slug ? `${slug}-` : ''}${ref}`
}

/**
 * O prefixo do id no parâmetro da URL: o último trecho depois do hífen, com 8
 * hex. Um id inteiro também vale (links antigos colados à mão). `null` quando
 * não há prefixo: a página responde 404 sem ir ao banco.
 */
export function parseBarRef(param: string): string | null {
  const value = param.trim().toLowerCase()
  if (UUID.test(value)) return value.slice(0, BAR_REF_LENGTH)
  const ref = value.slice(value.lastIndexOf('-') + 1)
  return HEX_PREFIX.test(ref) ? ref : null
}
