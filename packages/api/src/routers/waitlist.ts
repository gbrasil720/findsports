import { db, sql, waitlistEntries } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, publicProcedure, router } from '../index'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'

const commonFields = {
  email: z.string().trim().toLowerCase().email().max(255),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional()
}

function emptyToUndefined(value: string | undefined) {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

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
    .mutation(async ({ input }) => {
      const city = collapseSpaces(input.city)
      const email = input.email.trim().toLowerCase()
      const phone = emptyToUndefined(input.phone)

      const pubName =
        input.role === 'pub' ? collapseSpaces(input.pubName) : undefined

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
