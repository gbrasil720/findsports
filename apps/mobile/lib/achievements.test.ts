import { describe, expect, it } from 'bun:test'
import {
  type Achievement,
  describe as describeMedal,
  fullDate,
  nextInSeries,
  reviewLine,
  seriesLabel,
  shortDate,
  unlockedLine
} from './achievements'

const medal = (
  id: Achievement['id'],
  group: Achievement['group'],
  target: number,
  progress: number,
  extra: Partial<Achievement> = {}
): Achievement => ({
  id,
  group,
  name: id,
  target,
  progress,
  unlockedAt: progress >= target ? '2026-10-04T22:20:00.000Z' : null,
  where: progress >= target ? 'Boteco Sete' : null,
  share: 12,
  ...extra
})

const bares = [
  medal('bar1', 'bares', 1, 5),
  medal('bar5', 'bares', 5, 5),
  medal('bar10', 'bares', 10, 5),
  medal('bar25', 'bares', 25, 5)
]

describe('conquistas', () => {
  it('a série diz a posição e a próxima medalha', () => {
    expect(seriesLabel(bares, bares[1] as Achievement)).toBe(
      'Bares novos · 2 de 4'
    )
    expect(nextInSeries(bares, bares[1] as Achievement)?.id).toBe('bar10')
    expect(nextInSeries(bares, bares[3] as Achievement)).toBeNull()
    // Já ganha não é "próxima".
    const ganhas = [
      medal('esp2', 'esportes', 2, 4),
      medal('esp4', 'esportes', 4, 4)
    ]
    expect(nextInSeries(ganhas, ganhas[0] as Achievement)).toBeNull()
  })

  it('datas no horário de Brasília', () => {
    expect(fullDate('2026-10-05T01:00:00.000Z')).toBe('04.10.2026')
    expect(shortDate('2026-10-04T22:20:00.000Z')).toBe('4 out')
  })

  it('texto da medalha ganha e da que falta', () => {
    expect(describeMedal(bares[1] as Achievement)).toBe(
      'Você assistiu a jogos em 5 bares diferentes, com o código validado por cada um.'
    )
    expect(describeMedal(bares[2] as Achievement)).toContain('Faltam 5 bares.')
    expect(unlockedLine(bares[1] as Achievement)).toBe(
      'Boteco Sete validou seu código. É o 5º bar diferente onde você assistiu a um jogo pela Onside.'
    )
  })

  it('a resenha que acabou de ser enviada já conta', () => {
    const list = [
      medal('ava1', 'resenhas', 1, 6),
      medal('ava10', 'resenhas', 10, 6)
    ]
    const line = reviewLine(list)
    expect(`${line.head} ${line.tail}`).toBe(
      'Sua 7ª resenha. Faltam 3 para a medalha ava10.'
    )
    expect(reviewLine([medal('ava10', 'resenhas', 10, 12)]).tail).toBe('')
  })
})
