import { db, waitlistEntries } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../index'

export const waitlistRouter = router({
  getAll: protectedProcedure.query(async () => {
    const entries = await db.select().from(waitlistEntries)
    return entries
  }),
  join: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.string().email().max(255),
        phone: z.string().max(30).optional(),
        role: z.enum(['fan', 'pub']),
        pubName: z.string().max(100).optional(),
        bairro: z.string().max(100).optional()
      })
    )
    .mutation(async ({ input }) => {
      const { pubName, bairro, ...rest } = input
      const values = {
        ...rest,
        pubName: input.role === 'pub' && pubName ? pubName : 'N/A',
        bairro: input.role === 'pub' && bairro ? bairro : 'N/A'
      }
      try {
        const [entry] = await db
          .insert(waitlistEntries)
          .values(values)
          .returning({ id: waitlistEntries.id })

        return { id: entry!.id }
      } catch (err: unknown) {
        const isDuplicateEmail =
          err instanceof Error && err.message.includes('unique')

        if (isDuplicateEmail) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Email já cadastrado na lista de espera.'
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao cadastrar. Tente novamente.'
        })
      }
    })
})
