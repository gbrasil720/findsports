import { expect, test } from 'bun:test'
import { waitlistEntries } from '@findsports_oficial/db/schema/waitlist'
import { inArray } from 'drizzle-orm'

/**
 * A decisão do portão é pura e está travada em `waitlist-gate.test.ts`. O que
 * falta é a consulta que a alimenta — e ela é onde um erro custa caro nos dois
 * sentidos: dizer "aprovado" para quem não é abre a porta; negar quem foi
 * aprovado quebra o convite. Login e papel não fazem parte desta consulta.
 */
function isClearlyDisposableDatabase(url: string | undefined): boolean {
  if (!url || process.env.RUN_DISPOSABLE_DB_TESTS !== '1') return false
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) &&
      /(test|testing|tmp|temp|disposable|ci)/i.test(database)
    )
  } catch {
    return false
  }
}

const integrationTest = isClearlyDisposableDatabase(process.env.DATABASE_URL)
  ? test
  : test.skip

integrationTest(
  'a consulta do portão distingue aprovado, pendente e desconhecido',
  async () => {
    const [{ db }, { consultarEntrada }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./waitlist-gate')
    ])

    const sufixo = crypto.randomUUID()
    const aprovado = `aprovado-${sufixo}@integration.invalid`
    const pendente = `pendente-${sufixo}@integration.invalid`
    const adminEmail = `admin-${sufixo}@integration.invalid`
    const approverId = crypto.randomUUID()

    await db.insert(waitlistEntries).values([
      {
        email: aprovado,
        role: 'fan',
        city: 'Teste',
        approvedAt: new Date(),
        approvedBy: approverId
      },
      // Mesma pessoa, segunda inscrição, esta pendente. A aprovação é do
      // e-mail: uma linha liberada basta.
      { email: aprovado, role: 'pub', city: 'Outra', pubName: 'Bar' },
      { email: pendente, role: 'fan', city: 'Teste' },
      { email: adminEmail, role: 'fan', city: 'Teste' }
    ])

    try {
      const liberado = await consultarEntrada(aprovado)
      expect(liberado.aprovado).toBe(true)

      // Estar na lista não é estar aprovado — é o que impede alguém de se
      // liberar preenchendo o formulário público.
      const naoLiberado = await consultarEntrada(pendente)
      expect(naoLiberado.aprovado).toBe(false)

      // E-mail que não existe em lugar nenhum não pode virar `true` por
      // acidente de COALESCE.
      const desconhecido = await consultarEntrada(
        `ninguem-${sufixo}@integration.invalid`
      )
      expect(desconhecido).toEqual({ aprovado: false })
    } finally {
      await db
        .delete(waitlistEntries)
        .where(inArray(waitlistEntries.email, [aprovado, pendente, adminEmail]))
    }
  }
)
