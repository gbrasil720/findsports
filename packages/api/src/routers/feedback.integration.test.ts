import { afterEach, expect, spyOn, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { rateLimit } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import { FEEDBACK_LIMIT, FEEDBACK_TO, feedbackLimitKey } from './feedback'
import {
  contextFor,
  inAMonth,
  load,
  refusal,
  seedBar
} from './integration-seed'

/**
 * `feedback.send` contra o banco de verdade (o limite por usuário mora na
 * tabela `rate_limit`) e até a requisição que a Resend receberia. Nenhum
 * e-mail sai: o `fetch` para a Resend é dublê.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const message = 'O mapa não carregou no meu celular.'
const pageUrl = 'https://www.onside.sh/dashboard'

type ResendBody = {
  to: string[]
  reply_to: string
  subject: string
  text: string
  attachments?: { filename: string; content_type: string; content: string }[]
}

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

/**
 * A API de e-mail como dublê: guarda o corpo de cada envio. As chaves somem do
 * `.env.test` de propósito, então entram aqui e saem no fim do teste.
 */
function fakeResend(status = 200) {
  const real = globalThis.fetch
  const sent: ResendBody[] = []
  const keys = env as { EMAIL_API_KEY?: string; EMAIL_FROM?: string }
  keys.EMAIL_API_KEY = 're_teste'
  keys.EMAIL_FROM = 'nao-responda@mail.onside.sh'
  const spy = spyOn(globalThis, 'fetch').mockImplementation(((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url !== `${env.EMAIL_API_URL}/emails`) return real(input, init)
    sent.push(JSON.parse(String(init?.body)))
    return Promise.resolve(new Response('{}', { status }))
  }) as typeof fetch)
  cleanups.push(() => {
    spy.mockRestore()
    keys.EMAIL_API_KEY = undefined
    keys.EMAIL_FROM = undefined
  })
  return sent
}

/** Torcedor só de sessão: `feedback.send` não lê a linha do usuário. */
async function fanCaller() {
  const { db, appRouter } = await load()
  const id = crypto.randomUUID()
  cleanups.push(() =>
    db.delete(rateLimit).where(eq(rateLimit.key, feedbackLimitKey(id)))
  )
  return {
    db,
    id,
    email: `${id}@integration.invalid`,
    fan: appRouter.createCaller(contextFor(id, 'fan'))
  }
}

async function attemptsOf(
  db: Awaited<ReturnType<typeof load>>['db'],
  userId: string
) {
  const [row] = await db
    .select({ count: rateLimit.count })
    .from(rateLimit)
    .where(eq(rateLimit.key, feedbackLimitKey(userId)))
  return row?.count
}

function image(head: number[]): string {
  const bytes = Buffer.alloc(64)
  bytes.set(head)
  return bytes.toString('base64')
}
const PNG = image([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = image([0xff, 0xd8, 0xff, 0xe0])
const WEBP = image([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])

integrationTest(
  'torcedor: um e-mail para a caixa da Onside, com Reply-To de quem escreveu',
  async () => {
    const sent = fakeResend()
    const { fan, email } = await fanCaller()

    await fan.feedback.send({
      message: `  ${message}  `,
      pageUrl,
      // O destinatário não vem do cliente: campo a mais é descartado.
      ...({ to: 'outro@example.com' } as object)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: [FEEDBACK_TO],
      reply_to: email,
      subject: `Feedback de torcedor: ${message}`
    })
    expect(FEEDBACK_TO).toBe('contato@onside.sh')
    expect(sent[0]?.text).toStartWith(`${message}\n\n--\nNome: Conta fan\n`)
    expect(sent[0]?.text).toContain(`\nPágina: ${pageUrl}\n`)
    expect(sent[0]?.attachments).toBeUndefined()
  }
)

integrationTest('bar: o assunto e o corpo levam o nome do bar', async () => {
  const sent = fakeResend()
  const seeded = await seedBar('pro', 'active', inAMonth())
  cleanups.push(seeded.cleanup)

  await seeded.owner.feedback.send({ message, pageUrl })

  expect(sent[0]?.subject).toBe(
    `Feedback de bar (Bar de integração): ${message}`
  )
  expect(sent[0]?.text).toContain('\nPapel: bar\nBar: Bar de integração\n')
})

integrationTest('uma imagem vai como anexo do mesmo e-mail', async () => {
  const sent = fakeResend()
  const { fan } = await fanCaller()

  await fan.feedback.send({ message, pageUrl, images: [PNG] })

  expect(sent).toHaveLength(1)
  expect(sent[0]?.attachments).toEqual([
    { filename: 'imagem-1.png', content_type: 'image/png', content: PNG }
  ])
  expect(sent[0]?.text).toEndWith('\nImagens anexadas: 1')
})

integrationTest('três imagens vão como três anexos, na ordem', async () => {
  const sent = fakeResend()
  const { fan } = await fanCaller()

  await fan.feedback.send({ message, pageUrl, images: [JPEG, PNG, WEBP] })

  expect(sent[0]?.attachments).toEqual([
    { filename: 'imagem-1.jpg', content_type: 'image/jpeg', content: JPEG },
    { filename: 'imagem-2.png', content_type: 'image/png', content: PNG },
    { filename: 'imagem-3.webp', content_type: 'image/webp', content: WEBP }
  ])
})

integrationTest(
  'limite por usuário: o sexto envio da hora é recusado e não vira e-mail',
  async () => {
    const sent = fakeResend()
    const { fan } = await fanCaller()
    const other = await fanCaller()

    for (let i = 0; i < FEEDBACK_LIMIT.max; i++) {
      await fan.feedback.send({ message, pageUrl })
    }
    const { code, message: reason } = await refusal(
      fan.feedback.send({ message, pageUrl })
    )

    expect(code).toBe('TOO_MANY_REQUESTS')
    expect(reason).toBe(
      'Você já mandou 5 mensagens na última hora. Tente de novo mais tarde.'
    )
    expect(sent).toHaveLength(FEEDBACK_LIMIT.max)
    // O limite é de cada conta: outra pessoa envia normalmente.
    await other.fan.feedback.send({ message, pageUrl })
    expect(sent).toHaveLength(FEEDBACK_LIMIT.max + 1)
  }
)

integrationTest(
  'imagem recusada e envio que falhou não gastam o limite',
  async () => {
    const { fan, db, id } = await fanCaller()
    const error = spyOn(console, 'error').mockImplementation(() => {})
    cleanups.push(() => error.mockRestore())

    await refusal(
      fan.feedback.send({
        message,
        pageUrl,
        images: [Buffer.from('não é imagem').toString('base64')]
      })
    )
    expect(await attemptsOf(db, id)).toBeUndefined()

    fakeResend(500)
    const { code, message: reason } = await refusal(
      fan.feedback.send({ message, pageUrl })
    )
    expect(code).toBe('INTERNAL_SERVER_ERROR')
    expect(reason).toBe(
      'Não conseguimos enviar agora. Tente de novo em instantes.'
    )
    expect(await attemptsOf(db, id)).toBe(0)
  }
)
