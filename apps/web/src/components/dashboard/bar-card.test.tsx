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
    participantFreeText: null,
    classic: null
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

/** A raiz do card, que é onde o tratamento de plano mora. */
function cartao(documento: Document): Element {
  const raiz = documento.querySelector('.onside-bar-card')
  if (!raiz) throw new Error('card não encontrado')
  return raiz
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

/**
 * O plano é expresso pelo card inteiro, não só pelo selo: uma etiqueta de 9px
 * na terceira linha some quando a lista rola, que é exatamente quando o
 * torcedor está escolhendo.
 */
describe('tratamento do card por plano', () => {
  test('starter fica no papel, sem trilho e sem inversão', () => {
    const raiz = cartao(renderizar(criarBar('starter')))
    expect(raiz.className).toContain('onside-bar-card')
    expect(raiz.className).not.toContain('onside-bar-card-pro')
    expect(raiz.className).not.toContain('onside-bar-card-elite')
  })

  test('pro ganha o trilho acid', () => {
    const raiz = cartao(renderizar(criarBar('pro')))
    expect(raiz.className).toContain('onside-bar-card-pro')
    expect(raiz.className).not.toContain('onside-bar-card-elite')
  })

  test('elite ganha o card invertido', () => {
    const raiz = cartao(renderizar(criarBar('elite')))
    expect(raiz.className).toContain('onside-bar-card-elite')
    expect(raiz.className).not.toContain('onside-bar-card-pro')
  })

  /**
   * Cor sozinha não pode carregar a distinção, e os três degraus são formas
   * diferentes de cartão — mas o nome do plano escrito é o que fecha a conta
   * para quem não distingue acid de papel.
   */
  test('cada plano pago tem forma e nome próprios', () => {
    const pro = renderizar(criarBar('pro'))
    const elite = renderizar(criarBar('elite'))

    expect(cartao(pro).className).not.toBe(cartao(elite).className)
    expect(selo(pro)?.textContent?.trim()).toBe('Pro')
    expect(selo(elite)?.textContent?.trim()).toBe('Elite')
  })

  /**
   * O card inverte oito coisas de uma vez. Se o texto continuasse preso ao
   * token global, o card Elite renderizaria ink sobre ink — invisível, e
   * invisível não aparece num teste de markup.
   */
  test('texto e fundo do card vêm dos tokens locais, não dos globais', () => {
    const raiz = cartao(renderizar(criarBar('elite')))
    expect(raiz.className).toContain('bg-[var(--bar-card-bg)]')
    expect(raiz.className).toContain('text-[var(--bar-card-fg)]')
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

  /**
   * `--onside-live-text` tem 3.43:1 contra o ink, abaixo do mínimo de 4.5:1
   * para texto pequeno. Dentro do card invertido o rótulo usa o vermelho de
   * superfície escura.
   */
  test('rótulo de ao vivo troca de vermelho no card invertido', () => {
    const elite = renderizar(
      criarBar('elite', eventoEm(new Date(Date.now() - 10 * 60_000)))
    )
    expect(elite.body.innerHTML).toContain('var(--bar-card-live)')
  })

  test('avatar ao vivo continua marcado, em qualquer plano', () => {
    const aoVivo = renderizar(
      criarBar('starter', eventoEm(new Date(Date.now() - 10 * 60_000)))
    ).querySelector('div[class*="size-16"]')

    expect(aoVivo?.className).toContain('onside-live')
  })
})
