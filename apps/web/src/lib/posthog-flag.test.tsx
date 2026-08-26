import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * O que estes testes travam é o comportamento na dúvida.
 *
 * Uma flag de rollout que não respondeu — sem chave, em desenvolvimento, com
 * bloqueador de anúncio, ou simplesmente antes de a rede voltar — não pode
 * ligar caminho novo sozinha. O padrão de quem chamou tem de valer em todos
 * esses casos, e o valor só pode mudar quando o PostHog avisar.
 */

type Ouvinte = () => void

const posthogFalso = {
  __loaded: false,
  flags: new Map<string, boolean | string>(),
  ouvintes: new Set<Ouvinte>(),

  isFeatureEnabled(nome: string) {
    const valor = this.flags.get(nome)
    return typeof valor === 'boolean' ? valor : undefined
  },
  getFeatureFlag(nome: string) {
    return this.flags.get(nome)
  },
  onFeatureFlags(callback: Ouvinte) {
    this.ouvintes.add(callback)
    return () => this.ouvintes.delete(callback)
  },
  /** Simula a chegada das flags pela rede. */
  emitir() {
    for (const ouvinte of this.ouvintes) ouvinte()
  },
  limpar() {
    this.__loaded = false
    this.flags.clear()
    this.ouvintes.clear()
  }
}

mock.module('posthog-js', () => ({ default: posthogFalso }))

let dom: JSDOM
const montados: Root[] = []

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://onside.test/'
  })
  for (const chave of ['window', 'document', 'navigator'] as const) {
    Object.defineProperty(globalThis, chave, {
      value: dom.window[chave],
      configurable: true
    })
  }
  // O `act` do React exige esta marca para não avisar sobre atualização fora
  // de `act` a cada render.
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  posthogFalso.limpar()
})

afterEach(() => {
  for (const root of montados.splice(0)) act(() => root.unmount())
  dom.window.close()
})

/**
 * `renderHook` mínimo. O `@testing-library/react` registra `beforeAll` na
 * carga do módulo, o que o `bun:test` recusa quando o módulo é importado
 * dentro de um teste — e importar no topo aconteceria antes de o JSDOM
 * existir. Vinte linhas resolvem sem a dependência.
 */
function renderHook<T>(hook: () => T) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  montados.push(root)

  const result = { current: undefined as T }
  function Sonda() {
    result.current = hook()
    return null
  }

  act(() => root.render(<Sonda />))

  return {
    result,
    unmount: () => act(() => root.unmount())
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function montarFlag(nome: string, padrao: boolean) {
  const { usePostHogFlag } = await import('./posthog-flag')
  const hook = renderHook(() => usePostHogFlag(nome, padrao))
  await flush()
  return hook
}

describe('flag do PostHog no cliente', () => {
  test('PostHog não carregado: vale o padrão', async () => {
    const ligado = await montarFlag('map.advanced_markers', true)
    expect(ligado.result.current).toBe(true)

    const desligado = await montarFlag('map.advanced_markers', false)
    expect(desligado.result.current).toBe(false)
  })

  test('carregado e ligada: devolve o valor da flag', async () => {
    posthogFalso.__loaded = true
    posthogFalso.flags.set('map.advanced_markers', true)

    const { result } = await montarFlag('map.advanced_markers', false)
    expect(result.current).toBe(true)
  })

  /**
   * Flag que o PostHog não conhece devolve `undefined`, não `false`. Tratar
   * as duas como a mesma coisa faria uma flag apagada por engano desligar o
   * caminho em produção em vez de manter o padrão.
   */
  test('flag desconhecida cai no padrão, não em falso', async () => {
    posthogFalso.__loaded = true

    const { result } = await montarFlag('flag.que.nao.existe', true)
    expect(result.current).toBe(true)
  })

  test('valor novo chega quando o PostHog avisa', async () => {
    posthogFalso.__loaded = true
    posthogFalso.flags.set('map.advanced_markers', false)

    const { result } = await montarFlag('map.advanced_markers', false)
    expect(result.current).toBe(false)

    act(() => {
      posthogFalso.flags.set('map.advanced_markers', true)
      posthogFalso.emitir()
    })
    expect(result.current).toBe(true)
  })

  test('desmontar cancela a assinatura', async () => {
    posthogFalso.__loaded = true
    const { unmount } = await montarFlag('map.advanced_markers', false)

    expect(posthogFalso.ouvintes.size).toBe(1)
    unmount()
    expect(posthogFalso.ouvintes.size).toBe(0)
  })
})

describe('variante do PostHog no cliente', () => {
  test('devolve o nome da variante', async () => {
    const { usePostHogVariant } = await import('./posthog-flag')
    posthogFalso.__loaded = true
    posthogFalso.flags.set('landing.hero', 'agressivo')

    const { result } = renderHook(() =>
      usePostHogVariant('landing.hero', 'controle')
    )
    await flush()
    expect(result.current).toBe('agressivo')
  })

  /**
   * Flag booleana pedida como variante devolve `true`, que não é nome de
   * variante nenhum. Quem pediu variante espera um nome — devolver `true`
   * aqui viraria uma renderização com string `"true"` numa tela.
   */
  test('flag booleana pedida como variante cai no padrão', async () => {
    const { usePostHogVariant } = await import('./posthog-flag')
    posthogFalso.__loaded = true
    posthogFalso.flags.set('landing.hero', true)

    const { result } = renderHook(() =>
      usePostHogVariant('landing.hero', 'controle')
    )
    await flush()
    expect(result.current).toBe('controle')
  })
})
