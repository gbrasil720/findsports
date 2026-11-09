import { getEventEnd } from '@findsports_oficial/db/event-window'

/*
 * "Pôr na agenda" no web (WEB-501): um `.ics` com o jogo, o bar e o bairro,
 * que o navegador abre no calendário. O app usa o formulário do sistema.
 */

const ics = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '')
const escapar = (texto: string) => texto.replace(/[\\,;]/g, '\\$&')

export function arquivoDaAgenda(jogo: {
  titulo: string
  bar: string
  lugar: string
  inicio: string
  fim?: string | null
}) {
  const inicio = new Date(jogo.inicio)
  const fim = getEventEnd({ startsAt: inicio, endsAt: jogo.fim ?? null })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Onside//Meus jogos//PT',
    'BEGIN:VEVENT',
    `UID:${ics(inicio)}-${encodeURIComponent(jogo.bar)}@onside.sh`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(inicio)}`,
    `DTEND:${ics(fim)}`,
    `SUMMARY:${escapar(`${jogo.titulo} no ${jogo.bar}`)}`,
    `LOCATION:${escapar(`${jogo.bar}, ${jogo.lugar}`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
}

export function baixarAgenda(jogo: Parameters<typeof arquivoDaAgenda>[0]) {
  const url = URL.createObjectURL(
    new Blob([arquivoDaAgenda(jogo)], { type: 'text/calendar' })
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'jogo-onside.ics'
  a.click()
  URL.revokeObjectURL(url)
}
