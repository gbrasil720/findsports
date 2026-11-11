import { afterEach, describe, expect, test } from 'bun:test'
import { enqueueJob, type JobMessage, setJobQueue } from './job-queue'

describe('enqueueJob', () => {
  afterEach(() => setJobQueue(null))

  test('sem fila, a rotina roda na requisição', async () => {
    expect(await enqueueJob('weekly_games')).toBe(false)
  })

  test('rotina longa vai para a fila; a curta não', async () => {
    const sent: JobMessage[] = []
    setJobQueue({ send: async (message) => sent.push(message) })
    expect(await enqueueJob('weekly_games')).toBe(true)
    expect(await enqueueJob('bar_plans')).toBe(false)
    expect(sent).toEqual([{ job: 'weekly_games' }])
  })
})
