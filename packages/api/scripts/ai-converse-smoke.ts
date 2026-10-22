/**
 * Fumaça do `ai.converse` (R24) contra um web rodando: manda uma pergunta
 * pelo `httpBatchStreamLink`, como o app, e imprime cada evento com o tempo
 * desde o envio. Chama o modelo de verdade (o servidor precisa de
 * `ai.enabled` ligado no banco dele): custa centavos por pergunta.
 *
 *   SERVER_URL=http://localhost:3016 COOKIE='better-auth.session_token=…' \
 *     bun run scripts/ai-converse-smoke.ts "Quero ver o Corinthians hoje"
 *
 * Com CONFIRM=1, confirma a primeira proposta (marcar, chamar, lembrar).
 */

import { createTRPCClient, httpBatchStreamLink } from '@trpc/client'
import type { AppRouter } from '../src/routers/index'

const url = `${process.env.SERVER_URL ?? 'http://localhost:3001'}/api/trpc`
const cookie = process.env.COOKIE
if (!cookie) throw new Error('COOKIE com a sessão de um torcedor.')
const message = process.argv[2] ?? 'Tem jogo hoje com telão perto?'

const client = createTRPCClient<AppRouter>({
  links: [httpBatchStreamLink({ url, headers: { Cookie: cookie } })]
})

const started = performance.now()
const at = () =>
  `${String(Math.round(performance.now() - started)).padStart(6)} ms`
let proposal: { runId: string; id: string } | null = null
let proposalId: string | null = null

const stream = await client.ai.converse.mutate({
  message,
  origin: { lat: -23.5615, lng: -46.6875 },
  placeLabel: 'Vila Madalena',
  day: 'today',
  useTastes: true
})
for await (const event of stream) {
  console.log(at(), JSON.stringify(event))
  if (event.type === 'proposal') proposalId = event.proposal.id
  if (event.type === 'done' && proposalId)
    proposal = { runId: event.runId, id: proposalId }
}

if (process.env.CONFIRM && proposal) {
  const confirmed = await client.ai.confirm.mutate({
    runId: proposal.runId,
    proposalId: proposal.id,
    actions: { going: true, call: true, remind: true }
  })
  console.log(at(), 'confirm', JSON.stringify(confirmed))
}
