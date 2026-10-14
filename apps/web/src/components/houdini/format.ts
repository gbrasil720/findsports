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
