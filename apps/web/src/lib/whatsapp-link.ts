/**
 * Link de WhatsApp com a mensagem já escrita.
 *
 * O CTA principal do perfil público é falar com o bar, e o atrito real não é
 * abrir o WhatsApp — é ter de redigir. A mensagem pronta nomeia o jogo e a
 * pergunta que o torcedor de fato tem ("têm mesa?"), então o bar recebe um
 * contato que já se explica.
 */

export type WhatsAppEventContext = {
  matchup: string
  /** Já formatado para leitura humana: "hoje às 21:00", "sáb 23/08 às 16:00". */
  when: string
}

export type WhatsAppLinkInput = {
  phone: string | null
  acceptsWhatsapp: boolean
  event?: WhatsAppEventContext | null
}

/**
 * Normaliza para o formato que o `wa.me` exige: só dígitos, com código de
 * país.
 *
 * O cadastro guarda tanto `+5511988446094` quanto `11988446094` — o segundo
 * formato virava `wa.me/11988446094`, um número que o WhatsApp não resolve.
 * Números com 10 ou 11 dígitos são locais brasileiros e recebem o 55; o que
 * já vem com código de país passa intacto.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 || digits.length === 13) return digits

  return null
}

export function buildWhatsAppMessage(
  event: WhatsAppEventContext | null | undefined
): string {
  if (event) {
    return `Oi! Vi no Onside que vocês vão passar ${event.matchup} ${event.when}. Têm mesa?`
  }

  return 'Oi! Vi vocês no Onside. Qual jogo vai passar aí?'
}

/**
 * `null` quando o bar não deixou WhatsApp — o chamador degrada para a rota em
 * vez de mostrar um botão que não leva a lugar nenhum.
 */
export function buildWhatsAppLink({
  phone,
  acceptsWhatsapp,
  event
}: WhatsAppLinkInput): string | null {
  if (!phone || !acceptsWhatsapp) return null

  const number = toWhatsAppNumber(phone)
  if (!number) return null

  const text = encodeURIComponent(buildWhatsAppMessage(event))
  return `https://wa.me/${number}?text=${text}`
}
