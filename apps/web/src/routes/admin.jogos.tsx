import { createFileRoute } from '@tanstack/react-router'
import { JogosPage } from '@/components/painel/jogos'

export const Route = createFileRoute('/admin/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Onside' }] }),
  // `?jogo=<id>` abre um jogo (os links de Hoje); `?passados=1`, Passados;
  // `?publicar=<id do catálogo>` põe esse jogo da semana no card (o e-mail
  // da segunda, WEB-433).
  validateSearch: (
    search: Record<string, unknown>
  ): { jogo?: string; passados?: 1; publicar?: string } => ({
    ...(typeof search.jogo === 'string' ? { jogo: search.jogo } : {}),
    ...(typeof search.publicar === 'string'
      ? { publicar: search.publicar }
      : {}),
    ...(search.passados === 1 || search.passados === '1'
      ? { passados: 1 as const }
      : {})
  }),
  component: Jogos
})

function Jogos() {
  const { jogo, passados, publicar } = Route.useSearch()
  return (
    <JogosPage
      key={jogo}
      initialId={jogo}
      passados={passados === 1}
      publicar={publicar}
    />
  )
}
