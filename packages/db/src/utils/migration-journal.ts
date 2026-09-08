import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Leitura e reconciliação do journal de migrations do Drizzle.
 *
 * O `drizzle-kit migrate` decide o que aplicar por **uma** comparação: ele lê
 * o maior `created_at` de `drizzle.__drizzle_migrations` e aplica todo arquivo
 * do journal cujo `when` seja maior que ele. Não há verificação por hash, nem
 * por nome de arquivo.
 *
 * Isso é o que torna um banco construído por `db:push` intratável: o `push`
 * cria os objetos e não escreve linha nenhuma no journal, então o `migrate`
 * seguinte tenta aplicar migrations cujos objetos já existem e estoura no
 * primeiro `CREATE`/`ALTER` repetido. A saída não é aplicar o SQL de novo — é
 * registrar como aplicado o que de fato já está no banco, e deixar o
 * `migrate` seguir dali.
 *
 * Estas funções são puras de propósito: quem fala com o Postgres é
 * `scripts/reconcile-journal.ts`. Assim a parte que decide o que registrar é
 * testável sem banco.
 */

export interface EntradaJornal {
  idx: number
  tag: string
  /** `when` do journal. É ele que vira `created_at` na tabela. */
  quando: number
  /** sha256 do conteúdo do arquivo, como o `drizzle-orm` calcula. */
  hash: string
}

export interface LinhaRegistrada {
  hash: string
  created_at: number
}

interface JournalBruto {
  entries?: { idx: number; tag: string; when: number }[]
}

/**
 * Mesmo cálculo do `readMigrationFiles` do `drizzle-orm`: sha256 do conteúdo
 * inteiro do arquivo, antes de qualquer divisão por `--> statement-breakpoint`.
 * Replicar aqui é o preço de não poder importar uma função interna do driver;
 * o teste desta função existe para o dia em que o driver mudar isso.
 */
export function calcularHash(sqlDaMigration: string): string {
  return crypto.createHash('sha256').update(sqlDaMigration).digest('hex')
}

export function lerJornal(pastaMigrations: string): EntradaJornal[] {
  const caminhoJornal = path.join(pastaMigrations, 'meta', '_journal.json')
  if (!fs.existsSync(caminhoJornal)) {
    throw new Error(`Journal não encontrado em ${caminhoJornal}`)
  }

  const journal = JSON.parse(
    fs.readFileSync(caminhoJornal, 'utf8')
  ) as JournalBruto
  const entradas = journal.entries ?? []

  return entradas.map((entrada) => {
    const caminhoSql = path.join(pastaMigrations, `${entrada.tag}.sql`)
    if (!fs.existsSync(caminhoSql)) {
      throw new Error(
        `Journal cita ${entrada.tag}, mas ${caminhoSql} não existe.`
      )
    }
    return {
      idx: entrada.idx,
      tag: entrada.tag,
      quando: entrada.when,
      hash: calcularHash(fs.readFileSync(caminhoSql, 'utf8'))
    }
  })
}

export interface Plano {
  /** Entradas que serão inseridas na tabela, em ordem de `quando`. */
  inserir: EntradaJornal[]
  /** Entradas cujo hash já está registrado — nada a fazer. */
  jaRegistradas: EntradaJornal[]
  /**
   * Linhas na tabela que não correspondem a nenhum arquivo do journal.
   *
   * Aparecem quando alguém insere à mão, ou quando uma migration é reescrita
   * depois de aplicada. Não são removidas: apagar registro de migration é
   * perda de informação, e o certo é alguém olhar.
   */
  desconhecidas: LinhaRegistrada[]
  /**
   * O que o `drizzle-kit migrate` vai aplicar depois desta reconciliação —
   * tudo com `when` acima do maior `created_at` resultante.
   */
  migrateAplicaria: EntradaJornal[]
}

/**
 * Monta o plano sem tocar no banco.
 *
 * `ate` é o corte explícito: a última migration que o banco realmente tem.
 * Não existe modo "descubra sozinho" porque não há como descobrir com
 * segurança — duas migrations podem criar objetos parecidos, e marcar como
 * aplicada uma que não está faz o `migrate` pular SQL de verdade. Errar para o
 * lado de exigir a informação é mais barato que errar para o lado de mentir.
 */
export function planejarReconciliacao({
  entradas,
  registradas,
  ate
}: {
  entradas: EntradaJornal[]
  registradas: LinhaRegistrada[]
  ate: string | null
}): Plano {
  const hashesRegistrados = new Set(registradas.map((linha) => linha.hash))
  const hashesDoJornal = new Set(entradas.map((entrada) => entrada.hash))

  let alvo = entradas
  if (ate !== null) {
    const corte = entradas.findIndex((entrada) => entrada.tag === ate)
    if (corte === -1) {
      throw new Error(
        `Migration "${ate}" não está no journal. Use a tag exata, como "0028_event_ends_at_after_starts_at_check".`
      )
    }
    alvo = entradas.slice(0, corte + 1)
  }

  const inserir = alvo.filter((entrada) => !hashesRegistrados.has(entrada.hash))
  const jaRegistradas = alvo.filter((entrada) =>
    hashesRegistrados.has(entrada.hash)
  )

  const maiorCreatedAt = Math.max(
    0,
    ...registradas.map((linha) => linha.created_at),
    ...inserir.map((entrada) => entrada.quando)
  )

  return {
    inserir,
    jaRegistradas,
    desconhecidas: registradas.filter(
      (linha) => !hashesDoJornal.has(linha.hash)
    ),
    migrateAplicaria: entradas.filter(
      (entrada) => entrada.quando > maiorCreatedAt
    )
  }
}
