import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'

export const waitlistRoleEnum = pgEnum('waitlist_role', ['fan', 'pub'])

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    role: waitlistRoleEnum('role').notNull(),
    city: text('city').notNull(),
    phone: text('phone'),
    pubName: text('pub_name'),
    pendingRole: waitlistRoleEnum('pending_role'),
    pendingCity: text('pending_city'),
    pendingPhone: text('pending_phone'),
    pendingPubName: text('pending_pub_name'),
    confirmationTokenHash: text('confirmation_token_hash'),
    confirmationExpiresAt: timestamp('confirmation_expires_at'),
    confirmationSentAt: timestamp('confirmation_sent_at'),
    confirmationError: text('confirmation_error'),
    /**
     * Quando o link de confirmação foi usado (ONS-46).
     *
     * O hash do token continua na linha depois do uso: é ele que torna
     * reabrir o mesmo link idempotente. Quem decide se a confirmação já
     * aconteceu é esta coluna, não a ausência do hash — apagar o hash no
     * `UPDATE` era o que fazia uma falha de e-mail transformar uma inscrição
     * confirmada em "Link inválido ou expirado".
     */
    confirmationConsumedAt: timestamp('confirmation_consumed_at'),
    confirmedAt: timestamp('confirmed_at'),
    leaveTokenHash: text('leave_token_hash'),
    /** Envio do e-mail `joined`: estado próprio, separado da confirmação. */
    joinedClaimedAt: timestamp('joined_claimed_at'),
    joinedSentAt: timestamp('joined_sent_at'),
    joinedError: text('joined_error'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    /**
     * Liberação para entrar na plataforma (ESC-19).
     *
     * Nulo é o estado normal de quem se cadastrou: estar na lista não é estar
     * aprovado. O portão de login lê esta coluna, e não a existência da
     * linha — senão qualquer pessoa se aprovaria preenchendo o formulário
     * público.
     */
    approvedAt: timestamp('approved_at'),
    /** Id do admin que liberou. Texto solto: apagar o admin não pode
     *  desaprovar ninguém. */
    approvedBy: text('approved_by'),
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at'),
    inviteClaimedAt: timestamp('invite_claimed_at'),
    inviteSentAt: timestamp('invite_sent_at'),
    inviteError: text('invite_error'),
    activatedAt: timestamp('activated_at'),
    launchNoticeClaimedAt: timestamp('launch_notice_claimed_at'),
    launchNoticeSentAt: timestamp('launch_notice_sent_at'),
    launchNoticeError: text('launch_notice_error')
  },
  (table) => ({
    emailUnique: uniqueIndex('waitlist_entries_email_unique').on(table.email),
    cityIdx: index('city_idx').on(table.city)
  })
)
