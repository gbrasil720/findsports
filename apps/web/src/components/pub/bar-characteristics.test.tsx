import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// `OwnerNudge` usa `Link`, que precisa de um roteador montado.
mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>
}))

const { BarCharacteristics, BarMenuInfo } = await import(
  './bar-characteristics'
)

function renderizar(
  menuUrl: string | null,
  averageSpendCents: number | null,
  isOwner = false
) {
  const markup = renderToStaticMarkup(
    <BarCharacteristics
      amenities={[]}
      screenCount={null}
      description={null}
      menuUrl={menuUrl}
      averageSpendCents={averageSpendCents}
      facts={[]}
      isOwner={isOwner}
    />
  )
  return new JSDOM(markup).window.document
}

describe('BarCharacteristics com cardápio e preço médio', () => {
  test('perfil antigo, sem nada, continua sem seção', () => {
    expect(renderizar(null, null).body.innerHTML).toBe('')
  })

  test('mostra valor em BRL com a origem declarada', () => {
    const texto = renderizar(null, 4550).body.textContent ?? ''
    expect(texto.replace(/\s/g, ' ')).toContain('R$ 45,50')
    expect(texto).toContain('Preço médio por pessoa informado pelo bar')
    expect(texto).toContain('Informações declaradas pelo estabelecimento.')
  })

  test('link externo abre em nova aba sem acesso ao opener', () => {
    const doc = renderizar('https://www.instagram.com/meubar', null)
    const link = doc.querySelector('a[href="https://www.instagram.com/meubar"]')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.textContent).toContain('Ver cardápio')
    expect(link?.textContent).toContain('instagram.com')
    expect(link?.textContent).toContain('site externo, abre em nova aba')
  })

  test('cardápio não cala o aviso ao dono sobre características', () => {
    const texto = renderizar('https://bar.com.br/', 4550, true).body.textContent
    expect(texto).toContain('Sem características marcadas')
  })

  test('nunca mostra R$ 0', () => {
    expect(
      renderToStaticMarkup(<BarMenuInfo menuUrl={null} averageSpendCents={0} />)
    ).toBe('')
    expect(renderizar(null, 0).body.textContent ?? '').not.toContain('R$')
  })
})
