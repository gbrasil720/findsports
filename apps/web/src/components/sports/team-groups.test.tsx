import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { groupTeamsByKind, TeamGroup } from './team-groups'

type Row = {
  name: string
  isNationalTeam?: boolean
  kind?: 'team' | 'athlete'
}
const club = (name: string): Row => ({ name, isNationalTeam: false })
const national = (name: string): Row => ({ name, isNationalTeam: true })
const shape = (groups: { label: string | null; teams: Row[] }[]) =>
  groups.map((group) => [group.label, group.teams.map((team) => team.name)])

// WEB-284
test('separa clubes de seleções, clubes primeiro, na ordem recebida', () => {
  expect(
    shape(
      groupTeamsByKind([
        national('Alemanha'),
        club('Arsenal'),
        national('Brasil'),
        club('PSG')
      ])
    )
  ).toEqual([
    ['Clubes', ['Arsenal', 'PSG']],
    ['Seleções', ['Alemanha', 'Brasil']]
  ])
})

test('esporte com um tipo só não ganha subtítulo', () => {
  expect(shape(groupTeamsByKind([club('Lakers'), club('Celtics')]))).toEqual([
    [null, ['Lakers', 'Celtics']]
  ])
  expect(shape(groupTeamsByKind([national('Brasil')]))).toEqual([
    [null, ['Brasil']]
  ])
  expect(groupTeamsByKind([])).toEqual([])
})

test('linha sem o campo (cache anterior à coluna) conta como clube', () => {
  expect(
    shape(groupTeamsByKind([{ name: 'Flamengo' }, national('Brasil')]))
  ).toEqual([
    ['Clubes', ['Flamengo']],
    ['Seleções', ['Brasil']]
  ])
})

// WEB-381
test('F1: escuderias são "Times" e pilotos, "Atletas"', () => {
  const athlete = (name: string): Row => ({ name, kind: 'athlete' })
  expect(
    shape(
      groupTeamsByKind([
        club('Ferrari'),
        athlete('Lewis Hamilton'),
        club('McLaren')
      ])
    )
  ).toEqual([
    ['Times', ['Ferrari', 'McLaren']],
    ['Atletas', ['Lewis Hamilton']]
  ])
  expect(shape(groupTeamsByKind([athlete('Alex Pereira')]))).toEqual([
    [null, ['Alex Pereira']]
  ])
})

test('grupo com rótulo é fieldset nomeado; sem rótulo, só os chips', () => {
  expect(
    renderToStaticMarkup(<TeamGroup label="Seleções">x</TeamGroup>)
  ).toMatch(/^<fieldset[^>]*><legend[^>]*>Seleções<\/legend><div/)
  expect(renderToStaticMarkup(<TeamGroup label={null}>x</TeamGroup>)).toMatch(
    /^<div[^>]*>x<\/div>$/
  )
})
