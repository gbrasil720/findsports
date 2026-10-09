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
    fields: [...doc.querySelectorAll('input[placeholder="dd/mm/aaaa hh:mm"]')],
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

  // Só espaços não é campeonato: o servidor apara antes de validar.
  expect(render({ championship: '   ' }).saveDisabled).toBe(true)
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

// WEB-306: o formato não depende mais do idioma do navegador.
test('data e hora abrem com máscara dd/mm/aaaa hh:mm, sem campo nativo', () => {
  const form = render({ endsAt: '2026-10-10T23:30' })
  expect(form.fields.map((field) => field.getAttribute('value'))).toEqual([
    '10/10/2026 21:00',
    '10/10/2026 23:30'
  ])
  for (const field of form.fields) {
    expect(field.getAttribute('type')).toBe('text')
    expect(field.getAttribute('inputmode')).toBe('numeric')
    expect(field.getAttribute('autocomplete')).toBe('off')
  }
  expect(form.text).toContain('Dia, mês, ano e horário de 24 h')
  expect(form.saveDisabled).toBe(false)
})

test('término igual ou anterior ao início avisa e trava o salvar', () => {
  const form = render({ endsAt: '2026-10-10T21:00' })
  expect(form.saveDisabled).toBe(true)
  expect(form.alerts).toEqual(['Término deve ser posterior ao início.'])

  // Virada de ano: 23h → 00h30 do dia seguinte é depois.
  const overnight = render({
    startsAt: '2026-12-31T23:00',
    endsAt: '2027-01-01T00:30'
  })
  expect(overnight.saveDisabled).toBe(false)
  expect(overnight.alerts).toEqual([])
})
