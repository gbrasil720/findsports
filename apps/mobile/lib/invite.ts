/*
 * O link de convite dos amigos (S1): a página do web que abre o app no
 * convite (`/convite/<código>`). Quem cria conta por ele já entra como amigo.
 */

export const inviteUrl = (code: string) =>
  `${process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://onside.sh'}/convite/${encodeURIComponent(code)}`

/** A mensagem que vai junto do link ao compartilhar. */
export const inviteMessage = (code: string) =>
  `Bora ver os jogos juntos na Onside? Me adiciona: ${inviteUrl(code)}`

/** "outubro": o mês de agora, em português. */
export const monthName = (now = new Date()) =>
  now.toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'America/Sao_Paulo'
  })
