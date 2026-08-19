import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * PostGIS `geography(Point,4326)`. Requer a extensão `postgis` — criada na
 * migration 0013, que não é expressável no schema do Drizzle.
 */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point,4326)'
  }
})

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'inactive',
  'past_due',
  'cancelled'
])

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'pro',
  'elite'
])

export type SubscriptionPlan = (typeof subscriptionPlanEnum.enumValues)[number]

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
    phoneAcceptsWhatsapp: boolean('phone_accepts_whatsapp')
      .default(false)
      .notNull(),
    address: text('address').notNull(),
    neighborhood: text('neighborhood').notNull(),
    city: text('city').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: numeric('longitude', { precision: 11, scale: 8 }).notNull(),
    // Derivada de latitude/longitude pelo próprio Postgres. Existe para que a
    // busca por proximidade use `ST_DWithin` + índice GiST em vez de calcular
    // haversine linha a linha (ESC-01).
    geo: geographyPoint('geo').generatedAlwaysAs(
      sql`ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography`
    ),
    photoUrl: text('photo_url'),
    // Espelho de `subscription.plan`, mantido por trigger (ESC-09). A busca
    // ordena por plano antes de qualquer outra chave; ler o plano da própria
    // linha do bar evita um lookup em `subscription` por candidato do raio.
    // `starter` é o mesmo default do `COALESCE` que existia na query.
    plan: subscriptionPlanEnum('plan').default('starter').notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('bar_userId_idx').on(table.userId),
    index('bar_isActive_idx').on(table.isActive),
    // Índice parcial: a busca sempre filtra por bares ativos.
    index('bar_geo_active_idx').using('gist', table.geo).where(sql`is_active`),
    // ESC-09: `search` avalia os planos em camadas (elite, depois pro, depois
    // starter) porque o plano é a primeira chave de ordenação. Um índice por
    // plano deixa cada camada varrer só a sua fatia — a de elite tem 5% das
    // linhas — em vez dos 100% de `bar_geo_active_idx`.
    index('bar_geo_elite_idx')
      .using('gist', table.geo)
      .where(sql`is_active AND plan = 'elite'`),
    index('bar_geo_pro_idx')
      .using('gist', table.geo)
      .where(sql`is_active AND plan = 'pro'`),
    index('bar_geo_starter_idx')
      .using('gist', table.geo)
      .where(sql`is_active AND plan = 'starter'`)
  ]
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
    endsAt: timestamp('ends_at'),
    participantFreeText: text('participant_free_text'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('event_barId_idx').on(table.barId),
    index('event_sportId_idx').on(table.sportId),
    index('event_startsAt_idx').on(table.startsAt),
    // Padrão real de acesso da busca: próximo jogo de um bar específico.
    index('event_barId_startsAt_idx').on(table.barId, table.startsAt)
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
  (table) => [
    primaryKey({ columns: [table.eventId, table.teamId] }),
    // A PK composta começa por event_id; buscar (ou cascatear) por time
    // precisa deste.
    index('event_participants_teamId_idx').on(table.teamId)
  ]
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
  (table) => [
    primaryKey({ columns: [table.userId, table.sportId] }),
    // Mesma razão: a PK composta começa por user_id.
    index('user_preference_sports_sportId_idx').on(table.sportId)
  ]
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
  (table) => [
    primaryKey({ columns: [table.userId, table.barId] }),
    // A PK composta só serve para busca começando por user_id; listar quem
    // favoritou um bar precisa deste.
    index('user_favorite_bars_barId_idx').on(table.barId)
  ]
)

export const subscription = pgTable('subscription', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  barId: text('bar_id')
    .notNull()
    .unique()
    .references(() => bar.id, { onDelete: 'cascade' }),
  plan: subscriptionPlanEnum('plan').notNull().default('starter'),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  dodoSubscriptionId: text('dodo_subscription_id').unique(),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()
})

// Relations — idênticas ao original
export const barRelations = relations(bar, ({ one, many }) => ({
  user: one(user, { fields: [bar.userId], references: [user.id] }),
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
  sport: one(sport, { fields: [team.sportId], references: [sport.id] }),
  eventParticipants: many(eventParticipants)
}))

export const eventRelations = relations(event, ({ one, many }) => ({
  bar: one(bar, { fields: [event.barId], references: [bar.id] }),
  sport: one(sport, { fields: [event.sportId], references: [sport.id] }),
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
    bar: one(bar, { fields: [userFavoriteBars.barId], references: [bar.id] })
  })
)

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  bar: one(bar, { fields: [subscription.barId], references: [bar.id] })
}))
