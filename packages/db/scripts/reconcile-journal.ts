/**
 * Reconcilia `drizzle.__drizzle_migrations` com os arquivos de
 * `src/migrations`, sem executar o SQL das migrations.
 *
 * Existe porque um banco de desenvolvimento construído por `db:push` não tem
 * linha nenhuma no journal — `push` cria os objetos e não registra nada. O
 * `drizzle-kit migrate` seguinte tenta aplicar migrations cujos objetos já
 * existem e estoura no primeiro objeto repetido, então a única saída passava
 * a ser aplicar cada migration nova à mão. E a única forma de descobrir que
 * faltava uma era o 500 em runtime (WEB-70).
 *
 * Uso:
 *
 *   bun run db:journal                       # relatório, não escreve nada
 *   bun run db:journal -- --upto 0028_xxx    # registra até essa migration
 *   bun run db:journal -- --all              # registra o journal inteiro
 *   bun run db:journal -- --all --dry-run    # mostra o que faria
 *
 * `--upto` é o modo honesto e o recomendado: passe a última migration que o
 * banco realmente tem, e deixe o `drizzle-kit migrate` aplicar o resto pelo
 * caminho normal. `--all` só vale quando o banco veio de `db:push` do schema
 * atual, ou seja: quando todo o journal já está refletido nele.
 *
 * Não é interativo, não pergunta nada e é idempotente — rodar duas vezes
 * insere o mesmo conjunto uma vez só.
 */

import path from 'node:path'
import { Pool } from 'pg'
import { resolveAndValidateDatabaseUrl } from '../src/utils/db-resolver'
import {
  type EntradaJornal,
  type LinhaRegistrada,
  lerJornal,
  planejarReconciliacao
} from '../src/utils/migration-journal'

const PASTA_MIGRATIONS = path.join(import.meta.dir, '..', 'src', 'migrations')

function lerArgumentos(argv: string[]) {
  const todas = argv.includes('--all')
  const simulacao = argv.includes('--dry-run')
  const indiceAte = argv.indexOf('--upto')
  const ate = indiceAte === -1 ? null : (argv[indiceAte + 1] ?? null)

  if (indiceAte !== -1 && !ate) {
    throw new Error('--upto exige a tag da migration.')
  }
  if (todas && ate) {
    throw new Error('Use --all ou --upto, não os dois.')
  }

  return { todas, ate, simulacao, escrever: todas || ate !== null }
}

function listar(titulo: string, entradas: EntradaJornal[]) {
  if (entradas.length === 0) return
  console.log(`\n${titulo} (${entradas.length}):`)
  for (const entrada of entradas) {
    console.log(`  ${String(entrada.idx).padStart(4)} ${entrada.tag}`)
  }
}

const { todas, ate, simulacao, escrever } = lerArgumentos(process.argv.slice(2))
const { url, summary } = resolveAndValidateDatabaseUrl()
const entradas = lerJornal(PASTA_MIGRATIONS)

const pool = new Pool({ connectionString: url })

try {
  console.log(`Banco: ${summary}`)
  console.log(`Journal: ${entradas.length} migrations em src/migrations`)

  // Mesmo DDL do `drizzle-orm`: um banco que nunca rodou `migrate` não tem
  // nem o schema, e o relatório precisa funcionar nesse caso também.
  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`
  )

  const { rows } = await pool.query<{ hash: string; created_at: string }>(
    'select hash, created_at from drizzle.__drizzle_migrations order by created_at'
  )
  const registradas: LinhaRegistrada[] = rows.map((linha) => ({
    hash: linha.hash,
    created_at: Number(linha.created_at)
  }))

  const plano = planejarReconciliacao({
    entradas,
    registradas,
    ate: todas ? null : ate
  })

  console.log(`Registradas no banco: ${registradas.length}`)

  if (plano.desconhecidas.length > 0) {
    console.log(
      `\nAtenção: ${plano.desconhecidas.length} linha(s) no banco não batem com nenhum arquivo do journal.`
    )
    console.log(
      'Isso acontece quando alguém insere à mão ou reescreve uma migration já aplicada.'
    )
    for (const linha of plano.desconhecidas) {
      console.log(
        `  ${linha.hash.slice(0, 12)}… created_at=${linha.created_at}`
      )
    }
  }

  if (!escrever) {
    listar('Já registradas', plano.jaRegistradas)
    listar('Faltando registrar', plano.inserir)
    listar('drizzle-kit migrate aplicaria agora', plano.migrateAplicaria)
    console.log(
      '\nRelatório apenas. Para registrar: --upto <tag> (recomendado) ou --all.'
    )
  } else {
    listar('Já registradas — nada a fazer', plano.jaRegistradas)
    listar(simulacao ? 'Registraria' : 'Registrando', plano.inserir)

    if (!simulacao && plano.inserir.length > 0) {
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        for (const entrada of plano.inserir) {
          await cliente.query(
            'insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)',
            [entrada.hash, entrada.quando]
          )
        }
        await cliente.query('COMMIT')
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    }

    listar('Depois disso, drizzle-kit migrate aplica', plano.migrateAplicaria)
    if (plano.migrateAplicaria.length === 0) {
      console.log('\nNada pendente: drizzle-kit migrate vira no-op.')
    } else {
      console.log('\nRode agora: bun run db:migrate')
    }
  }
} finally {
  await pool.end()
}
