// As colunas são `timestamp` sem fuso, em UTC; o Houdini lê no horário de
// Brasília, que é o de quem opera e o do dono do bar.
const TZ = 'America/Sao_Paulo'

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: TZ })
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TZ
  })
}

export function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
}

const day = (date: Date) => date.toLocaleDateString('pt-BR', { timeZone: TZ })

/** "hoje 14:02", "ontem 22:05" ou "12/10 09:30", no horário de Brasília. */
export function when(value: Date | string, now = new Date()) {
  const date = new Date(value)
  const time = formatTime(date)
  if (day(date) === day(now)) return `hoje ${time}`
  if (day(date) === day(new Date(now.getTime() - 86_400_000)))
    return `ontem ${time}`
  return `${day(date).slice(0, 5)} ${time}`
}

/** "Qui, 22 out · 21:47 em Brasília". */
export function nowLine(now = new Date()) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    now
      .toLocaleDateString('pt-BR', { ...options, timeZone: TZ })
      .replace('.', '')
  const weekday = part({ weekday: 'short' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${part({ day: 'numeric' })} ${part({ month: 'short' })} · ${formatTime(now)} em Brasília`
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}
