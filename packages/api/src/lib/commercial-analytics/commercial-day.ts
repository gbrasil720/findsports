export const COMMERCIAL_TIME_ZONE = 'America/Sao_Paulo'

const commercialDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMMERCIAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

export function getCommercialDay(date: Date): string {
  const parts = Object.fromEntries(
    commercialDayFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )

  return `${parts.year}-${parts.month}-${parts.day}`
}
