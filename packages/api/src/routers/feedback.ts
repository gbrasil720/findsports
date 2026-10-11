import {
  type EmailAttachment,
  escapeHtml,
  sendEmailWithResend
} from '@findsports_oficial/auth/verification-email'
import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import { PHOTO_MAX_BYTES } from '../lib/blob-photo'
import {
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH
} from '../lib/feedback'
import {
  incrementWindow,
  type JanelaLimite,
  refundWindowAttempt
} from '../lib/rate-limit-store'

/**
 * Feedback de dentro do app: um e-mail para a caixa da Onside, com `Reply-To`
 * de quem escreveu. Não há tabela: o e-mail é o registro, imagens inclusive.
 */

/** Constante do servidor: o cliente não escolhe para onde o e-mail vai. */
export const FEEDBACK_TO = 'contato@onside.sh'

// ponytail: janela fixa por usuário na tabela `rate_limit`. Na virada da
// janela passam até 10 em sequência (5 no fim de uma, 5 no começo da outra);
// janela deslizante se isso virar abuso.
export const FEEDBACK_LIMIT: JanelaLimite = { max: 5, windowMs: 60 * 60_000 }

export function feedbackLimitKey(userId: string): string {
  return `feedback:user:${userId}`
}

type Role = 'fan' | 'pub' | 'admin'

const ROLE_LABEL: Record<Role, string> = {
  fan: 'torcedor',
  pub: 'bar',
  admin: 'admin'
}

/**
 * Texto de quem usa, reduzido a uma linha: sem quebra nem caractere de
 * controle (o assunto é cabeçalho do e-mail) e cortado em palavra inteira.
 */
function oneLine(value: string, max: number): string {
  const flat = Array.from(value.replace(/[\p{Cc}\s]+/gu, ' ').trim())
  if (flat.length <= max) return flat.join('')
  const cut = flat.slice(0, max).join('')
  return `${cut.replace(/\s+\S*$/, '') || cut}…`
}

export function createFeedbackEmail(input: {
  message: string
  name: string
  email: string
  role: Role
  barName: string | null
  pageUrl: string
  userAgent: string
  sentAt: Date
  imageCount: number
}): { subject: string; text: string; html: string } {
  const from =
    input.role === 'pub' && input.barName
      ? `bar (${oneLine(input.barName, 60)})`
      : ROLE_LABEL[input.role]
  const text = [
    input.message,
    '',
    '--',
    `Nome: ${oneLine(input.name, 120)}`,
    `E-mail: ${oneLine(input.email, 320)}`,
    `Papel: ${ROLE_LABEL[input.role]}`,
    ...(input.barName ? [`Bar: ${oneLine(input.barName, 120)}`] : []),
    `Página: ${oneLine(input.pageUrl, 500)}`,
    `Navegador: ${oneLine(input.userAgent, 300)}`,
    `Enviado em: ${input.sentAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília)`,
    ...(input.imageCount ? [`Imagens anexadas: ${input.imageCount}`] : [])
  ].join('\n')

  return {
    subject: `Feedback de ${from}: ${oneLine(input.message, 60)}`,
    text,
    // O corpo inteiro passa pelo escape: nada do que a pessoa escreveu vira marcação.
    html: `<pre style="font:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`
  }
}

const IMAGE_SIGNATURES = [
  { contentType: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  {
    contentType: 'image/png',
    extension: 'png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  },
  // RIFF, quatro bytes de tamanho, WEBP.
  {
    contentType: 'image/webp',
    extension: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50]
  }
]

/**
 * Confere as imagens (base64) e monta os anexos. O tipo sai dos primeiros
 * bytes do arquivo, e o nome é do servidor: nome, extensão e `Content-Type`
 * de quem enviou nem chegam aqui. SVG não tem assinatura na lista.
 */
export function feedbackAttachments(images: string[]): EmailAttachment[] {
  if (images.length > FEEDBACK_MAX_IMAGES) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: `Envie no máximo ${FEEDBACK_MAX_IMAGES} imagens por mensagem.`
    })
  }
  return images.map((content, index) => {
    const tooLarge = () =>
      new TRPCError({
        code: 'PAYLOAD_TOO_LARGE',
        message: `A imagem ${index + 1} passa de ${PHOTO_MAX_BYTES / 1024 / 1024} MB.`
      })
    // Antes de decodificar: base64 de N bytes tem 4 * ceil(N / 3) caracteres.
    if (content.length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4) throw tooLarge()
    const bytes = Buffer.from(content, 'base64')
    if (bytes.length > PHOTO_MAX_BYTES) throw tooLarge()
    const signature = IMAGE_SIGNATURES.find(({ bytes: expected }) =>
      expected.every((byte, at) => byte === -1 || bytes[at] === byte)
    )
    // O comprimento confere que o texto é só base64: o `Buffer` pula o que
    // não reconhece, e o anexo vai para a Resend como chegou.
    if (!signature || content.length !== Math.ceil(bytes.length / 3) * 4) {
      throw new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `A imagem ${index + 1} não é JPEG, PNG nem WebP.`
      })
    }
    return {
      filename: `imagem-${index + 1}.${signature.extension}`,
      contentType: signature.contentType,
      content
    }
  })
}

export const feedbackRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        message: z
          .string()
          .trim()
          .min(FEEDBACK_MIN_LENGTH)
          .max(FEEDBACK_MAX_LENGTH),
        /** Página em que o diálogo foi aberto. Vai ao e-mail como texto. */
        pageUrl: z.string().max(2_000),
        /** Base64, sem prefixo `data:`. Quantidade, tamanho e tipo: `feedbackAttachments`. */
        images: z.array(z.string()).default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.session
      // Antes do limite: imagem recusada não gasta um envio da pessoa.
      const attachments = feedbackAttachments(input.images)

      const key = feedbackLimitKey(user.id)
      const attempt = await incrementWindow(key, FEEDBACK_LIMIT)
      if (!attempt.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Você já mandou ${FEEDBACK_LIMIT.max} mensagens na última hora. Tente de novo mais tarde.`
        })
      }

      try {
        const [ownBar] =
          user.role === 'pub'
            ? await db
                .select({ name: bar.name })
                .from(bar)
                .where(eq(bar.userId, user.id))
            : []
        await sendEmailWithResend({
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.RESEND_FROM_EMAIL,
          to: FEEDBACK_TO,
          replyTo: user.email,
          attachments,
          ...createFeedbackEmail({
            message: input.message,
            name: user.name,
            email: user.email,
            role: user.role,
            barName: ownBar?.name ?? null,
            pageUrl: input.pageUrl,
            userAgent: ctx.headers?.get('user-agent') ?? 'não informado',
            sentAt: new Date(),
            imageCount: attachments.length
          })
        })
      } catch (error) {
        // Envio que falhou não conta: a pessoa vai tentar de novo.
        await refundWindowAttempt(key)
        console.error('[feedback] envio falhou', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Não conseguimos enviar agora. Tente de novo em instantes.'
        })
      }
    })
})
