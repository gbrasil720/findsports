/*
 * Contas da página do bar da rodada 8, sem React (testáveis).
 */

type Turn =
  | { open: true; closes: string }
  | { open: false; opens: string; inDays: number; day: number }

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const WORDS = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis']

/** "duas horas", "40 min", "1 h 30 min". */
function span(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest) return `${hours} h ${rest} min`
  return `${WORDS[hours] ?? hours} ${hours === 1 ? 'hora' : 'horas'}`
}

/**
 * Fechado agora com jogo hoje (rodada 8, tela 2): "O bar abre às 17:00,
 * duas horas antes do jogo." ou o aviso de que abre depois do início. `null`
 * com o bar aberto, sem horário ou abrindo só outro dia.
 */
export function closedNote(turn: Turn | null, gameTime: string) {
  if (!turn || turn.open || turn.inDays !== 0) return null
  const opens = toMinutes(turn.opens)
  const game = toMinutes(gameTime)
  if (opens > game)
    return `O bar abre depois do início do jogo, às ${turn.opens}.`
  if (opens === game) return `O bar abre às ${turn.opens}, na hora do jogo.`
  return `O bar abre às ${turn.opens}, ${span(game - opens)} antes do jogo.`
}
