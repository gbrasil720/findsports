import { afterEach, describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { Activity, act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlanState } from './admin-model'
import { HouseOfferEditor } from './house-offer-editor'

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
  plan: PlanState,
  houseOffer: string | null,
  saveError: string | null = null
) {
  const markup = renderToStaticMarkup(
    <HouseOfferEditor
      houseOffer={houseOffer}
      plan={plan}
      isSaving={false}
      saveError={saveError}
      onSave={async () => undefined}
    />
  )
  return new JSDOM(markup).window.document
}

describe('HouseOfferEditor', () => {
  test('sem Elite não oferece campo e aponta para os planos', () => {
    const doc = renderizar(
      { status: 'ready', plan: 'pro', standing: 'current' },
      null
    )
    expect(doc.querySelector('textarea')).toBeNull()
    expect(doc.querySelector('a[href="/plan"]')).not.toBeNull()
  })

  // WEB-141: Pro parado não dá Elite; regularizar não libera a oferta.
  test('Pro com pagamento pendente continua indo para os planos', () => {
    const doc = renderizar(
      {
        status: 'ready',
        plan: 'pro',
        standing: 'past_due'
      },
      null
    )
    expect(doc.querySelector('a[href="/plan"]')).not.toBeNull()
    expect(doc.querySelector('a[href="/admin/billing"]')).toBeNull()
  })

  test('sem Elite avisa que o texto salvo continua guardado', () => {
    const doc = renderizar(
      { status: 'ready', plan: 'pro', standing: 'current' },
      'Chopp em dobro'
    )
    expect(doc.body.textContent).toContain('Chopp em dobro')
    expect(doc.body.textContent).toContain('continua guardada')
  })

  test('com Elite o campo tem rótulo e dica associados', () => {
    const doc = renderizar(
      { status: 'ready', plan: 'elite', standing: 'current' },
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
      { status: 'ready', plan: 'elite', standing: 'current' },
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
    const doc = renderizar(
      { status: 'ready', plan: 'elite', standing: 'current' },
      null
    )
    const botoes = Array.from(doc.querySelectorAll('button')).map(
      (botao) => botao.textContent
    )
    expect(botoes).not.toContain('Remover oferta')
  })
})

describe('HouseOfferEditor dentro da aba', () => {
  const elite: PlanState = {
    status: 'ready',
    plan: 'elite',
    standing: 'current'
  }
  let dom: JSDOM | undefined
  let root: Root | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = undefined
    dom?.window.close()
  })

  function montar() {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    for (const key of ['window', 'document', 'navigator'] as const) {
      Object.defineProperty(globalThis, key, {
        value: dom.window[key],
        configurable: true
      })
    }
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    // O React carregou antes do JSDOM e cai no caminho de IE para `input`.
    Object.assign(dom.window.HTMLTextAreaElement.prototype, {
      attachEvent() {},
      detachEvent() {}
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    const desenhar = (visible: boolean, houseOffer: string | null) =>
      act(() =>
        root?.render(
          <Activity mode={visible ? 'visible' : 'hidden'}>
            <HouseOfferEditor
              houseOffer={houseOffer}
              plan={elite}
              isSaving={false}
              saveError={null}
              onSave={async () => undefined}
            />
          </Activity>
        )
      )
    const campo = () =>
      document.querySelector('textarea') as HTMLTextAreaElement
    const digitar = (value: string) =>
      act(() => {
        const field = campo()
        field.focus()
        Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set?.call(field, value)
        field.dispatchEvent(new window.Event('input', { bubbles: true }))
        field.dispatchEvent(new window.Event('keyup', { bubbles: true }))
      })
    return { desenhar, campo, digitar }
  }

  // O `Activity` destrói os efeitos ao esconder a aba e os recria ao mostrar;
  // o refetch do `getMe` ao voltar devolve o mesmo valor gravado.
  test('o rascunho sobrevive a trocar de aba e a um refetch', () => {
    const { desenhar, campo, digitar } = montar()
    desenhar(true, 'Chopp em dobro')
    digitar('Porção grátis')
    // Botão liberado prova que o React recebeu o que foi digitado.
    expect(
      (document.querySelector('button[type="submit"]') as HTMLButtonElement)
        .disabled
    ).toBe(false)

    desenhar(false, 'Chopp em dobro')
    desenhar(true, 'Chopp em dobro')
    expect(campo().value).toBe('Porção grátis')
  })

  test('o rascunho acompanha o valor gravado quando ele muda', () => {
    const { desenhar, campo, digitar } = montar()
    desenhar(true, null)
    digitar('Chopp em dobro')
    desenhar(true, 'Chopp em dobro')
    expect(campo().value).toBe('Chopp em dobro')

    desenhar(true, 'Porção grátis')
    expect(campo().value).toBe('Porção grátis')
  })
})
