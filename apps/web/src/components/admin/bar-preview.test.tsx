import { describe, expect, mock, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AdminEvent, ProfileState, SubscriptionPlan } from './admin-model'
import { BarPreview } from './bar-preview'

mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to?: string
    children?: ReactNode
    className?: string
    'aria-label'?: string
  }) => (
    <a href={String(to ?? '')} {...rest}>
      {children}
    </a>
  )
}))

// O mapa carrega o maplibre e um estilo próprio; o preview do card não depende
// dele, e renderizá-lo aqui só traria WebGL para dentro do teste.
mock.module('@/components/app/onside-map', () => ({
  OnsideMap: () => <div data-testid="mapa" />
}))

// "Vou assistir aqui" monta a mutation; a prévia só precisa do botão.
mock.module('@/utils/trpc', () => ({
  useTRPC: () => ({
    attendance: { set: { mutationOptions: () => ({}) } },
    pubs: { getById: { queryKey: () => [] } }
  })
}))

const BAR = {
  id: 'bar-1',
  name: 'Bar do Teste',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  latitude: '-23.56',
  longitude: '-46.68',
  photoUrl: null
}

const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

type Profile = Extract<ProfileState, { status: 'ready' }>['profile']

/** A resposta de `pubs.getById` para o próprio dono, já resolvida pelo servidor. */
function perfil(overrides: Partial<Profile> = {}): ProfileState {
  return {
    status: 'ready',
    profile: {
      ...BAR,
      description: null,
      phone: '+5511999999999',
      phoneAcceptsWhatsapp: true,
      address: 'Rua dos Pinheiros, 1',
      amenities: [],
      screenCount: null,
      createdAt: AMANHA,
      updatedAt: AMANHA,
      plan: 'elite',
      isActive: true,
      rating: null,
      houseOffer: null,
      acceptsReservations: true,
      menuUrl: null,
      averageSpendCents: 6000,
      isOwner: true,
      events: [
        {
          id: 'jogo-1',
          championship: 'Brasileirão',
          startsAt: AMANHA,
          endsAt: null,
          participantFreeText: 'Time A × Time B',
          reservationsSoldOut: false,
          // O dono nunca recebe presença; a prévia monta a do torcedor.
          attendance: null,
          sport: { name: 'Futebol', slug: 'futebol' },
          participants: []
        }
      ],
      ...overrides
    } as Profile
  }
}

function renderizar(
  plan: SubscriptionPlan | 'error',
  profileState: ProfileState = { status: 'loading' }
) {
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BarPreview
        bar={BAR}
        eventsState={{ status: 'ready', events: [] as AdminEvent[] }}
        planState={
          plan === 'error'
            ? { status: 'error' }
            : { status: 'ready', plan, currentPlan: plan }
        }
        profileState={profileState}
      />
    </QueryClientProvider>
  )
  return new JSDOM(markup).window.document
}

function selo(documento: Document): Element | null {
  return (
    Array.from(documento.querySelectorAll('span')).find((elemento) =>
      ['Pro', 'Elite'].includes(elemento.textContent?.trim() ?? '')
    ) ?? null
  )
}

/**
 * O preview de `/admin` é o mesmo `BarCard` de `/dashboard`. Estes testes
 * existem para que ele continue sendo: se alguém trocar o preview do dono por
 * um card próprio, o selo passa a divergir do que o torcedor vê e ninguém
 * percebe até um dono reclamar.
 */
describe('preview do dono em /admin', () => {
  test('mostra o selo do plano contratado', () => {
    expect(selo(renderizar('pro'))?.textContent?.trim()).toBe('Pro')
    expect(selo(renderizar('elite'))?.textContent?.trim()).toBe('Elite')
  })

  test('starter não ganha selo no preview, como no card do torcedor', () => {
    expect(selo(renderizar('starter'))).toBeNull()
  })

  // A falha é anunciada uma vez só, pela aba (WEB-142).
  test('falha ao ler o plano não vira alerta nem botão no preview', () => {
    const doc = renderizar('error')
    expect(doc.querySelector('[role="alert"]')).toBeNull()
    expect(doc.querySelector('button')).toBeNull()
    expect(doc.body.textContent).toContain('Preview indisponível.')
  })
})

/**
 * O que o torcedor vê no perfil sai de `pubs.getById`, já resolvido pelo
 * servidor (preço médio com Pro/Elite vigente, reserva com Elite e recebimento
 * ligado). A prévia usa a mesma resposta e os mesmos componentes do perfil.
 */
describe('prévia do perfil em /admin', () => {
  test('mostra o preço médio que o servidor liberou', () => {
    const doc = renderizar('elite', perfil())
    expect(doc.body.textContent).toContain('por pessoa, informado pelo bar')
  })

  test('sem preço liberado pelo servidor, a prévia também não mostra', () => {
    const doc = renderizar('elite', perfil({ averageSpendCents: null }))
    expect(doc.body.textContent).not.toContain('por pessoa')
  })

  test('mostra "Reservar mesa" e "Vou assistir aqui" como o torcedor vê', () => {
    const texto = renderizar('elite', perfil()).body.textContent
    expect(texto).toContain('Reservar mesa')
    expect(texto).toContain('Vou assistir aqui')
    expect(texto).toContain('WhatsApp')
  })

  test('sem recebimento efetivo, não há "Reservar mesa"', () => {
    const texto = renderizar('pro', perfil({ acceptsReservations: false })).body
      .textContent
    expect(texto).not.toContain('Reservar mesa')
    expect(texto).toContain('Falar com o bar')
    expect(texto).toContain('Vou assistir aqui')
  })

  test('as ações da prévia não disparam nada: ficam inertes', () => {
    const doc = renderizar('elite', perfil())
    const reservar = Array.from(doc.querySelectorAll('button')).find((botao) =>
      botao.textContent?.includes('Reservar mesa')
    )
    expect(reservar?.closest('[inert]')).toBeTruthy()
  })

  test('falha ao ler o perfil vira aviso na prévia', () => {
    const doc = renderizar('elite', { status: 'error' })
    expect(doc.body.textContent).toContain('Prévia do perfil indisponível.')
  })
})
