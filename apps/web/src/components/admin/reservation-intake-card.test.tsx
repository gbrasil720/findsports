import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { EliteAccess } from './admin-model'
import { ReservationIntakeCard } from './reservation-intake-card'

mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to?: string
    children?: ReactNode
    className?: string
  }) => (
    <a href={String(to ?? '')} {...rest}>
      {children}
    </a>
  )
}))

function renderizar(
  access: EliteAccess,
  acceptsReservations: boolean,
  saveError: string | null = null
) {
  const markup = renderToStaticMarkup(
    <ReservationIntakeCard
      acceptsReservations={acceptsReservations}
      hasHouseOffer
      access={access}
      isSaving={false}
      saveError={saveError}
      onChange={async () => undefined}
    />
  )
  return new JSDOM(markup).window.document
}

describe('ReservationIntakeCard', () => {
  test('sem Elite e desligado aponta para os planos e não deixa ligar', () => {
    const doc = renderizar({ status: 'ready', eligible: false }, false)
    expect(doc.querySelector('a[href="/plan"]')).not.toBeNull()
    const chave = doc.querySelector('button[role="switch"]')
    expect(chave?.getAttribute('aria-checked')).toBe('false')
    expect(chave?.hasAttribute('disabled')).toBe(true)
  })

  test('com Elite o interruptor é um botão rotulado, com estado e dica', () => {
    const doc = renderizar({ status: 'ready', eligible: true }, false)
    const chave = doc.querySelector('button[role="switch"]')
    expect(chave?.getAttribute('aria-checked')).toBe('false')
    expect(chave?.hasAttribute('disabled')).toBe(false)

    const rotulo = doc.getElementById(
      chave?.getAttribute('aria-labelledby') ?? '-'
    )
    expect(rotulo?.textContent).toBe('Receber pedidos de reserva')
    const dica = doc.getElementById(
      chave?.getAttribute('aria-describedby') ?? '-'
    )
    expect(dica?.textContent).toContain('oferta da casa')
    // Região que anuncia o resultado existe antes do clique.
    expect(doc.querySelector('[role="status"]')).not.toBeNull()
  })

  test('sem Elite com o interruptor ligado ainda deixa desligar', () => {
    const doc = renderizar({ status: 'ready', eligible: false }, true)
    const chave = doc.querySelector('button[role="switch"]')
    expect(chave?.getAttribute('aria-checked')).toBe('true')
    expect(chave?.hasAttribute('disabled')).toBe(false)
  })

  test('erro do servidor é anunciado e ligado ao interruptor', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      false,
      'Receber reservas é um recurso do plano Elite.'
    )
    const chave = doc.querySelector('button[role="switch"]')
    const alerta = doc.querySelector('[role="alert"]')
    expect(alerta?.textContent).toBe(
      'Receber reservas é um recurso do plano Elite.'
    )
    expect(chave?.getAttribute('aria-describedby')).toContain(alerta?.id ?? '-')
  })
})
