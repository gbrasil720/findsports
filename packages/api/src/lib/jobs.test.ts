import { expect, test } from 'bun:test'

import { jobHealth, nextScheduledRun } from './jobs'

const now = new Date('2026-10-14T15:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

test('jobHealth: erro falha, sem execução em 26 h pede atenção', () => {
  expect(jobHealth(null, now)).toBe('warn')
  expect(jobHealth({ ok: true, startedAt: hoursAgo(11) }, now)).toBe('ok')
  expect(jobHealth({ ok: true, startedAt: hoursAgo(27) }, now)).toBe('warn')
  expect(jobHealth({ ok: false, startedAt: hoursAgo(1) }, now)).toBe('bad')
})

test('nextScheduledRun: 04:00 UTC de hoje ou de amanhã', () => {
  const at = (iso: string) => nextScheduledRun(new Date(iso)).toISOString()
  expect(at('2026-10-14T03:59:00Z')).toBe('2026-10-14T04:00:00.000Z')
  expect(at('2026-10-14T04:00:00Z')).toBe('2026-10-15T04:00:00.000Z')
})
