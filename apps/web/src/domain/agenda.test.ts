import { expect, test } from 'bun:test'
import { arquivoDaAgenda } from './agenda'

test('o .ics leva o jogo, o bar e o fim padrão de três horas', () => {
  const ics = arquivoDaAgenda({
    titulo: 'Fla × Flu',
    bar: 'Bar do Zé, Vila',
    lugar: 'Vila Madalena',
    inicio: '2026-11-08T00:30:00.000Z'
  })
  expect(ics).toContain('DTSTART:20261108T003000Z')
  expect(ics).toContain('DTEND:20261108T033000Z')
  expect(ics).toContain('SUMMARY:Fla × Flu no Bar do Zé\\, Vila')
})
