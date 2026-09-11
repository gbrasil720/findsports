import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

import {
  chaveDeDispensa,
  ehIOS,
  estaInstalado,
  foiDispensado,
  marcarDispensado
} from './pwa'

const janelaOriginal = globalThis.window

/**
 * Troca `globalThis.window` por `defineProperty`, e não por atribuição.
 *
 * Outros arquivos de teste — `product-frame.test.tsx`, `posthog-flag.test.tsx`
 * — instalam o `window` do JSDOM com `Object.defineProperty(globalThis,
 * 'window', { value, configurable: true })`. Sem `writable`, a propriedade
 * nasce somente-leitura, e uma atribuição simples depois disso lança
 * `TypeError: Attempted to assign to readonly property` em módulo ESM.
 *
 * Como a ordem dos arquivos varia entre máquinas, atribuir direto passava
 * localmente e quebrava na CI — e quebrava o arquivo inteiro, porque o erro
 * acontecia no `afterEach`. `defineProperty` funciona nos dois casos, já que
 * a propriedade continua `configurable`.
 */
function definirJanela(valor: unknown) {
  Object.defineProperty(globalThis, 'window', {
    value: valor,
    configurable: true,
    writable: true
  })
}

afterEach(() => {
  definirJanela(janelaOriginal)
})

function fingirJanela(parcial: Record<string, unknown>) {
  definirJanela(parcial)
}

describe('ehIOS', () => {
  test('reconhece iPhone e iPad antigos', () => {
    expect(ehIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 5)).toBe(true)
    expect(ehIOS('Mozilla/5.0 (iPad; CPU OS 16_0)', 5)).toBe(true)
  })

  /**
   * O iPadOS moderno se anuncia como Macintosh. Sem o teste de toque, todo
   * iPad receberia o cartão do Android — que tem um botão que nunca dispara,
   * porque `beforeinstallprompt` não existe no Safari.
   */
  test('reconhece iPad moderno, que se anuncia como Macintosh', () => {
    expect(ehIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(
      true
    )
  })

  test('não confunde Mac de verdade com iPad', () => {
    expect(ehIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(
      false
    )
  })

  test('Android não é iOS', () => {
    expect(ehIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false)
  })
})

describe('estaInstalado', () => {
  test('display-mode standalone conta como instalado', () => {
    fingirJanela({
      matchMedia: (consulta: string) => ({
        matches: consulta === '(display-mode: standalone)'
      }),
      navigator: {}
    })
    expect(estaInstalado()).toBe(true)
  })

  /** O iOS não implementa `display-mode` no matchMedia. */
  test('navigator.standalone cobre o iOS', () => {
    fingirJanela({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true }
    })
    expect(estaInstalado()).toBe(true)
  })

  test('aba comum de navegador não conta como instalado', () => {
    fingirJanela({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false }
    })
    expect(estaInstalado()).toBe(false)
  })
})

describe('memória de dispensa', () => {
  function fingirLocalStorage(inicial: Record<string, string> = {}) {
    const dados = { ...inicial }
    fingirJanela({
      localStorage: {
        getItem: (chave: string) => dados[chave] ?? null,
        setItem: (chave: string, valor: string) => {
          dados[chave] = valor
        }
      }
    })
    return dados
  }

  test('a chave é por usuário, não global', () => {
    expect(chaveDeDispensa('u1')).not.toBe(chaveDeDispensa('u2'))
  })

  test('dispensar de um usuário não dispensa do outro', () => {
    fingirLocalStorage()
    marcarDispensado('u1')
    expect(foiDispensado('u1')).toBe(true)
    expect(foiDispensado('u2')).toBe(false)
  })

  /**
   * Safari em navegação privada lança ao tocar em `localStorage`. Um convite a
   * mais é melhor que uma tela quebrada.
   */
  test('armazenamento indisponível não derruba a tela', () => {
    fingirJanela({
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado')
        },
        setItem: () => {
          throw new Error('bloqueado')
        }
      }
    })
    expect(() => marcarDispensado('u1')).not.toThrow()
    expect(foiDispensado('u1')).toBe(false)
  })
})

/**
 * O recorte é a decisão central do WEB-72: o app instalável é o produto
 * logado, não o site. Quem declara o manifest é quem oferece instalação, então
 * o conjunto de rotas que o declaram *é* o recorte — e ele precisa falhar aqui
 * se alguém mover a declaração para o `__root.tsx` ou ligá-la em `/internal`.
 */
describe('recorte do manifest', () => {
  const rotas = path.join(import.meta.dir, '..', 'routes')

  function arquivosDeRota(pasta: string): string[] {
    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
      const caminho = path.join(pasta, entrada.name)
      if (entrada.isDirectory()) return arquivosDeRota(caminho)
      return entrada.name.endsWith('.tsx') ? [caminho] : []
    })
  }

  test('só as rotas do produto logado declaram o manifest', () => {
    const declaram = arquivosDeRota(rotas)
      .filter((arquivo) =>
        fs.readFileSync(arquivo, 'utf8').includes('PWA_LINKS')
      )
      .map((arquivo) => path.relative(rotas, arquivo))
      .sort()

    expect(declaram).toEqual([
      '(dashboard)/dashboard.tsx',
      '(dashboard)/dashboard_.profile.tsx',
      'admin.tsx',
      'admin_.billing.tsx',
      'plan.tsx',
      'plan_.confirmed.tsx'
    ])
  })

  test('a landing e o painel interno não oferecem instalação', () => {
    for (const arquivo of ['__root.tsx', 'index.tsx', 'internal.tsx']) {
      const conteudo = fs.readFileSync(path.join(rotas, arquivo), 'utf8')
      expect(conteudo).not.toContain('PWA_LINKS')
      expect(conteudo).not.toContain('manifest')
    }
  })
})
