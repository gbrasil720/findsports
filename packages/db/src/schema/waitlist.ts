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
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => ({
    emailRoleCityUnique: unique().on(table.email, table.role, table.city),
    cityIdx: index('city_idx').on(table.city)
  })
)
