export function formatProfileEventDate(startsAt: string | Date): string {
  const date = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  if (date.toDateString() === today.toDateString()) return `Hoje, ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `Amanhã, ${time}`
  return `${date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })}, ${time}`
}
