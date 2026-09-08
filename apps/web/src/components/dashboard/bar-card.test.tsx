import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { MinuteTickProvider } from '@/components/app/minute-tick'
import type { DiscoveryCardBar } from '@/domain/dashboard-selectors'
import { BarCard } from './bar-card'

// O Link do TanStack exige contexto de router, que não existe num teste de
// markup estático.
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

type Plano = DiscoveryCardBar['plan']

function criarBar(
  plan: Plano,
  nextEvent?: DiscoveryCardBar['nextEvent']
): DiscoveryCardBar {
  return {
    id: `bar-${plan}`,
    name: `Bar ${plan}`,
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    latitude: '-23.56',
    longitude: '-46.68',
    photo_url: null,
    distance_km: 1.2,
    plan,
    event_count: nextEvent ? 1 : 0,
    nextEvent
  }
}

function eventoEm(startsAt: Date): NonNullable<DiscoveryCardBar['nextEvent']> {
  return {
    id: 'evento-1',
    championship: 'Brasileirão',
    startsAt: startsAt.toISOString(),
    sport: { name: 'Futebol', slug: 'futebol' },
    participants: [],
    participantFreeText: null
  } as NonNullable<DiscoveryCardBar['nextEvent']>
}

function renderizar(bar: DiscoveryCardBar) {
  const markup = renderToStaticMarkup(
    <MinuteTickProvider>
      <BarCard
        bar={bar}
        isHovered={false}
        isFavorite={false}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
        onFavorite={() => {}}
      />
    </MinuteTickProvider>
  )
  return new JSDOM(markup).window.document
}

/** O selo é o único elemento do card que nomeia o plano. */
function selo(documento: Document): Element | null {
  return (
    Array.from(documento.querySelectorAll('span')).find((elemento) =>
      ['Pro', 'Elite'].includes(elemento.textContent?.trim() ?? '')
    ) ?? null
  )
}

describe('selo de plano', () => {
  test('starter não ganha selo nem penalidade textual', () => {
    const documento = renderizar(criarBar('starter'))
    expect(selo(documento)).toBeNull()
    expect(documento.body.textContent).not.toContain('Starter')
    expect(documento.body.textContent).not.toContain('upgrade')
  })

  test('pro e elite ganham selo com o nome do plano', () => {
    expect(selo(renderizar(criarBar('pro')))?.textContent?.trim()).toBe('Pro')
    expect(selo(renderizar(criarBar('elite')))?.textContent?.trim()).toBe(
      'Elite'
    )
  })

  /**
   * O desenho anterior usava `Star` nos dois planos e distinguia só pela cor
   * de fundo. Ícone diferente é o que faz o selo funcionar para quem não
   * distingue as duas cores.
   */
  test('pro e elite se distinguem sem depender de cor', () => {
    const iconePro = selo(renderizar(criarBar('pro')))?.querySelector('svg')
    const iconeElite = selo(renderizar(criarBar('elite')))?.querySelector('svg')

    expect(iconePro).not.toBeNull()
    expect(iconeElite).not.toBeNull()
    expect(iconePro?.innerHTML).not.toBe(iconeElite?.innerHTML)
  })

  /**
   * O selo mora no fluxo do card. Enquanto era posicionado por cima, o layout
   * se ajustava a ele com margem condicional (`mt-4 sm:mt-0`) — e era essa
   * margem que sumia quando o bar era Starter.
   */
  test('selo não é posicionado por cima do card', () => {
    const marcado = selo(renderizar(criarBar('elite')))
    expect(marcado?.className).not.toContain('absolute')
    expect(renderizar(criarBar('elite')).body.innerHTML).not.toContain('mt-4')
  })
})

describe('plano e estado ao vivo', () => {
  test('bar elite com jogo ao vivo mostra os dois sinais', () => {
    const documento = renderizar(
      criarBar('elite', eventoEm(new Date(Date.now() - 10 * 60_000)))
    )

    expect(documento.body.textContent).toContain('Ao vivo')
    expect(selo(documento)?.textContent?.trim()).toBe('Elite')
  })

  /**
   * Ao vivo é urgência e plano é hierarquia: canais diferentes. O avatar
   * carrega só o estado — antes ele trocava de cor por plano *e* por estado, e
   * o bar Elite ao vivo perdia o sinal de plano.
   */
  test('avatar não carrega mais acento de plano', () => {
    const avatarElite = renderizar(criarBar('elite')).querySelector(
      'div[class*="size-16"]'
    )
    const avatarPro = renderizar(criarBar('pro')).querySelector(
      'div[class*="size-16"]'
    )

    expect(avatarElite?.className).toBe(avatarPro?.className ?? '')
    expect(avatarElite?.className).not.toContain('onside-acid')
  })

  test('avatar ao vivo continua marcado, em qualquer plano', () => {
    const aoVivo = renderizar(
      criarBar('starter', eventoEm(new Date(Date.now() - 10 * 60_000)))
    ).querySelector('div[class*="size-16"]')

    expect(aoVivo?.className).toContain('onside-live')
  })
})
