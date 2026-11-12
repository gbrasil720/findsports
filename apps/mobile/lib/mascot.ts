import type { Reply } from './ai-chat'

/*
 * Em que pé a taça (a mascote da busca com IA) está, pela resposta que a tela
 * mostra. O palco (`scripts/mascot/stage.ts`) sabe animar cada estado e
 * entrar nele a partir de qualquer outro; aqui só se decide qual.
 */

export type MascotState =
  | 'idle'
  | 'thinking'
  | 'live'
  | 'searching'
  | 'comparing'
  | 'writing'
  | 'done'
  | 'empty'
  | 'awaiting'
  | 'going'
  | 'call'
  | 'remind'
  | 'refused'
  | 'stopped'
  | 'limit'
  | 'down'
  | 'offline'

/** O passo do chat (`step.id` do servidor) e a cena dele. */
const STEP_SCENE: Record<string, MascotState> = {
  understood: 'thinking',
  game: 'live',
  search: 'searching',
  rank: 'comparing'
}

export function mascotState(
  reply: Reply | null,
  ctx: { online: boolean; off: boolean; blocked: boolean }
): MascotState {
  if (!ctx.online) return 'offline'
  if (!reply) return ctx.off ? 'down' : ctx.blocked ? 'limit' : 'idle'
  if (reply.state === 'limit') return 'limit'
  if (reply.state === 'unavailable') return 'down'
  if (reply.state === 'stopped') return 'stopped'

  const decision = reply.decision
  if (decision?.kind === 'sending') return 'thinking'
  if (decision?.kind === 'refused') return 'idle'
  if (decision?.kind === 'approved') {
    const r = decision.result
    if (r.going?.ok) return 'going'
    if (r.call?.ok) return 'call'
    if (r.remind?.ok) return 'remind'
    return 'refused'
  }
  if (reply.proposal) return 'awaiting'

  if (reply.state === 'done') return reply.bars.length ? 'done' : 'empty'
  if (reply.text) return 'writing'
  // O passo mais recente que começou (os "todo" ainda não chegaram).
  const started = reply.steps.filter((s) => s.state !== 'todo')
  const step = started[started.length - 1]
  return (step && STEP_SCENE[step.id]) || 'thinking'
}
