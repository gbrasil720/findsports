import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type AdminBar = RouterOutputs['pub']['getMe']
export type AdminEvent = RouterOutputs['pub']['getMyEvents'][number]
export type EventCreationPolicy =
  RouterOutputs['pub']['getMyEventCreationPolicy']
export type Subscription = RouterOutputs['pub']['getMySubscription']
export type SubscriptionPlan = NonNullable<Subscription>['plan']

export type EventsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; events: AdminEvent[] }

export type PolicyState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; policy: EventCreationPolicy }

export type PlanState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; plan: SubscriptionPlan }
