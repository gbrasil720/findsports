import { db, waitlistEntries } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../index'

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

export const waitlistRouter = router({
  getAll: protectedProcedure.query(async () => {
    const entries = await db.select().from(waitlistEntries)
    return entries
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
