import { expect, test } from 'bun:test'
import { record, split } from './shard'

test('cada arquivo cai em um shard só, e o tempo fica equilibrado', () => {
  const known = { a: 100, b: 60, c: 50, d: 40, e: 10 }
  const files = [...Object.keys(known), 'novo']
  const bins = split(files, 3, known)

  expect(bins.flatMap((bin) => bin.files).sort()).toEqual([...files].sort())
  // 'novo' entra com a mediana (50): 310 s em 3 shards, nenhum acima de 110.
  expect(Math.max(...bins.map((bin) => bin.seconds))).toBeLessThanOrEqual(110)
})

test('soma as durações por arquivo, com as novas tentativas', () => {
  const spec = (file: string, ...ms: number[]) => ({
    file,
    tests: [{ results: ms.map((duration) => ({ duration })) }]
  })
  const suites = [
    {
      specs: [spec('x.e2e.ts', 1000)],
      suites: [{ specs: [spec('x.e2e.ts', 500, 500)] }]
    }
  ]
  expect(record(suites)).toEqual({ 'tests/x.e2e.ts': 2 })
})
