import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import jogosCss from '@/components/painel-jogos/jogos.css?url'
import { JogosPage } from '@/components/painel-jogos/jogos-page'

export const Route = createFileRoute('/admin/jogos')({
  // `?jogo=<id>` abre o jogo; `?novo=1` abre o formulário de jogo novo
  // ("Novo jogo" do Hoje, fim do onboarding).
  validateSearch: (
    search: Record<string, unknown>
  ): { jogo?: string; novo?: 1 } => ({
    ...(typeof search.jogo === 'string' ? { jogo: search.jogo } : {}),
    ...(String(search.novo) === '1' ? { novo: 1 as const } : {})
  }),
  head: () => ({
    meta: [{ title: 'Jogos — Painel do Bar — Onside' }],
    links: [{ rel: 'stylesheet', href: jogosCss }]
  }),
  component: JogosRoute
})

function JogosRoute() {
  const { jogo, novo } = Route.useSearch()
  const navigate = Route.useNavigate()
  const tirarNovo = useCallback(
    () =>
      void navigate({ search: ({ novo: _, ...rest }) => rest, replace: true }),
    [navigate]
  )
  return (
    <JogosPage jogoInicial={jogo} novo={novo === 1} onNovoAberto={tirarNovo} />
  )
}
