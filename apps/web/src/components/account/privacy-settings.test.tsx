import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * A seção de cookies das configurações da conta (WEB-244). O que estes testes
 * travam: a tela diz a escolha que está valendo e oferece só a troca que faz
 * sentido — quem recusou vê "Aceitar", quem aceitou vê "Recusar".
 */

let dom: JSDOM
let root: Root | null = null

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.onside.test/'
  })
  // `HTMLElement` e companhia: o botão da biblioteca de UI checa
  // `instanceof HTMLElement` no global, não em `window`.
  for (const chave of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'getComputedStyle'
  ] as const) {
    Object.defineProperty(globalThis, chave, {
      value: dom.window[chave],
      configurable: true
    })
  }
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  dom.window.close()
})

async function montar(consent: 'granted' | 'denied' | 'unset') {
  const { PrivacySettingsSection } = await import('./privacy-settings')
  const escolhas: string[] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root?.render(
      <PrivacySettingsSection
        consent={consent}
        onChange={(valor) => escolhas.push(valor)}
      />
    )
  )
  const botoes = () =>
    [...container.querySelectorAll('button')].map((b) => b.textContent)
  const clicar = (rotulo: string) => {
    const botao = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === rotulo
    )
    if (!botao) throw new Error(`sem botão ${rotulo}`)
    act(() => botao.click())
  }
  return { container, escolhas, botoes, clicar }
}

describe('cookies nas configurações da conta', () => {
  test('quem recusou vê a recusa e só pode aceitar', async () => {
    const tela = await montar('denied')
    expect(tela.container.textContent).toContain('Cookies de análise recusados')
    expect(tela.botoes()).toEqual(['Aceitar'])

    tela.clicar('Aceitar')
    expect(tela.escolhas).toEqual(['granted'])
  })

  test('quem aceitou vê o aceite e só pode recusar', async () => {
    const tela = await montar('granted')
    expect(tela.container.textContent).toContain('Cookies de análise aceitos')
    expect(tela.botoes()).toEqual(['Recusar'])

    tela.clicar('Recusar')
    expect(tela.escolhas).toEqual(['denied'])
  })

  test('sem escolha, as duas opções aparecem com a recusa primeiro', async () => {
    const tela = await montar('unset')
    expect(tela.container.textContent).toContain(
      'Cookies de análise sem escolha'
    )
    expect(tela.botoes()).toEqual(['Recusar', 'Aceitar'])
  })

  test('aponta para a seção de cookies da política', async () => {
    const tela = await montar('denied')
    expect(
      tela.container.querySelector('a[href="/privacidade#s-8"]')?.textContent
    ).toBe('Política de Privacidade')
  })
})
