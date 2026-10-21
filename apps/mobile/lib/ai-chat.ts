/*
 * Contas da busca com IA (2h, WEB-400) sem tela: negrito da resposta,
 * "Mais barato", quando o chat volta e o histórico que vai ao servidor.
 */

/** "Achei **Corinthians × Palmeiras** hoje" em pedaços, com o negrito. */
export function boldSegments(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part.replace(/\*\*/g, ''), bold: false }
    )
}

/** "Mais barato": menor gasto médio primeiro; bar sem gasto vai para o fim. */
export function cheapestFirst<T extends { averageSpendCents: number | null }>(
  bars: T[]
) {
  return bars
    .map((bar, i) => ({ bar, i }))
    .sort((a, b) => {
      const x = a.bar.averageSpendCents
      const y = b.bar.averageSpendCents
      if (x === y) return a.i - b.i
      if (x === null) return 1
      if (y === null) return -1
      return x - y
    })
    .map(({ bar }) => bar)
}

const day = (value: Date | number) =>
  new Date(value).toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo'
  })

/** Quando o chat volta: "amanhã à 0h" ou "em 1º de novembro". */
export function resumeLabel(resumesAt: string, now: number) {
  const at = new Date(resumesAt)
  if (day(at) === day(now + 86_400_000)) return 'amanhã à 0h'
  const dayOfMonth = Number(
    at.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: 'numeric'
    })
  )
  const month = at.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: 'long'
  })
  return `em ${dayOfMonth === 1 ? '1º' : dayOfMonth} de ${month}`
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Histórico curto que vai junto da pergunta: as últimas trocas respondidas. */
export function chatHistory(
  turns: { question: string; answer: string | null }[],
  max = 6
): ChatTurn[] {
  return turns
    .flatMap((t): ChatTurn[] =>
      t.answer
        ? [
            { role: 'user', content: t.question },
            { role: 'assistant', content: t.answer }
          ]
        : []
    )
    .slice(-max)
}
