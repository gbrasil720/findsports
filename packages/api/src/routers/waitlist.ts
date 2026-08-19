import { db, sql, waitlistEntries } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, publicProcedure, router } from '../index'
import { getAppConfig } from '../lib/app-config'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'
import {
  consumirLimitesWaitlist,
  type DecisaoRateLimit,
  type JanelaLimite
} from '../lib/waitlist-rate-limit'

const commonFields = {
  email: z.string().trim().toLowerCase().email().max(255),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional()
}

async function incrementarWaitlist(
  key: string,
  limite: JanelaLimite
): Promise<DecisaoRateLimit> {
  const now = Date.now()
  const id = crypto.randomUUID()
  const result = await db.execute(sql`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (${id}, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN ${now} - rate_limit.last_request >= ${limite.windowMs} THEN 1
        ELSE rate_limit.count + 1
      END,
      last_request = CASE
        WHEN ${now} - rate_limit.last_request >= ${limite.windowMs} THEN ${now}
        ELSE rate_limit.last_request
      END
    RETURNING count
  `)
  const count = Number(
    (result.rows[0] as { count: string | number } | undefined)?.count ?? 0
  )
  const allowed = count <= limite.max
  return {
    allowed,
    retryAfterMs: allowed ? 0 : limite.windowMs,
    count
  }
}

function emptyToUndefined(value: string | undefined) {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Cidade das linhas criadas por convite direto. Marca a origem sem precisar
 * de coluna nova, e mantém honestas as contagens por cidade de quem se
 * inscreveu sozinho.
 */
const CIDADE_DE_CONVITE = 'Convite direto'

/** Última tupla de ordenação: data de cadastro e id. */
const waitlistCursorSchema = z.object({ c: z.string(), i: z.string() })

export const waitlistRouter = router({
  /**
   * ESC-09: era `protectedProcedure`, que só exige sessão — qualquer conta
   * cadastrada podia baixar a base inteira de e-mails, telefones e cidades.
   * O guard de rota bloqueava a página `/internal` para não-admin, mas o
   * endpoint continuava respondendo a quem o chamasse direto.
   *
   * Duas mudanças: passa a exigir papel de administrador, e a resposta deixa
   * de ser ilimitada — com a lista crescendo, uma única chamada devolveria
   * dezenas de MB.
   */
  getAll: adminProcedure
    .input(
      z
        .object({
          cursor: z.string().optional(),
          limit: z.number().min(1).max(500).default(200)
        })
        .default({ limit: 200 })
    )
    .query(async ({ input }) => {
      const { cursor, limit } = input

      // Mesma técnica do ESC-05: chave keyset com desempate único, e o
      // timestamp trafegando como texto no formato do Postgres para não
      // passar por conversão de fuso.
      const keyset = cursor ? decodeCursor(cursor, waitlistCursorSchema) : null
      const keysetFilter = keyset
        ? sql`WHERE (created_at, id) < (${keyset.c}::timestamp, ${keyset.i}::text)`
        : sql``

      const result = await db.execute(sql`
        SELECT
          id, email, role, city, phone, pub_name AS "pubName", created_at AS "createdAt",
          approved_at AS "approvedAt", approved_by AS "approvedBy",
          to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_created_at
        FROM waitlist_entries
        ${keysetFilter}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `)

      type Row = {
        id: string
        email: string
        role: 'fan' | 'pub'
        city: string
        phone: string | null
        pubName: string | null
        createdAt: string
        approvedAt: string | null
        approvedBy: string | null
        cursor_created_at: string
      }

      const rows = result.rows as Row[]
      const last = rows.length === limit ? rows[rows.length - 1] : undefined

      return {
        entries: rows.map(({ cursor_created_at, ...entry }) => entry),
        nextCursor: last
          ? encodeCursor({ c: last.cursor_created_at, i: last.id })
          : null
      }
    }),
  /**
   * Libera — ou revoga — o acesso de um e-mail (ESC-19).
   *
   * A aprovação é da PESSOA, não da linha: o portão de entrada consulta por
   * e-mail, e a mesma pessoa pode ter várias inscrições (torcedor e bar, ou
   * cidades diferentes). Marcar todas as linhas do e-mail de uma vez é o que
   * faz o painel dizer a verdade — aprovar uma e ver as outras como
   * pendentes seria mentira, já que o acesso já estaria liberado.
   */
  setApproval: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(255),
        approved: z.boolean()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resultado = await db.execute(
        input.approved
          ? sql`
              UPDATE waitlist_entries
              SET approved_at = NOW(), approved_by = ${ctx.session.user.id}
              WHERE email = ${input.email} AND approved_at IS NULL
            `
          : sql`
              UPDATE waitlist_entries
              SET approved_at = NULL, approved_by = NULL
              WHERE email = ${input.email} AND approved_at IS NOT NULL
            `
      )

      return {
        email: input.email,
        approved: input.approved,
        linhas: resultado.rowCount ?? 0
      }
    }),

  /**
   * Libera um e-mail que NÃO está na lista de espera (ESC-19).
   *
   * `setApproval` só marca linha existente, e existe gente que a gente quer
   * dentro sem ter passado pelo formulário — o dono de bar que a equipe
   * abordou na rua, o primeiro cliente, um teste. Sem isto a resposta para
   * "como libero essa pessoa?" seria "peça para ela se cadastrar primeiro",
   * que é pedir para o convidado bater na porta antes de você abrir.
   *
   * A cidade fica marcada como convite de propósito: separa quem entrou pela
   * porta da frente de quem foi puxado para dentro, e mantém as métricas de
   * cidade da lista de espera honestas.
   */
  invite: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(255),
        role: z.enum(['fan', 'pub'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Já aprovado por qualquer via: nada a fazer, e dizer isso é melhor do
      // que criar uma segunda linha para a mesma pessoa.
      const jaAprovado = await db.execute(sql`
        SELECT 1 FROM waitlist_entries
        WHERE email = ${input.email} AND approved_at IS NOT NULL
        LIMIT 1
      `)
      if (jaAprovado.rows.length > 0) {
        return { email: input.email, criado: false }
      }

      await db.execute(sql`
        INSERT INTO waitlist_entries
          (id, email, role, city, approved_at, approved_by)
        VALUES (
          ${crypto.randomUUID()}, ${input.email}, ${input.role}::waitlist_role,
          ${CIDADE_DE_CONVITE}, NOW(), ${ctx.session.user.id}
        )
        ON CONFLICT (email, role, city) DO UPDATE SET
          approved_at = NOW(),
          approved_by = EXCLUDED.approved_by
      `)

      return { email: input.email, criado: true }
    }),

  join: publicProcedure
    .input(
      z.discriminatedUnion('role', [
        z.object({
          ...commonFields,
          role: z.literal('fan')
        }),
        z.object({
          ...commonFields,
          role: z.literal('pub'),
          pubName: z.string().trim().min(2).max(100)
        })
      ])
    )
    .mutation(async ({ ctx, input }) => {
      const city = collapseSpaces(input.city)
      const email = input.email.trim().toLowerCase()
      const phone = emptyToUndefined(input.phone)

      const pubName =
        input.role === 'pub' ? collapseSpaces(input.pubName) : undefined

      // ESC-19: os tetos vêm da configuração em tempo de execução, com o
      // valor medido como padrão. Banco de configuração fora do ar cai no
      // padrão, ou seja, no freio que já existia — nunca em freio nenhum.
      const limites = await getAppConfig('waitlist.rate_limit')
      const limite = await consumirLimitesWaitlist({
        ip: ctx.clientIp,
        email,
        limites,
        incrementar: incrementarWaitlist
      })
      if (!limite.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Muitas tentativas. Tente de novo em alguns minutos.'
        })
      }

      try {
        const [entry] = await db
          .insert(waitlistEntries)
          .values({
            role: input.role,
            email,
            phone,
            city,
            pubName
          })
          .returning({ id: waitlistEntries.id })

        if (!entry) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao cadastrar. Tente novamente.'
          })
        }

        return { id: entry.id }
      } catch (err: unknown) {
        const isDuplicate =
          err instanceof Error &&
          (err.message.includes('unique') ||
            err.message.includes('duplicate key'))

        if (isDuplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Este e-mail já está cadastrado para esta cidade.'
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao cadastrar. Tente novamente.'
        })
      }
    })
})
