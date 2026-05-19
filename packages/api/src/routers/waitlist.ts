import { db, waitlistEntries } from "@findsports_oficial/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const waitlistRouter = router({
  join: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.string().email().max(255),
        phone: z.string().max(30).optional(),
        role: z.enum(["fan", "pub"]),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const [entry] = await db
          .insert(waitlistEntries)
          .values(input)
          .returning({ id: waitlistEntries.id });

        return { id: entry!.id };
      } catch (err: unknown) {
        const isDuplicateEmail =
          err instanceof Error && err.message.includes("unique");

        if (isDuplicateEmail) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email já cadastrado na lista de espera.",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao cadastrar. Tente novamente.",
        });
      }
    }),
});
