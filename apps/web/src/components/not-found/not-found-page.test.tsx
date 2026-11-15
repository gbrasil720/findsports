import { expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { NotFoundPage } from './not-found-page'

// O Link do TanStack exige contexto de router, que não existe num teste de
// markup estático; um stub com <a> basta para exercitar o heading do 404.
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

test('a 404 é a página do Jules: título, saídas e taça decorativa (WEB-554)', () => {
  const markup = renderToStaticMarkup(<NotFoundPage />)
  const doc = new JSDOM(markup).window.document

  expect(doc.querySelector('h1')?.textContent).toBe('Bola fora.')
  const links = [...doc.querySelectorAll('a')].map((a) => [
    a.textContent,
    a.getAttribute('href')
  ])
  expect(links).toContainEqual(['Ver jogos de hoje', '/dashboard'])
  expect(links).toContainEqual(['Voltar ao início', '/'])
  // O Jules não é lido: o texto ao lado diz tudo.
  expect(doc.querySelector('.erro-jules')?.getAttribute('aria-hidden')).toBe(
    'true'
  )
})
