import { and, eq, inArray } from 'drizzle-orm'
import { createDb } from '..'
import {
  bar,
  barCommercialEvent,
  event,
  sport,
  subscription,
  user
} from '../schema'

const FAN_COUNT = 60
const INTERESTED_FAN_COUNT = 24
const SEED_PREFIX = 'analytics-demo'

type CommercialEventInsert = typeof barCommercialEvent.$inferInsert

type DemoEvent = {
  id: string
  championship: string
  participantFreeText: string
  startsAt: Date
}

function daysFrom(anchor: Date, offset: number): Date {
  const date = new Date(anchor)
  date.setUTCDate(date.getUTCDate() + offset)
  date.setUTCHours(12, 0, 0, 0)
  return date
}

function getCommercialDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function rotate<T>(items: T[], offset: number): T[] {
  const normalized = offset % items.length
  return [...items.slice(normalized), ...items.slice(0, normalized)]
}

function buildEventRow({
  barId,
  actorUserId,
  type,
  occurredAt,
  sourceEvent
}: {
  barId: string
  actorUserId: string
  type: CommercialEventInsert['type']
  occurredAt: Date
  sourceEvent?: DemoEvent
}): CommercialEventInsert {
  return {
    id: crypto.randomUUID(),
    barId,
    actorUserId,
    type,
    sourceEventId: sourceEvent?.id,
    sourceEventChampionship: sourceEvent?.championship,
    sourceEventStartsAt: sourceEvent?.startsAt,
    occurredAt,
    commercialDay: getCommercialDay(occurredAt),
    createdAt: occurredAt
  }
}

export function buildAnalyticsDemoRows({
  barId,
  fanIds,
  demoEvents,
  anchor
}: {
  barId: string
  fanIds: string[]
  demoEvents: DemoEvent[]
  anchor: Date
}): CommercialEventInsert[] {
  const rows: CommercialEventInsert[] = []
  const interestedFans = fanIds.slice(0, INTERESTED_FAN_COUNT)

  for (let day = 1; day <= 29; day += 1) {
    const occurredAt = daysFrom(anchor, -day)
    const eventIndex = day <= 8 ? 0 : day <= 17 ? 1 : 2
    const sourceEvent = demoEvents[eventIndex]
    const gameDayBoost = day === 5 ? 18 : day === 13 ? 12 : day === 22 ? 8 : 0
    const visitorCount = 5 + ((day * 3) % 7) + gameDayBoost
    const intentCount = Math.max(2, Math.floor(visitorCount * 0.32))
    const dailyInterested = rotate(interestedFans, day).slice(0, intentCount)
    const remainingVisitors = rotate(fanIds, day * 5)
      .filter((id) => !dailyInterested.includes(id))
      .slice(0, visitorCount - dailyInterested.length)
    const dailyVisitors = [...dailyInterested, ...remainingVisitors]

    for (const actorUserId of dailyVisitors) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId,
          type: 'profile_view',
          occurredAt,
          sourceEvent
        })
      )
    }

    const whatsappCount = Math.max(1, Math.floor(intentCount * 0.65))
    const directionsCount = Math.max(1, Math.floor(intentCount * 0.45))
    const phoneCount = Math.max(1, Math.floor(intentCount * 0.3))

    for (const actorUserId of dailyInterested.slice(0, whatsappCount)) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId,
          type: 'whatsapp_opened',
          occurredAt,
          sourceEvent
        })
      )
    }
    for (const actorUserId of dailyInterested.slice(0, directionsCount)) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId,
          type: 'directions_opened',
          occurredAt,
          sourceEvent
        })
      )
    }
    for (const actorUserId of dailyInterested.slice(0, phoneCount)) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId,
          type: 'phone_clicked',
          occurredAt,
          sourceEvent
        })
      )
    }
  }

  const previousInterestedFans = fanIds.slice(0, 12)
  for (let day = 32; day <= 59; day += 1) {
    const occurredAt = daysFrom(anchor, -day)
    const visitorCount = 3 + ((day * 2) % 4)
    const intentCount = day % 3 === 0 ? 2 : 1
    const dailyInterested = rotate(previousInterestedFans, day).slice(
      0,
      intentCount
    )
    const remainingVisitors = rotate(fanIds, day * 3)
      .filter((id) => !dailyInterested.includes(id))
      .slice(0, visitorCount - dailyInterested.length)

    for (const actorUserId of [...dailyInterested, ...remainingVisitors]) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId,
          type: 'profile_view',
          occurredAt
        })
      )
    }

    const primaryInterestedFan = dailyInterested[0]
    if (primaryInterestedFan) {
      rows.push(
        buildEventRow({
          barId,
          actorUserId: primaryInterestedFan,
          type: day % 2 === 0 ? 'whatsapp_opened' : 'directions_opened',
          occurredAt
        })
      )
    }
  }

  return rows
}

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Analytics demo seed only runs with NODE_ENV=development.')
  }

  const targetEmail = process.env.ANALYTICS_SEED_PUB_EMAIL?.trim().toLowerCase()
  if (!targetEmail) {
    throw new Error(
      'ANALYTICS_SEED_PUB_EMAIL is required. Pass the local pub account email.'
    )
  }

  const database = createDb()
  const targetRows = await database
    .select({
      barId: bar.id,
      barName: bar.name,
      plan: subscription.plan,
      subscriptionStatus: subscription.status
    })
    .from(user)
    .innerJoin(bar, eq(bar.userId, user.id))
    .leftJoin(subscription, eq(subscription.barId, bar.id))
    .where(eq(user.email, targetEmail))
    .limit(1)

  const target = targetRows[0]
  if (!target) {
    throw new Error(`No local bar account found for ${targetEmail}.`)
  }
  if (target.plan !== 'elite' || target.subscriptionStatus !== 'active') {
    throw new Error(
      `The local bar must have an active Elite plan. Current: ${target.plan ?? 'none'}/${target.subscriptionStatus ?? 'none'}.`
    )
  }

  const footballRows = await database
    .select({ id: sport.id })
    .from(sport)
    .where(eq(sport.slug, 'futebol'))
    .limit(1)
  const football = footballRows[0]
  if (!football) {
    throw new Error('Football sport not found. Run db:seed:sports first.')
  }

  const anchor = new Date()
  const demoEvents: DemoEvent[] = [
    {
      id: `${SEED_PREFIX}-${target.barId}-flamengo-palmeiras`,
      championship: '[DEMO] Flamengo × Palmeiras',
      participantFreeText: 'Flamengo × Palmeiras',
      startsAt: daysFrom(anchor, -5)
    },
    {
      id: `${SEED_PREFIX}-${target.barId}-brasil-argentina`,
      championship: '[DEMO] Brasil × Argentina',
      participantFreeText: 'Brasil × Argentina',
      startsAt: daysFrom(anchor, -13)
    },
    {
      id: `${SEED_PREFIX}-${target.barId}-final-libertadores`,
      championship: '[DEMO] Final da Libertadores',
      participantFreeText: 'Final da Libertadores',
      startsAt: daysFrom(anchor, -22)
    }
  ]
  const demoEventIds = demoEvents.map((item) => item.id)
  const fanIds = Array.from(
    { length: FAN_COUNT },
    (_, index) => `${SEED_PREFIX}-fan-${String(index + 1).padStart(3, '0')}`
  )

  await database.transaction(async (tx) => {
    await tx
      .delete(barCommercialEvent)
      .where(
        and(
          eq(barCommercialEvent.barId, target.barId),
          inArray(barCommercialEvent.actorUserId, fanIds)
        )
      )
    await tx
      .delete(event)
      .where(
        and(eq(event.barId, target.barId), inArray(event.id, demoEventIds))
      )
    await tx.delete(user).where(inArray(user.id, fanIds))

    if (process.argv.includes('--clean')) return

    await tx
      .insert(user)
      .values(
        fanIds.map((id, index) => ({
          id,
          name: `Torcedor Demo ${index + 1}`,
          email: `analytics-demo+${String(index + 1).padStart(3, '0')}@onside.local`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }))
      )
      .onConflictDoNothing()

    await tx.insert(event).values(
      demoEvents.map((item) => ({
        ...item,
        barId: target.barId,
        sportId: football.id
      }))
    )

    const analyticsRows = buildAnalyticsDemoRows({
      barId: target.barId,
      fanIds,
      demoEvents,
      anchor
    })

    for (let index = 0; index < analyticsRows.length; index += 500) {
      await tx
        .insert(barCommercialEvent)
        .values(analyticsRows.slice(index, index + 500))
    }
  })

  if (process.argv.includes('--clean')) {
    console.log(`Analytics demo removed from ${target.barName}.`)
    return
  }

  const analyticsRows = buildAnalyticsDemoRows({
    barId: target.barId,
    fanIds,
    demoEvents,
    anchor
  })
  const currentRows = analyticsRows.filter(
    (row) => row.occurredAt >= daysFrom(anchor, -30)
  )
  const counts = currentRows.reduce<Record<string, number>>((result, row) => {
    result[row.type] = (result[row.type] ?? 0) + 1
    return result
  }, {})

  console.log(`Analytics demo seeded for ${target.barName}.`)
  console.log(`${FAN_COUNT} demo fans and ${demoEvents.length} demo games.`)
  console.log(
    `Current period: ${counts.profile_view ?? 0} views, ${counts.whatsapp_opened ?? 0} WhatsApp, ${counts.directions_opened ?? 0} directions, ${counts.phone_clicked ?? 0} phone clicks.`
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Analytics demo seed failed:', error)
    process.exit(1)
  })
}
