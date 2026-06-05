import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'inactive',
  'past_due'
])

export const bar = pgTable(
  'bar',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    phone: text('phone'),
    address: text('address').notNull(),
    neighborhood: text('neighborhood').notNull(),
    city: text('city').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: numeric('longitude', { precision: 11, scale: 8 }).notNull(),
    photoUrl: text('photo_url'),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [index('bar_userId_idx').on(table.userId)]
)

export const sport = pgTable('sport', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  iconUrl: text('icon_url'),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const team = pgTable(
  'team',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sportId: text('sport_id')
      .notNull()
      .references(() => sport.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    country: text('country'),
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [index('team_sportId_idx').on(table.sportId)]
)

export const event = pgTable(
  'event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    sportId: text('sport_id')
      .notNull()
      .references(() => sport.id),
    championship: text('championship').notNull(),
    startsAt: timestamp('starts_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('event_barId_idx').on(table.barId),
    index('event_sportId_idx').on(table.sportId),
    index('event_startsAt_idx').on(table.startsAt)
  ]
)

export const eventParticipants = pgTable(
  'event_participants',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.eventId, table.teamId] })]
)

export const userPreferenceSports = pgTable(
  'user_preference_sports',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sportId: text('sport_id')
      .notNull()
      .references(() => sport.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.userId, table.sportId] })]
)

export const userFavoriteBars = pgTable(
  'user_favorite_bars',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.barId] })]
)

export const subscription = pgTable('subscription', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  barId: text('bar_id')
    .notNull()
    .unique()
    .references(() => bar.id, { onDelete: 'cascade' }),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  dodoSubscriptionId: text('dodo_subscription_id').unique(),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()
})

export const barRelations = relations(bar, ({ one, many }) => ({
  user: one(user, {
    fields: [bar.userId],
    references: [user.id]
  }),
  events: many(event),
  subscription: one(subscription, {
    fields: [bar.id],
    references: [subscription.barId]
  }),
  favoritedBy: many(userFavoriteBars)
}))

export const sportRelations = relations(sport, ({ many }) => ({
  teams: many(team),
  events: many(event),
  userPreferenceSports: many(userPreferenceSports)
}))

export const teamRelations = relations(team, ({ one, many }) => ({
  sport: one(sport, {
    fields: [team.sportId],
    references: [sport.id]
  }),
  eventParticipants: many(eventParticipants)
}))

export const eventRelations = relations(event, ({ one, many }) => ({
  bar: one(bar, {
    fields: [event.barId],
    references: [bar.id]
  }),
  sport: one(sport, {
    fields: [event.sportId],
    references: [sport.id]
  }),
  participants: many(eventParticipants)
}))

export const eventParticipantsRelations = relations(
  eventParticipants,
  ({ one }) => ({
    event: one(event, {
      fields: [eventParticipants.eventId],
      references: [event.id]
    }),
    team: one(team, {
      fields: [eventParticipants.teamId],
      references: [team.id]
    })
  })
)

export const userPreferenceSportsRelations = relations(
  userPreferenceSports,
  ({ one }) => ({
    user: one(user, {
      fields: [userPreferenceSports.userId],
      references: [user.id]
    }),
    sport: one(sport, {
      fields: [userPreferenceSports.sportId],
      references: [sport.id]
    })
  })
)

export const userFavoriteBarsRelations = relations(
  userFavoriteBars,
  ({ one }) => ({
    user: one(user, {
      fields: [userFavoriteBars.userId],
      references: [user.id]
    }),
    bar: one(bar, {
      fields: [userFavoriteBars.barId],
      references: [bar.id]
    })
  })
)

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  bar: one(bar, {
    fields: [subscription.barId],
    references: [bar.id]
  })
}))
