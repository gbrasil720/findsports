import { expect, mock, test } from 'bun:test'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'

import { type EventForm, EventFormComponent } from './event-form'

mock.module('@/utils/trpc', () => ({
  useTRPC: () => ({
    pubs: {
      getTeamsBySport: {
        queryOptions: ({ sportId }: { sportId: string }) => ({
          queryKey: ['teams', sportId],
          queryFn: async () => []
        })
      }
    }
  })
}))

const FILLED: EventForm = {
  sportId: 'futebol-id',
  championship: 'Brasileirão',
  startsAt: '2026-10-10T21:00',
  endsAt: '',
  participantIds: [],
  participantFreeText: ''
}

function render(form: Partial<EventForm>) {
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <EventFormComponent
        initial={{ ...FILLED, ...form }}
        sports={[{ id: 'futebol-id', name: 'Futebol', slug: 'futebol' }]}
        onSave={() => {}}
        onCancel={() => {}}
        isSaving={false}
        loadingSports={false}
      />
    </QueryClientProvider>
  )
  const doc = new JSDOM(markup).window.document
  const save = [...doc.querySelectorAll('button')].find(
    (button) => button.textContent === 'Salvar'
  )
  return {
    text: doc.body.textContent ?? '',
    alerts: [...doc.querySelectorAll('[role="alert"]')].map(
      (alert) => alert.textContent
    ),
    saveDisabled: save?.hasAttribute('disabled')
  }
}

test('formulário completo libera o salvar, sem aviso', () => {
  const form = render({})
  expect(form.saveDisabled).toBe(false)
  expect(form.alerts).toEqual([])
  expect(form.text).not.toContain('falta preencher')
})

// WEB-305
test('salvar travado diz quais obrigatórios faltam', () => {
  const empty = render({ sportId: '', championship: '', startsAt: '' })
  expect(empty.saveDisabled).toBe(true)
  expect(empty.text).toContain(
    'Para salvar, falta preencher: esporte, campeonato (pelo menos 2 caracteres), data e horário.'
  )

  const short = render({ championship: 'A' })
  expect(short.saveDisabled).toBe(true)
  expect(short.text).toContain(
    'Para salvar, falta preencher: campeonato (pelo menos 2 caracteres).'
  )
})

// WEB-265: os mesmos limites do servidor, com contador e mensagem.
test('campeonato e texto livre acima do limite avisam e travam o salvar', () => {
  const atLimit = render({
    championship: 'c'.repeat(EVENT_CHAMPIONSHIP_MAX_LENGTH),
    participantFreeText: 't'.repeat(EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH)
  })
  expect(atLimit.saveDisabled).toBe(false)
  expect(atLimit.text).toContain('150/150')
  expect(atLimit.text).toContain('200/200')

  const championship = render({
    championship: 'c'.repeat(EVENT_CHAMPIONSHIP_MAX_LENGTH + 50)
  })
  expect(championship.saveDisabled).toBe(true)
  expect(championship.alerts).toEqual([
    'O campeonato aceita até 150 caracteres. Tire 50.'
  ])

  const freeText = render({
    participantFreeText: 't'.repeat(EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH + 5)
  })
  expect(freeText.saveDisabled).toBe(true)
  expect(freeText.alerts).toEqual([
    'O texto livre aceita até 200 caracteres. Tire 5.'
  ])
})
