/**
 * Telefone do bar na página (rodada 29): o número escrito junto do endereço e
 * o link do WhatsApp. As regras são as do web (`utils/format-phone.ts` e
 * `lib/whatsapp-link.ts`): o cadastro guarda `+5511988776655` ou
 * `11988776655`, e número local brasileiro (10 ou 11 dígitos) ganha o 55.
 */

/** O telefone gravado, ou nulo quando é vazio ou só espaços. */
export function barPhone(phone: string | null | undefined) {
  const trimmed = phone?.trim()
  return trimmed ? trimmed : null
}

/** `tel:` só com dígitos e o "+": máscara e espaços não vão para o discador. */
export function telUrl(phone: string) {
  const clean = phone.replace(/[^\d+]/g, '')
  return `tel:${clean.startsWith('+') ? '+' : ''}${clean.replace(/\+/g, '')}`
}

const local = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return phone.startsWith('+55') ? digits.slice(2) : digits
}

/** "(11) 98877-6655"; número de fora do Brasil sai como foi gravado. */
export function phoneLabel(phone: string) {
  if (phone.startsWith('+') && !phone.startsWith('+55')) return phone
  const d = local(phone)
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return phone
}

/** `https://wa.me/55…`, ou nulo quando o número não serve ao WhatsApp. */
export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11)
    return `https://wa.me/55${digits}`
  if (digits.length === 12 || digits.length === 13)
    return `https://wa.me/${digits}`
  return null
}
