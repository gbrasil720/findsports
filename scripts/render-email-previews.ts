/**
 * Gera os e-mails transacionais com dados de exemplo, em HTML e texto puro,
 * para abrir no navegador ou colar num teste de entregabilidade.
 *
 *   bun scripts/render-email-previews.ts [pasta]   # padrão: ../email-previews
 *
 * Os dois e-mails da waitlist não existem mais no produto: a lista de espera
 * saiu no WEB-232 (packages/api/src/lib/waitlist-email.ts, removido em
 * f8fc8fd). A copy deles fica aqui, no layout atual, só para a prévia.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from 'dotenv'

// `verification-email` valida o env do servidor ao ser importado. Nada é
// enviado aqui, então basta o env falso dos testes (como o test-env.preload).
config({ path: resolve(import.meta.dir, '../.env.test'), quiet: true })
const { createOnsideEmailTemplate } = await import(
  '../packages/auth/src/email-layout'
)
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
  }),
  'waitlist-confirm': {
    subject: 'Confirme sua entrada na waitlist da Onside',
    ...createOnsideEmailTemplate({
      heading: 'Confirme sua entrada',
      intro:
        'Recebemos seus dados. Confirme que este endereço é seu para ativar sua inscrição na waitlist da Onside.',
      steps: [
        'Sua inscrição só fica ativa depois desta confirmação.',
        'Se você já estava na lista, seus dados são atualizados sem criar outra inscrição.',
        'Quando seu acesso for liberado, o convite chega neste mesmo e-mail.'
      ],
      action: 'Confirmar meu e-mail',
      actionUrl: `${BASE_URL}/confirm-waitlist?token=exemplo`,
      note: 'Se você não pediu para entrar na waitlist da Onside, ignore esta mensagem.',
      reason:
        'Você recebeu este e-mail porque este endereço foi inscrito na waitlist da Onside.'
    })
  },
  'waitlist-joined': {
    subject: 'Você está na waitlist da Onside',
    ...createOnsideEmailTemplate({
      heading: 'Você está na lista',
      intro:
        'Pronto: seu e-mail foi confirmado e sua inscrição está ativa. Não é preciso preencher outro cadastro.',
      steps: [
        'Os acessos são liberados aos poucos durante o beta fechado.',
        'Quando chegar sua vez, enviamos um convite de uso único para este e-mail.',
        'O convite mostra o prazo para ativar sua conta.'
      ],
      action: 'Sair da waitlist',
      actionTone: 'secondary',
      actionUrl: `${BASE_URL}/leave-waitlist?token=exemplo`,
      note: 'Quer continuar na lista? Não precisa fazer nada. Use o link acima só se quiser cancelar sua inscrição.',
      reason:
        'Você recebeu este e-mail porque confirmou sua inscrição na waitlist da Onside.'
    })
  }
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
