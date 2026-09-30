import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

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

const { BarMenuEditor } = await import('./bar-menu-editor')

type Access = Parameters<typeof BarMenuEditor>[0]['access']

function renderizar(
  access: Access,
  menuUrl: string | null,
  averageSpendCents: number | null,
  saveError: string | null = null
) {
  const markup = renderToStaticMarkup(
    <BarMenuEditor
      menuUrl={menuUrl}
      averageSpendCents={averageSpendCents}
      access={access}
      isSaving={false}
      saveError={saveError}
      onSave={async () => undefined}
    />
  )
  return new JSDOM(markup).window.document
}

describe('BarMenuEditor', () => {
  test('sem Pro/Elite não oferece campos e aponta para os planos', () => {
    const doc = renderizar({ status: 'ready', eligible: false }, null, null)
    expect(doc.querySelector('input')).toBeNull()
    expect(doc.querySelector('a[href="/plan"]')).not.toBeNull()
    expect(doc.body.textContent).toContain('Pro e Elite')
  })

  test('sem plano avisa que os dados continuam guardados', () => {
    const doc = renderizar(
      { status: 'ready', eligible: false },
      'https://bar.com.br/cardapio',
      4550
    )
    const texto = (doc.body.textContent ?? '').replace(/\s/g, ' ')
    expect(texto).toContain('Continuam guardados')
    expect(texto).toContain('bar.com.br')
    expect(texto).toContain('R$ 45,50')
  })

  test('com um item guardado a frase fica no singular', () => {
    const doc = renderizar({ status: 'ready', eligible: false }, null, 4550)
    const texto = (doc.body.textContent ?? '').replace(/\s/g, ' ')
    expect(texto).toContain('Continua guardado o preço médio de R$ 45,50')
    expect(texto).toContain('não aparece no perfil')
  })

  test('com plano os campos têm rótulo, dica e valor gravado', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      'https://bar.com.br/cardapio',
      4550
    )
    const [url, gasto] = Array.from(doc.querySelectorAll('input'))
    expect(url?.getAttribute('value')).toBe('https://bar.com.br/cardapio')
    expect(gasto?.getAttribute('value')).toBe('45,50')
    expect(gasto?.getAttribute('inputmode')).toBe('decimal')

    for (const campo of [url, gasto]) {
      expect(doc.querySelector(`label[for="${campo?.id}"]`)).not.toBeNull()
      const dica = campo?.getAttribute('aria-describedby') ?? ''
      expect(doc.getElementById(dica)).not.toBeNull()
    }
    expect(doc.body.textContent).toContain('sem taxa de serviço')
  })

  test('mostra a prévia do formato final', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      'https://bar.com.br/cardapio',
      4550
    )
    const texto = doc.body.textContent ?? ''
    expect(texto).toContain('Como aparece no perfil')
    expect(texto).toContain('Preço médio por pessoa informado pelo bar')
  })

  test('sem dados não mostra prévia vazia', () => {
    const doc = renderizar({ status: 'ready', eligible: true }, null, null)
    expect(doc.body.textContent).not.toContain('Como aparece no perfil')
  })

  test('erro do servidor é anunciado', () => {
    const doc = renderizar(
      { status: 'ready', eligible: true },
      null,
      null,
      'Não foi possível salvar.'
    )
    expect(doc.querySelector('[role="alert"]')?.textContent).toBe(
      'Não foi possível salvar.'
    )
  })
})
