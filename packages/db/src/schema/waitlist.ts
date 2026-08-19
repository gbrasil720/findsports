import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique
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
    approvedBy: text('approved_by')
  },
  (table) => ({
    emailRoleCityUnique: unique().on(table.email, table.role, table.city),
    cityIdx: index('city_idx').on(table.city)
  })
)
