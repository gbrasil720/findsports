import { db, sql } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, publicProcedure, router } from '../index'
import { getAppConfig } from '../lib/app-config'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'
import { sendWaitlistEmail, waitlistUrl } from '../lib/waitlist-email'
import {
  consumirLimitesWaitlist,
  type DecisaoRateLimit,
  type JanelaLimite
} from '../lib/waitlist-rate-limit'
import {
  createWaitlistToken,
  hashWaitlistToken,
  normalizeWaitlistEmail
} from '../lib/waitlist-workflow'

const CIDADE_DE_CONVITE = 'Convite direto'
const waitlistCursorSchema = z.object({ c: z.string(), i: z.string() })
const tokenSchema = z.string().min(32).max(256)
const commonFields = {
  email: z.string().trim().toLowerCase().email().max(255),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional()
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

async function incrementarWaitlist(
  key: string,
  limite: JanelaLimite
): Promise<DecisaoRateLimit> {
  const now = Date.now()
  const result = await db.execute(sql`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
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
  return {
    allowed: count <= limite.max,
    retryAfterMs: count <= limite.max ? 0 : limite.windowMs,
    count
  }
}

async function persistEmailResult(input: {
  email: string
  kind: 'confirmation' | 'invite'
  error: string | null
}) {
  if (input.kind === 'confirmation') {
    await db.execute(sql`
      UPDATE waitlist_entries SET
        confirmation_sent_at = ${input.error ? null : new Date()},
        confirmation_error = ${input.error}
      WHERE email = ${input.email}
    `)
    return
  }
  await db.execute(sql`
    UPDATE waitlist_entries SET
      invite_claimed_at = NULL,
      invite_sent_at = ${input.error ? null : new Date()},
      invite_error = ${input.error}
    WHERE email = ${input.email}
  `)
}

async function approveAndInvite(input: { email: string; adminId: string }) {
  const token = await createWaitlistToken()
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT w.email, EXISTS (
        SELECT 1 FROM "user" u WHERE lower(u.email) = w.email
      ) AS account_exists
      FROM waitlist_entries w
      WHERE w.email = ${input.email}
        AND w.confirmed_at IS NOT NULL
        AND w.cancelled_at IS NULL
        AND (
          w.approved_at IS NULL OR w.invite_error IS NOT NULL OR
          w.invite_expires_at <= NOW() OR
          (
            w.invite_sent_at IS NULL AND
            (
              w.invite_claimed_at IS NULL OR
              w.invite_claimed_at < NOW() - INTERVAL '10 minutes'
            )
          )
        )
    )
    UPDATE waitlist_entries w SET
      approved_at = NOW(), approved_by = ${input.adminId},
      invite_token_hash = ${token.hash},
      invite_expires_at = NOW() + INTERVAL '7 days',
      invite_claimed_at = NOW(), invite_sent_at = NULL, invite_error = NULL,
      activated_at = CASE
        WHEN candidate.account_exists THEN COALESCE(w.activated_at, NOW())
        ELSE w.activated_at
      END
    FROM candidate
    WHERE w.email = candidate.email
    RETURNING candidate.account_exists AS "accountExists"
  `)
  const row = result.rows[0] as { accountExists: boolean } | undefined
  if (!row) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A inscrição não está elegível ou já possui convite ativo.'
    })
  }

  if (row.accountExists) {
    await db.execute(sql`
      UPDATE "user" SET admitted_at = COALESCE(admitted_at, NOW())
      WHERE lower(email) = ${input.email}
    `)
  }

  try {
    await sendWaitlistEmail({
      kind: row.accountExists ? 'approved-existing' : 'invite',
      to: input.email,
      url: row.accountExists
        ? waitlistUrl('/login')
        : waitlistUrl('/activate-invite', token.token),
      idempotencyKey: `waitlist-invite-${input.email}-${token.hash.slice(0, 16)}`
    })
    await persistEmailResult({
      email: input.email,
      kind: 'invite',
      error: null
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no envio.'
    await persistEmailResult({
      email: input.email,
      kind: 'invite',
      error: message
    })
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'A aprovação foi salva, mas o convite não foi enviado.'
    })
  }

  return {
    email: input.email,
    accountExists: row.accountExists,
    approved: true
  }
}

export const waitlistRouter = router({
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
      const keyset = input.cursor
        ? decodeCursor(input.cursor, waitlistCursorSchema)
        : null
      const keysetFilter = keyset
        ? sql`WHERE (w.created_at, w.id) < (${keyset.c}::timestamp, ${keyset.i}::text)`
        : sql``
      const result = await db.execute(sql`
        SELECT
          w.id, w.email, w.role, w.city, w.phone, w.pub_name AS "pubName",
          w.created_at AS "createdAt", w.confirmed_at AS "confirmedAt",
          w.cancelled_at AS "cancelledAt", w.approved_at AS "approvedAt",
          w.approved_by AS "approvedBy", w.invite_expires_at AS "inviteExpiresAt",
          w.invite_sent_at AS "inviteSentAt", w.invite_error AS "inviteError",
          w.activated_at AS "activatedAt",
          EXISTS (SELECT 1 FROM "user" u WHERE lower(u.email) = w.email) AS "accountExists",
          to_char(w.created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_created_at
        FROM waitlist_entries w
        ${keysetFilter}
        ORDER BY w.created_at DESC, w.id DESC
        LIMIT ${input.limit}
      `)
      type Row = {
        id: string
        email: string
        role: 'fan' | 'pub'
        city: string
        phone: string | null
        pubName: string | null
        createdAt: string
        confirmedAt: string | null
        cancelledAt: string | null
        approvedAt: string | null
        approvedBy: string | null
        inviteExpiresAt: string | null
        inviteSentAt: string | null
        inviteError: string | null
        activatedAt: string | null
        accountExists: boolean
        cursor_created_at: string
      }
      const rows = result.rows as Row[]
      const last = rows.length === input.limit ? rows.at(-1) : undefined
      return {
        entries: rows.map(({ cursor_created_at, ...entry }) => entry),
        nextCursor: last
          ? encodeCursor({ c: last.cursor_created_at, i: last.id })
          : null
      }
    }),

  setApproval: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(255),
        approved: z.boolean()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = normalizeWaitlistEmail(input.email)
      if (input.approved) {
        return approveAndInvite({ email, adminId: ctx.session.user.id })
      }
      const result = await db.execute(sql`
        UPDATE waitlist_entries SET
          approved_at = NULL, approved_by = NULL,
          invite_token_hash = NULL, invite_expires_at = NULL,
          invite_claimed_at = NULL, invite_sent_at = NULL, invite_error = NULL
        WHERE email = ${email} AND activated_at IS NULL
        RETURNING email
      `)
      if (result.rows.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conta ativada não pode ser desaprovada; use a suspensão.'
        })
      }
      return { email, accountExists: false, approved: false }
    }),

  invite: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(255),
        role: z.enum(['fan', 'pub'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = normalizeWaitlistEmail(input.email)
      await db.execute(sql`
        INSERT INTO waitlist_entries (id, email, role, city, confirmed_at)
        VALUES (
          ${crypto.randomUUID()}, ${email}, ${input.role}::waitlist_role,
          ${CIDADE_DE_CONVITE}, NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
          role = EXCLUDED.role,
          confirmed_at = COALESCE(waitlist_entries.confirmed_at, NOW()),
          cancelled_at = NULL
      `)
      const approved = await approveAndInvite({
        email,
        adminId: ctx.session.user.id
      })
      return { ...approved, criado: true }
    }),

  join: publicProcedure
    .input(
      z.discriminatedUnion('role', [
        z.object({ ...commonFields, role: z.literal('fan') }),
        z.object({
          ...commonFields,
          role: z.literal('pub'),
          pubName: z.string().trim().min(2).max(100)
        })
      ])
    )
    .mutation(async ({ ctx, input }) => {
      const email = normalizeWaitlistEmail(input.email)
      const authenticated =
        ctx.session?.user.emailVerified === true &&
        normalizeWaitlistEmail(ctx.session.user.email) === email
      const limits = await getAppConfig('waitlist.rate_limit')
      const decision = await consumirLimitesWaitlist({
        ip: ctx.clientIp,
        email,
        limites: limits,
        incrementar: incrementarWaitlist
      })
      if (!decision.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Muitas tentativas. Tente de novo em alguns minutos.'
        })
      }

      const city = collapseSpaces(input.city)
      const phone = emptyToNull(input.phone)
      const pubName =
        input.role === 'pub' ? collapseSpaces(input.pubName) : null

      if (authenticated) {
        const leave = await createWaitlistToken()
        const enrollment = await db.execute(sql`
          INSERT INTO waitlist_entries
            (id, email, role, city, phone, pub_name, confirmed_at, leave_token_hash)
          VALUES (
            ${crypto.randomUUID()}, ${email}, ${input.role}::waitlist_role,
            ${city}, ${phone}, ${pubName}, NOW(), ${leave.hash}
          )
          ON CONFLICT (email) DO UPDATE SET
            role = EXCLUDED.role, city = EXCLUDED.city, phone = EXCLUDED.phone,
            pub_name = EXCLUDED.pub_name, confirmed_at = NOW(),
            leave_token_hash = EXCLUDED.leave_token_hash, cancelled_at = NULL
          RETURNING id
        `)
        await sendWaitlistEmail({
          kind: 'joined',
          to: email,
          url: waitlistUrl('/leave-waitlist', leave.token)
        })
        return {
          status: 'confirmed' as const,
          waitlistId: (enrollment.rows[0] as { id: string }).id
        }
      }

      const confirmation = await createWaitlistToken()
      const enrollment = await db.execute(sql`
        INSERT INTO waitlist_entries
          (id, email, role, city, pending_role, pending_city, pending_phone,
           pending_pub_name, confirmation_token_hash, confirmation_expires_at)
        VALUES (
          ${crypto.randomUUID()}, ${email}, ${input.role}::waitlist_role, ${city},
          ${input.role}::waitlist_role, ${city}, ${phone}, ${pubName},
          ${confirmation.hash}, NOW() + INTERVAL '24 hours'
        )
        ON CONFLICT (email) DO UPDATE SET
          pending_role = EXCLUDED.pending_role,
          pending_city = EXCLUDED.pending_city,
          pending_phone = EXCLUDED.pending_phone,
          pending_pub_name = EXCLUDED.pending_pub_name,
          confirmation_token_hash = EXCLUDED.confirmation_token_hash,
          confirmation_expires_at = EXCLUDED.confirmation_expires_at,
          confirmation_sent_at = NULL,
          confirmation_error = NULL
        RETURNING id
      `)
      try {
        await sendWaitlistEmail({
          kind: 'confirm',
          to: email,
          url: waitlistUrl('/confirm-waitlist', confirmation.token)
        })
        await persistEmailResult({ email, kind: 'confirmation', error: null })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha no envio.'
        await persistEmailResult({
          email,
          kind: 'confirmation',
          error: message
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Não foi possível enviar a confirmação. Tente novamente.'
        })
      }
      return {
        status: 'confirmation_sent' as const,
        waitlistId: (enrollment.rows[0] as { id: string }).id
      }
    }),

  confirm: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ input }) => {
      const hash = await hashWaitlistToken(input.token)
      const leave = await createWaitlistToken()
      const result = await db.execute(sql`
        UPDATE waitlist_entries SET
          role = pending_role, city = pending_city, phone = pending_phone,
          pub_name = pending_pub_name, confirmed_at = NOW(), cancelled_at = NULL,
          leave_token_hash = ${leave.hash}, pending_role = NULL,
          pending_city = NULL, pending_phone = NULL, pending_pub_name = NULL,
          confirmation_token_hash = NULL, confirmation_expires_at = NULL
        WHERE confirmation_token_hash = ${hash}
          AND confirmation_expires_at > NOW()
        RETURNING id, email
      `)
      const row = result.rows[0] as { id: string; email: string } | undefined
      if (!row) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Link inválido ou expirado.'
        })
      }
      await sendWaitlistEmail({
        kind: 'joined',
        to: row.email,
        url: waitlistUrl('/leave-waitlist', leave.token)
      })
      return { confirmed: true, waitlistId: row.id }
    }),

  leave: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ input }) => {
      const hash = await hashWaitlistToken(input.token)
      const result = await db.execute(sql`
        UPDATE waitlist_entries SET
          cancelled_at = NOW(), approved_at = NULL, approved_by = NULL,
          invite_token_hash = NULL, invite_expires_at = NULL
        WHERE leave_token_hash = ${hash} AND cancelled_at IS NULL
        RETURNING id
      `)
      if (result.rows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Link inválido.' })
      }
      return { cancelled: true }
    }),

  inviteDetails: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .query(async ({ input }) => {
      const hash = await hashWaitlistToken(input.token)
      const result = await db.execute(sql`
        SELECT id, email
        FROM waitlist_entries
        WHERE invite_token_hash = ${hash}
          AND invite_expires_at > NOW()
          AND activated_at IS NULL
          AND approved_at IS NOT NULL
          AND cancelled_at IS NULL
        LIMIT 1
      `)
      const row = result.rows[0] as { id: string; email: string } | undefined
      if (!row) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Convite inválido ou expirado.'
        })
      }
      return row
    }),

  campaignPreview: adminProcedure.query(async () => {
    const result = await db.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE confirmed_at IS NOT NULL AND cancelled_at IS NULL
            AND activated_at IS NULL AND launch_notice_sent_at IS NULL
            AND (invite_expires_at IS NULL OR invite_expires_at <= NOW())
            AND NOT EXISTS (
              SELECT 1 FROM "user" u WHERE lower(u.email) = waitlist_entries.email
            )
        )::int AS eligible,
        count(*) FILTER (WHERE launch_notice_sent_at IS NOT NULL)::int AS sent,
        count(*) FILTER (WHERE launch_notice_error IS NOT NULL)::int AS failed
      FROM waitlist_entries
    `)
    return (result.rows[0] ?? { eligible: 0, sent: 0, failed: 0 }) as {
      eligible: number
      sent: number
      failed: number
    }
  }),

  sendLaunchNotice: adminProcedure.mutation(async () => {
    const gate = await getAppConfig('launch.waitlist_gate')
    if (gate.signup) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Abra o cadastro antes de enviar o aviso público.'
      })
    }
    const claimed = await db.execute(sql`
      UPDATE waitlist_entries w SET
        launch_notice_claimed_at = NOW(), launch_notice_error = NULL
      WHERE w.confirmed_at IS NOT NULL AND w.cancelled_at IS NULL
        AND w.activated_at IS NULL AND w.launch_notice_sent_at IS NULL
        AND (w.invite_expires_at IS NULL OR w.invite_expires_at <= NOW())
        AND (
          w.launch_notice_claimed_at IS NULL OR
          w.launch_notice_claimed_at < NOW() - INTERVAL '10 minutes'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "user" u WHERE lower(u.email) = w.email
        )
      RETURNING w.id, w.email
    `)
    let sent = 0
    let failed = 0
    for (const candidate of claimed.rows as { id: string; email: string }[]) {
      try {
        await sendWaitlistEmail({
          kind: 'launch',
          to: candidate.email,
          url: waitlistUrl(
            `/signup?source=waitlist_launch&wid=${encodeURIComponent(candidate.id)}`
          ),
          idempotencyKey: `waitlist-launch-${candidate.id}`
        })
        await db.execute(sql`
          UPDATE waitlist_entries SET
            launch_notice_sent_at = NOW(), launch_notice_claimed_at = NULL,
            launch_notice_error = NULL
          WHERE id = ${candidate.id}
        `)
        sent++
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha no envio.'
        await db.execute(sql`
          UPDATE waitlist_entries SET
            launch_notice_claimed_at = NULL, launch_notice_error = ${message}
          WHERE id = ${candidate.id}
        `)
        failed++
      }
    }
    return { processed: claimed.rows.length, sent, failed }
  })
})
