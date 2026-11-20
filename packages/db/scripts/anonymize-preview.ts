/**
 * Anonimiza o banco do preview (relatório de vulnerabilidades de 20/11/2026).
 * O branch `preview` do Neon é cópia de produção: sem isto, o preview público
 * guardava e-mail, nome e hash de senha de gente de verdade, e senha que
 * acertasse lá valia em produção.
 *
 * Quem não é admin nem conta de teste perde o login (sessões, contas,
 * 2FA, push) e fica com nome e e-mail inventados, estáveis pelo id. Admins
 * seguem entrando (impersonar é o caminho do QA). Idempotente: o e-mail
 * anonimizado casa com TESTE e sai da próxima rodada. O deploy do preview roda
 * depois de migrar, então o "Reset from parent" se limpa no PR seguinte.
 *
 * `ANONYMIZE_TARGET=preview DATABASE_URL=<preview> bun run scripts/anonymize-preview.ts`
 */
import { Pool } from 'pg'

if (process.env.ANONYMIZE_TARGET !== 'preview') {
  console.error('Recusado: só roda com ANONYMIZE_TARGET=preview.')
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL ausente.')
  process.exit(1)
}

// Conta de teste criada no preview (QA, E2E) e a já anonimizada.
const TESTE = String.raw`(\+qa|@[a-z0-9.-]+\.test$|@onside\.local$|@preview\.onside\.invalid$)`

const ALVO = `select id from "user" where role <> 'admin' and email !~* '${TESTE}'`
const ANON = (col: string) =>
  `'anon-' || substr(md5(${col}), 1, 12) || '@preview.onside.invalid'`

const passos: [string, string][] = [
  ['session', `delete from session where user_id in (${ALVO})`],
  ['account', `delete from account where user_id in (${ALVO})`],
  ['two_factor', `delete from two_factor where user_id in (${ALVO})`],
  ['push_token', `delete from push_token where user_id in (${ALVO})`],
  // Tokens de verificação e reset, com o e-mail no identificador.
  ['verification', 'delete from verification'],
  [
    'bar',
    `update bar set invoice_email = null, legal_name = null, cnpj = null
     where user_id in (${ALVO})`
  ],
  [
    'app_waitlist',
    `update app_waitlist set email = ${ANON('id')}
     where email !~* '${TESTE}'`
  ],
  // O Grimório (`admin_action`) fica: o trigger só aceita INSERT, e quem o
  // lê é admin com 2FA.
  // Por último: o e-mail novo tira a linha do ALVO.
  [
    'user',
    `update "user" set
       name = 'Pessoa ' || substr(md5(id), 1, 6),
       email = ${ANON('id')},
       image = null,
       stripe_customer_id = null,
       two_factor_enabled = false,
       username = case when username is null then null
                       else 'p' || substr(md5(id), 1, 10) end
     where id in (${ALVO})`
  ]
]

const pool = new Pool({ connectionString: url, max: 1 })
const client = await pool.connect()
try {
  await client.query('begin')
  for (const [tabela, sql] of passos) {
    const { rowCount } = await client.query(sql)
    console.log(`${tabela}: ${rowCount ?? 0}`)
  }
  await client.query('commit')
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
