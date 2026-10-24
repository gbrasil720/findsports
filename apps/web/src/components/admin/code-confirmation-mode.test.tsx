import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to?: string; children?: ReactNode }) => (
    <a href={String(to ?? '')} {...rest}>
      {children}
    </a>
  )
}))

const { CodeConfirmationMode } = await import('./code-confirmation-mode')

const render = (later: boolean) =>
  new JSDOM(
    renderToStaticMarkup(
      <CodeConfirmationMode
        later={later}
        offer="Chopp em dobro"
        isSaving={false}
        saveError={null}
        onChange={() => {}}
      />
    )
  ).window.document

describe('CodeConfirmationMode (WEB-412)', () => {
  test('na hora: só a escolha, marcada', () => {
    const doc = render(false)
    expect(doc.body.textContent).toContain('Como o código é conferido')
    expect(doc.body.textContent).not.toContain('Recado para a equipe')
    const marcado = doc.querySelector<HTMLInputElement>('input:checked')
    expect(marcado?.value).toBe('now')
  })

  test('pela comanda: o recado à equipe e o caminho para lançar', () => {
    const doc = render(true)
    expect(doc.body.textContent).toContain(
      'ganha a oferta da casa: Chopp em dobro.'
    )
    expect(doc.querySelector('a[href="/admin/validate"]')).not.toBeNull()
  })
})
