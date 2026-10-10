/**
 * Título do aviso de limite de jogos (WEB-353). A janela é a da política
 * (`event-creation-policy.ts`): o ciclo de cobrança, que termina em
 * `periodEnd`, ou os últimos 30 dias quando não há ciclo vigente. Nunca "este
 * mês": o dono precisa saber quando o limite volta.
 */
export function eventLimitReachedTitle(periodEnd: string | null): string {
  if (!periodEnd) return 'Limite de jogos atingido nos últimos 30 dias'
  const until = new Date(periodEnd).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long'
  })
  return `Limite de jogos atingido até ${until}`
}
