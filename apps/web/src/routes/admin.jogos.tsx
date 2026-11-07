import { createFileRoute } from '@tanstack/react-router'
import { JogosPage } from '@/components/painel/jogos'

export const Route = createFileRoute('/admin/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Onside' }] }),
  // `?jogo=<id>` abre um jogo (os links de Hoje); `?passados=1`, Passados.
  validateSearch: (
    search: Record<string, unknown>
  ): { jogo?: string; passados?: 1 } => ({
    ...(typeof search.jogo === 'string' ? { jogo: search.jogo } : {}),
    ...(search.passados === 1 || search.passados === '1'
      ? { passados: 1 as const }
      : {})
  }),
  component: Jogos
})

function Jogos() {
  const { jogo, passados } = Route.useSearch()
  return <JogosPage key={jogo} initialId={jogo} passados={passados === 1} />
}
