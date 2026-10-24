import { expect, test } from 'bun:test'
import { PLAN_CATALOG } from './plan-catalog'
import { PLAN_TABLE } from './plan-table'

const rows = PLAN_TABLE.flatMap((group) => group.rows)
const row = (label: string) => rows.find((item) => item.label === label)

test('"em breve" na tabela é exatamente o que o catálogo marca como `soon`', () => {
  for (const [index, plan] of PLAN_CATALOG.entries()) {
    const soon = plan.profilePerks
      .filter((perk) => perk.status === 'soon')
      .map((perk) => perk.label)
      .sort()
    const table = rows
      .filter((item) => item.values[index] === 'breve')
      .map((item) => item.label)
      .sort()
    expect(table).toEqual(soon)
  }
})

test('o que só o Elite tem na tabela está só no catálogo do Elite', () => {
  const elite = PLAN_CATALOG.find((plan) => plan.id === 'elite')
  const labels = [
    ...(elite?.features ?? []),
    ...(elite?.profilePerks.map((perk) => perk.label) ?? [])
  ]
  expect(labels).toContain('Lista de quem vai assistir, jogo a jogo')
  expect(labels).toContain('Oferta da casa para quem chega pela Onside')
  expect(labels).toContain('Inteligência avançada')
  for (const label of [
    'Lista de quem vai assistir',
    'Oferta da casa para quem chega pela Onside',
    'Inteligência avançada',
    'Topo da busca em clássicos'
  ]) {
    expect(row(label)?.values).toEqual(['nao', 'nao', 'sim'])
  }
})

test('a capa em destaque é do Pro, como no catálogo', () => {
  const pro = PLAN_CATALOG.find((plan) => plan.id === 'pro')
  expect(pro?.profilePerks.map((perk) => perk.label)).toContain(
    'Capa em destaque, o dobro da altura'
  )
  expect(row('Capa em destaque, o dobro da altura')?.values[1]).toBe('sim')
})
