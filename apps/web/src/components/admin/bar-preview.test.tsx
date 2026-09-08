import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AdminEvent, SubscriptionPlan } from './admin-model'
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

const BAR = {
  id: 'bar-1',
  name: 'Bar do Teste',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  latitude: '-23.56',
  longitude: '-46.68',
  photoUrl: null
}

function renderizar(plan: SubscriptionPlan) {
  const markup = renderToStaticMarkup(
    <BarPreview
      bar={BAR}
      eventsState={{ status: 'ready', events: [] as AdminEvent[] }}
      planState={{ status: 'ready', plan }}
    />
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
})
