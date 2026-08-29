import { createContext } from '@findsports_oficial/api/context'
import { recordCommercialEvent } from '@findsports_oficial/api/lib/commercial-analytics/recorder'
import {
  COMMERCIAL_EVENT_TYPES,
  type CommercialEventType
} from '@findsports_oficial/api/lib/commercial-analytics/types'
import { createFileRoute } from '@tanstack/react-router'
import { TRPCError } from '@trpc/server'

function isCommercialEventType(value: string): value is CommercialEventType {
  return (COMMERCIAL_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * ESC-02: esta rota lia a sessão duas vezes — uma para os checks de 401/403
 * e outra dentro de `createContext`. O contexto é criado uma vez só; a
 * validação de sessão e papel já é feita por `recordCommercialEvent`, e o
 * código do erro é mapeado para o status HTTP equivalente.
 */
const STATUS_BY_TRPC_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  BAD_REQUEST: 400
}

export const Route = createFileRoute('/api/bar/commercial-event')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          pubId?: string
          type?: string
          sourceEventId?: string
          recommendationRunId?: string
        }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Corpo inválido.' }, { status: 400 })
        }

        const { pubId, type, sourceEventId, recommendationRunId } = body

        if (!pubId || !type) {
          return Response.json(
            { error: 'pubId e type são obrigatórios.' },
            { status: 400 }
          )
        }

        if (!isCommercialEventType(type)) {
          return Response.json(
            { error: 'Tipo de evento inválido.' },
            { status: 400 }
          )
        }

        try {
          const ctx = await createContext({ req: request })
          await recordCommercialEvent(ctx, {
            pubId,
            type,
            sourceEventId: sourceEventId ?? undefined,
            recommendationRunId: recommendationRunId ?? undefined
          })
          return Response.json({ ok: true })
        } catch (err) {
          if (err instanceof TRPCError) {
            return Response.json(
              { error: err.message },
              { status: STATUS_BY_TRPC_CODE[err.code] ?? 400 }
            )
          }

          console.error(
            JSON.stringify({ event: 'commercial_event_route_failed' })
          )
          return Response.json(
            { error: 'Não foi possível registrar o evento.' },
            { status: 500 }
          )
        }
      }
    }
  }
})
