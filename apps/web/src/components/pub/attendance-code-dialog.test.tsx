import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AttendanceCodeDialog } from './attendance-code-dialog'

// Mesmo dublê de `event-delete-dialog.test.tsx`: o diálogo do base-ui não
// renderiza sem DOM. Foco, Esc e `aria-*` são dele; aqui se trava o conteúdo.
type Part = { children?: ReactNode }
mock.module('@findsports_oficial/ui/components/dialog', () => ({
  Dialog: ({ open, children }: Part & { open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: Part) => <div>{children}</div>,
  DialogTitle: ({ children }: Part) => <h2>{children}</h2>,
  DialogDescription: ({ children }: Part) => <p>{children}</p>
}))
mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className
  }: Part & { to?: string; className?: string }) => (
    <a href={String(to ?? '')} className={className}>
      {children}
    </a>
  )
}))

function renderizar(offer?: string | null, forWaiter = false) {
  const markup = renderToStaticMarkup(
    <AttendanceCodeDialog
      code="A7K29Q"
      offer={offer}
      forWaiter={forWaiter}
      onClose={() => {}}
    />
  )
  const doc = new JSDOM(markup).window.document
  return {
    doc,
    dialog: doc.querySelector('[role="dialog"]'),
    text: doc.body.textContent ?? ''
  }
}

describe('AttendanceCodeDialog', () => {
  test('no bar que confirma pela comanda, fala com o garçom (WEB-412)', () => {
    const { doc, text } = renderizar('Chopp em dobro', true)
    expect(doc.querySelector('h2')?.textContent).toBe(
      'Seu código para o garçom'
    )
    expect(text).toContain('Para o garçom: anote na comanda')
    expect(text).toContain(
      'ele anota na comanda e a oferta da casa sai na hora'
    )
    expect(text).not.toContain('balcão')
    expect(text).toContain('Chopp em dobro')
  })

  test('abre com o código grande, o uso no balcão e onde ele fica', () => {
    const { doc, dialog, text } = renderizar()
    expect(dialog).not.toBeNull()
    expect(doc.querySelector('h2')?.textContent).toBe(
      'Seu código para o balcão'
    )
    // Visível como na tela de Meus jogos; o leitor de tela soletra.
    const shown = doc.querySelector('p[aria-hidden="true"]')
    expect(shown?.textContent).toBe('A7K·29Q')
    expect(shown?.className).toContain('text-4xl')
    expect(text).toContain('Código: A 7 K 2 9 Q')
    expect(text).toContain(
      'Mostre este código no balcão do bar no dia do jogo para ganhar a oferta da casa. Ele vale uma vez só.'
    )
    expect(text).toContain('fica guardado em Meus jogos, no menu da sua conta')
    expect(text).not.toContain('Oferta da casa:')
  })

  test('leva a Meus jogos e tem botão de fechar', () => {
    const { doc } = renderizar()
    const link = doc.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/dashboard/games')
    expect(link?.textContent).toBe('Ver em Meus jogos')
    expect(
      [...doc.querySelectorAll('button')].map((b) => b.textContent)
    ).toEqual(['Fechar'])
  })

  test('mostra a oferta copiada na emissão', () => {
    const { text } = renderizar('Chopp em dobro no intervalo')
    expect(text).toContain('Oferta da casa: Chopp em dobro no intervalo')
  })
})
