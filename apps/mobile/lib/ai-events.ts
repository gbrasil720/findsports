/*
 * A fronteira do chat da IA (Rodada 24): os tipos do servidor
 * (`packages/api/src/lib/ai/events.ts`), só como tipo. Contrato:
 * `design-ref/specs/r24-contrato.md`.
 *
 * A `key` de cada chip é `<argumento de pubs.search>:<valor>` (`teamIds:<id>`,
 * `amenities:1`, `date:2026-10-22`, `radiusKm:3`, `championship:<nome>`),
 * mais `neighborhood:<bairro>` (filtro da lista) e `origin:<lat>,<lng>`.
 */
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export type {
  ChatBar,
  ChatEvent,
  ConfirmFailure,
  FilterChip,
  Proposal,
  ProposalAction,
  Source
} from '@findsports_oficial/api/lib/ai/events'

export type ConverseInput = inferRouterInputs<AppRouter>['ai']['converse']
export type ConfirmInput = inferRouterInputs<AppRouter>['ai']['confirm']
export type ConfirmResult = inferRouterOutputs<AppRouter>['ai']['confirm']
