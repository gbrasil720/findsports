import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { type HouseOfferAccess, HouseOfferEditor } from './house-offer-editor'

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
  access: HouseOfferAccess,
  houseOffer: string | null,
  saveError: string | null = null
) {
  const markup = renderToStaticMarkup(
    <HouseOfferEditor
      houseOffer={houseOffer}
      access={access}
      isSaving={false}
      saveError={saveError}
      onSave={async () => undefined}
    />
  )
  return new JSDOM(markup).window.document
}

describe('HouseOfferEditor', () => {
  test('sem Elite não oferece campo e aponta para os planos', () => {
    const doc = renderizar({ status: 'ready', eligible: false }, null)
    expect(doc.querySelector('textarea')).toBeNull()
    expect(doc.querySelector('a[href="/plan"]')).not.toBeNull()
  })

  test('sem Elite avisa que o texto salvo continua guardado', () => {
    const doc = renderizar(
      { status: 'ready', eligible: false },
      'Chopp em dobro'
    )
    expect(doc.body.textContent).toContain('Chopp em dobro')
    expect(doc.body.textContent).toContain('continua guardada')
  })

  test('com Elite o campo tem rótulo e dica associados', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      'Chopp em dobro'
    )
    const campo = doc.querySelector('textarea')
    expect(campo).not.toBeNull()
    expect(campo?.textContent).toBe('Chopp em dobro')

    const rotulo = doc.querySelector(`label[for="${campo?.id}"]`)
    expect(rotulo?.textContent).toContain('Sua oferta')

    const dica = campo?.getAttribute('aria-describedby') ?? ''
    expect(doc.getElementById(dica)).not.toBeNull()
    expect(campo?.hasAttribute('aria-invalid')).toBe(false)

    // Oferta gravada pode ser removida sem apagar o campo à mão.
    const botoes = Array.from(doc.querySelectorAll('button')).map(
      (botao) => botao.textContent
    )
    expect(botoes).toContain('Remover oferta')
  })

  test('erro do servidor é anunciado e ligado ao campo', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      null,
      'A oferta da casa é um recurso do plano Elite.'
    )
    const campo = doc.querySelector('textarea')
    const alerta = doc.querySelector('[role="alert"]')
    expect(alerta?.textContent).toBe(
      'A oferta da casa é um recurso do plano Elite.'
    )
    expect(campo?.getAttribute('aria-invalid')).toBe('true')
    expect(campo?.getAttribute('aria-describedby')).toContain(alerta?.id ?? '-')
  })

  test('sem oferta gravada não mostra o botão de remover', () => {
    const doc = renderizar({ status: 'ready', eligible: true }, null)
    const botoes = Array.from(doc.querySelectorAll('button')).map(
      (botao) => botao.textContent
    )
    expect(botoes).not.toContain('Remover oferta')
  })
})
