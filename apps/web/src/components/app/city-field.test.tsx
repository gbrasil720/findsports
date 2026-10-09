import { afterEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarMunicipios } from '@/components/internal/controle-cidades'

import {
  CityField,
  type CityFieldValue,
  cityFieldValue,
  isCityPending
} from './city-field'

/**
 * WEB-319. A busca sem acento é `filtrarMunicipios`, já coberta em
 * `controle-cidades.test.ts`; aqui fica o que é deste campo.
 */
const CAMPINAS = { name: 'Campinas', uf: 'SP' }

function renderizar(value: CityFieldValue) {
  const markup = renderToStaticMarkup(
    <CityField
      label="Sua cidade"
      hint="Opcional."
      value={value}
      onChange={() => {}}
    />
  )
  const documento = new JSDOM(markup).window.document
  const campo = documento.querySelector('input[role="combobox"]')
  if (!campo) throw new Error('sem combobox')
  const dica = documento.getElementById(
    campo.getAttribute('aria-describedby') ?? ''
  )
  return { documento, campo, dica }
}

describe('CityField', () => {
  test('texto digitado sem escolher na lista não é cidade', () => {
    expect(isCityPending({ text: 'Campinas', city: null })).toBe(true)
    expect(isCityPending({ text: '   ', city: null })).toBe(false)
    expect(isCityPending(cityFieldValue(CAMPINAS))).toBe(false)
    expect(isCityPending(cityFieldValue(null))).toBe(false)
  })

  test('cidade escolhida aparece com a UF, que distingue homônimo', () => {
    expect(
      renderizar(cityFieldValue(CAMPINAS)).campo.getAttribute('value')
    ).toBe('Campinas, SP')
  })

  test('é um combobox com rótulo e dica ligados ao campo', () => {
    const { documento, campo, dica } = renderizar(cityFieldValue(null))
    expect(
      documento.querySelector(`label[for="${campo.id}"]`)?.textContent
    ).toBe('Sua cidade')
    expect(campo.getAttribute('aria-expanded')).toBe('false')
    expect(campo.getAttribute('aria-autocomplete')).toBe('list')
    expect(dica?.textContent).toBe('Opcional.')
  })

  test('a dica vira o aviso de que falta escolher na lista', () => {
    const { dica } = renderizar({ text: 'Campinas', city: null })
    expect(dica?.textContent).toBe('Escolha a cidade na lista.')
    expect(dica?.getAttribute('role')).toBe('status')
  })
})

describe('CityField com a lista real de municípios', () => {
  let dom: JSDOM | undefined
  let root: Root | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = undefined
    dom?.window.close()
  })

  async function montar() {
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
    Object.assign(dom.window.HTMLInputElement.prototype, {
      attachEvent() {},
      detachEvent() {}
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    let atual: CityFieldValue = cityFieldValue(null)
    function Tela() {
      const [value, setValue] = useState(atual)
      atual = value
      return (
        <CityField
          label="Sua cidade"
          hint="Opcional."
          value={value}
          onChange={setValue}
        />
      )
    }
    act(() => root?.render(<Tela />))

    const campo = () => document.querySelector('input') as HTMLInputElement
    // O foco dispara o carregamento da lista; esperar por ele aqui deixa o
    // resto do teste síncrono.
    await act(async () => {
      campo().focus()
      await carregarMunicipios()
    })
    const digitar = (texto: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set?.call(campo(), texto)
        campo().dispatchEvent(new window.Event('input', { bubbles: true }))
        campo().dispatchEvent(new window.Event('keyup', { bubbles: true }))
      })
    const teclar = (key: string) =>
      act(() => {
        campo().dispatchEvent(
          new window.KeyboardEvent('keydown', { key, bubbles: true })
        )
      })
    const opcoes = () =>
      Array.from(document.querySelectorAll('[role="option"]'))
    return { campo, digitar, teclar, opcoes, valor: () => atual }
  }

  test('acha sem acento, mostra poucas opções e escolhe pelo teclado', async () => {
    const { campo, digitar, teclar, opcoes, valor } = await montar()

    digitar('sao paulo')
    // Milhares de municípios na lista, um punhado na tela.
    expect(opcoes().length).toBeGreaterThan(1)
    expect(opcoes().length).toBeLessThanOrEqual(8)
    expect(opcoes()[0]?.textContent).toBe('São PauloSP')
    expect(campo().getAttribute('aria-expanded')).toBe('true')
    expect(campo().getAttribute('aria-activedescendant')).toBe(opcoes()[0]?.id)
    expect(valor().city).toBeNull()

    teclar('ArrowDown')
    expect(campo().getAttribute('aria-activedescendant')).toBe(opcoes()[1]?.id)
    teclar('ArrowUp')
    teclar('Enter')

    expect(valor()).toEqual({
      text: 'São Paulo, SP',
      city: { name: 'São Paulo', uf: 'SP' }
    })
    expect(opcoes()).toHaveLength(0)
    expect(campo().getAttribute('aria-expanded')).toBe('false')
  })

  test('nome que não existe avisa em vez de ficar mudo', async () => {
    const { digitar, opcoes } = await montar()
    digitar('gotham')
    expect(opcoes()).toHaveLength(0)
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'Nenhuma cidade com esse nome.'
    )
  })
})
