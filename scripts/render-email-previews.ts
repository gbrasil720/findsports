/**
 * Gera os e-mails transacionais com dados de exemplo, em HTML e texto puro,
 * para abrir no navegador ou colar num teste de entregabilidade.
 *
 *   bun scripts/render-email-previews.ts [pasta]   # padrão: ../email-previews
 *
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from 'dotenv'

// `verification-email` valida o env do servidor ao ser importado. Nada é
// enviado aqui, então basta o env falso dos testes (como o test-env.preload).
config({ path: resolve(import.meta.dir, '../.env.test'), quiet: true })
const { createResetPasswordEmail } = await import(
  '../packages/auth/src/reset-password-email'
)
const { createVerificationEmail } = await import(
  '../packages/auth/src/verification-email'
)

const BASE_URL = 'https://www.onside.sh'
const outDir = resolve(
  process.argv[2] ?? resolve(import.meta.dir, '../../email-previews')
)

const previews: Record<
  string,
  { subject: string; html: string; text: string }
> = {
  verification: createVerificationEmail({
    name: 'Ana',
    verificationUrl: `${BASE_URL}/api/auth/verify-email?token=exemplo&callbackURL=%2Fonboarding`
  }),
  'reset-password': createResetPasswordEmail({
    name: 'Ana',
    resetUrl: `${BASE_URL}/api/auth/reset-password/exemplo?callbackURL=%2Freset-password`
  })
}

await mkdir(outDir, { recursive: true })
for (const [name, email] of Object.entries(previews)) {
  await writeFile(resolve(outDir, `${name}.html`), email.html)
  await writeFile(
    resolve(outDir, `${name}.txt`),
    `Assunto: ${email.subject}\n\n${email.text}\n`
  )
  console.log(`${name}: ${email.subject}`)
}
console.log(`\nPrévias em ${outDir}`)
