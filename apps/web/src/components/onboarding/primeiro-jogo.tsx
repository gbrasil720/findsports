import type { ReactNode } from 'react'
import { Sparkle } from '@/components/landing/v3/icons'
import { SemanaPraVoce } from '@/components/painel/semana-pra-voce'
import { SugestoesDeJogo } from '@/components/painel/sugestoes-de-jogo'

/*
 * "Seu primeiro jogo" (WEB-501; protótipo `primeiro`): logo depois do "no ar",
 * porque bar sem jogo na grade não aparece nas buscas do dia. Um toque numa
 * sugestão publica; "Escrever o jogo" abre o "Novo jogo" do painel, com o
 * esporte e os times do catálogo. O primeiro jogo publicado não conta no
 * limite do Starter (`countedTowardsLimit`, no servidor).
 */
export function PrimeiroJogo({
  bar,
  heading,
  onPublicado,
  nav
}: {
  /** Com cidade e bairro: os números do jogo da semana falam deles. */
  bar: { name: string; city: string; neighborhood: string }
  heading: (content: ReactNode) => ReactNode
  onPublicado: () => void
  nav: ReactNode
}) {
  return (
    <>
      <span className="ob-k">{bar.name} está no ar</span>
      {heading(
        <>
          Seu primeiro <span className="hl">jogo</span>
        </>
      )}
      <p className="ob-sub">
        Bar sem jogo na grade não aparece nas buscas do dia. Coloque o próximo
        jogo que vai passar: leva 20 segundos.
      </p>
      <div className="ob-free">
        <span className="ib" aria-hidden="true">
          <Sparkle size={20} />
        </span>
        <span>
          <b>Este é por conta da Onside</b>O primeiro jogo não conta no limite
          de jogos de nenhum plano.
        </span>
      </div>
      {/* Com o catálogo, o jogo da semana (WEB-433); sem, os bares perto. */}
      <SemanaPraVoce
        variant="primeiro"
        bar={bar}
        onCreated={onPublicado}
        fallback={
          <SugestoesDeJogo
            className="ob-sgj"
            title={
              <h2 className="ob-k">Jogos que outros bares perto já marcaram</h2>
            }
            hint={
              <p className="ob-note">
                Um toque publica, com o telão e o som do bar. Dá para editar
                depois.
              </p>
            }
            onCreated={onPublicado}
          />
        }
      />
      {nav}
    </>
  )
}
