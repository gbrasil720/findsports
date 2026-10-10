import { expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Mesmo stub do teste da 404: `Link` exige contexto de router.
mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    hash,
    children,
    ...rest
  }: {
    to?: string
    hash?: string
    children?: ReactNode
    className?: string
  }) => (
    <a href={`${to ?? ''}${hash ? `#${hash}` : ''}`} {...rest}>
      {children}
    </a>
  )
}))

const render = async (props: {
  isPublished?: boolean
  subscriptionEnded?: boolean
}) => {
  const { OwnerPreviewBanner } = await import('./owner-notice')
  return renderToStaticMarkup(<OwnerPreviewBanner {...props} />)
}

// WEB-345: bar fora do ar por assinatura encerrada lia "ainda fora do ar",
// texto de quem nunca foi publicado.
test('assinatura encerrada tem aviso próprio, com caminho para o plano', async () => {
  const markup = await render({ isPublished: false, subscriptionEnded: true })
  expect(markup).toContain('Seu bar está fora do ar: a assinatura terminou')
  expect(markup).toContain('Contrate um plano para voltar às buscas')
  expect(markup).toContain('href="/plan"')
  expect(markup).not.toContain('ainda fora do ar')
})

test('bar nunca publicado continua com o aviso de prévia', async () => {
  const markup = await render({ isPublished: false })
  expect(markup).toContain('Prévia do seu perfil — ainda fora do ar')
  expect(markup).not.toContain('a assinatura terminou')
})

test('bar no ar não fala de assinatura', async () => {
  const markup = await render({ isPublished: true, subscriptionEnded: true })
  expect(markup).toContain('Você está vendo seu perfil como o torcedor vê')
  expect(markup).not.toContain('a assinatura terminou')
})
