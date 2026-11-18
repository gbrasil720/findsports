/*
 * Domínios de consumidor da Microsoft (WEB-526): passam pelo mesmo filtro do
 * Outlook.com, que tem mandado a confirmação da Onside para o lixo eletrônico.
 * Web e app mostram o aviso de olhar lá. Sem imports: o app também lê.
 *
 * Microsoft 365 com domínio próprio fica de fora: só o MX diria.
 */
const MICROSOFT_CONSUMER_DOMAINS = new Set([
  'outlook.com',
  'outlook.com.br',
  'hotmail.com',
  'hotmail.com.br',
  'live.com',
  'live.com.br',
  'msn.com',
  'windowslive.com',
  'passport.com'
])

/** O e-mail é de uma caixa do Outlook.com (hotmail, live, msn...). */
export function isMicrosoftConsumerEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  return MICROSOFT_CONSUMER_DOMAINS.has(
    email
      .slice(at + 1)
      .trim()
      .toLowerCase()
  )
}
