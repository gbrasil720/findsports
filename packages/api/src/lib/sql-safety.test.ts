import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ESC-13: guarda contra a volta do SQL interpolado.
 *
 * A busca por proximidade montava `sql.raw(String(lat))`, o que colocava
 * valores vindos do cliente direto no texto da consulta. O Zod garantia que
 * eram números, então o risco de injeção era baixo — mas cada requisição
 * gerava um SQL textualmente diferente, e o Postgres replanejava tudo.
 *
 * O código está limpo hoje. Este teste existe para que continue: um
 * `sql.raw` novo quebra a suíte em vez de ser descoberto numa auditoria
 * daqui a um ano.
 *
 * Se algum dia um `sql.raw` for legítimo — nome de tabela vindo de constante
 * do próprio código, por exemplo —, a saída é marcar a linha com
 * `sql-raw-permitido` e explicar o porquê ali mesmo.
 */

const RAIZES = ['packages/api/src', 'packages/db/src', 'apps/web/src']
const ESCAPE = 'sql-raw-permitido'

function arquivosTs(dir: string): string[] {
  let encontrados: string[] = []
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return []
  }
  for (const entrada of entradas) {
    const caminho = join(dir, entrada)
    if (statSync(caminho).isDirectory()) {
      if (entrada === 'node_modules' || entrada === 'migrations') continue
      encontrados = encontrados.concat(arquivosTs(caminho))
    } else if (
      /\.tsx?$/.test(entrada) &&
      !caminho.endsWith('sql-safety.test.ts')
    ) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

function raizDoRepo(): string {
  // O teste roda a partir de packages/api; sobe até achar as raízes.
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    try {
      statSync(join(dir, 'packages/api/src'))
      return dir
    } catch {
      dir = join(dir, '..')
    }
  }
  throw new Error('raiz do repositório não encontrada')
}

/**
 * @param apenasArquivosComSql restringe a busca a arquivos que de fato montam
 * consultas. Sem isso, um template literal qualquer de formatação em React
 * casaria com padrões pensados para SQL.
 */
function ocorrencias(padrao: RegExp, apenasArquivosComSql = false): string[] {
  const raiz = raizDoRepo()
  const achados: string[] = []
  for (const relativa of RAIZES) {
    for (const arquivo of arquivosTs(join(raiz, relativa))) {
      const conteudo = readFileSync(arquivo, 'utf8')
      if (apenasArquivosComSql && !conteudo.includes('sql`')) continue
      conteudo.split('\n').forEach((linha, i) => {
        if (padrao.test(linha) && !linha.includes(ESCAPE)) {
          achados.push(`${arquivo.replace(raiz, '')}:${i + 1}: ${linha.trim()}`)
        }
      })
    }
  }
  return achados
}

describe('segurança do SQL (ESC-13)', () => {
  it('o scanner enxerga os arquivos de origem', () => {
    // Sem isto, um teste que não lê nada passaria por engano.
    const arquivos = arquivosTs(join(raizDoRepo(), 'packages/api/src'))
    expect(arquivos.length).toBeGreaterThan(5)
  })

  it('nenhum sql.raw no código', () => {
    expect(ocorrencias(/sql\s*\.\s*raw\s*\(/)).toEqual([])
  })

  it('nenhuma concatenação de string dentro de template SQL', () => {
    // Pega o padrão `${'…' + variavel}` dentro de uma consulta.
    expect(ocorrencias(/\$\{[^}]*['"`]\s*\+/, true)).toEqual([])
  })

  it('db.execute sempre recebe um template sql, nunca uma string', () => {
    expect(ocorrencias(/\.execute\(\s*['"`]/, true)).toEqual([])
  })
})
