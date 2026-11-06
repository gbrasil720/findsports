import { createFileRoute } from '@tanstack/react-router'
import { JogosPage } from '@/components/painel/jogos'

export const Route = createFileRoute('/admin/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Onside' }] }),
  // `?jogo=<id>` abre um jogo (os links de Hoje).
  validateSearch: (search: Record<string, unknown>): { jogo?: string } =>
    typeof search.jogo === 'string' ? { jogo: search.jogo } : {},
  component: Jogos
})

function Jogos() {
  const { jogo } = Route.useSearch()
  return <JogosPage key={jogo} initialId={jogo} />
}
