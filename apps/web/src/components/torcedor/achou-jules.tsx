import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Jules } from '@/components/jules/jules'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'
import { CONQUISTA_JULES } from './acao'
import { useListaDoApp } from './app-chegando'
import { useTorcedor } from './shell'

/** A busca que acha o Jules: "jules", sem acento, maiúsculas nem espaços. */
export function buscouJules(busca: string) {
  return (
    busca
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase() === 'jules'
  )
}

/**
 * Easter egg do Explorar (WEB-555, desenho aprovado pelo dono em 14/11/2026):
 * quem busca "jules" e não acha jogo vê o próprio, comemorando, no lugar de
 * "Nenhum jogo perto". Ele só aparece e aponta para o app: sem campo de texto
 * nem balão. O botão é o "Me avise" da lista de espera.
 */
export function AchouJules() {
  const { naLista, email, erro, pendente, carregando, tocar } = useListaDoApp({
    jules: true
  })
  const trpc = useTRPC()
  const { logado, avisar } = useTorcedor()
  // Com conta, achar já grava a conquista secreta "Achou o Jules" (WEB-558);
  // o aviso só sai na primeira vez. Sem conta, ela vai pelo "Me avise".
  const achar = useMutation(
    trpc.achievements.findJules.mutationOptions({
      onSuccess: ({ isNew }) => {
        if (isNew) avisar(CONQUISTA_JULES)
      },
      meta: { errorToast: false }
    })
  )

  // O Explorar monta o vazio duas vezes (folha do celular e coluna do
  // computador) e esconde uma pelo CSS: só a que está à vista carrega o palco
  // e conta o evento.
  const caixa = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: uma vez, ao aparecer
  useEffect(() => {
    if (!caixa.current?.offsetParent) return
    setVisivel(true)
    analytics.julesFound('explorar')
    if (logado) achar.mutate({ via: 'web' })
  }, [])

  return (
    <div className="achou-jules" ref={caixa}>
      {visivel ? (
        <Jules estado="done" tinta className="achou-jules-palco" />
      ) : (
        <div className="achou-jules-palco" aria-hidden="true" />
      )}
      <div className="achou-jules-texto" aria-live="polite">
        <span className="achou-jules-k">VOCÊ ACHOU O JULES</span>
        <b>{naLista ? 'Combinado.' : 'Me achou.'}</b>
        <p>
          {naLista
            ? `Avisamos ${email} no dia em que o app sair. Lá eu respondo de verdade.`
            : 'Sou a IA da Onside. Aqui eu só apareço; no app eu respondo de verdade e acho o bar do seu jogo.'}
        </p>
        {erro ? (
          <p className="achou-jules-erro" role="alert">
            {erro}
          </p>
        ) : null}
        {naLista ? null : (
          <button
            type="button"
            className="achou-jules-btn"
            disabled={pendente || carregando}
            onClick={() => {
              analytics.julesWaitlistClicked('explorar')
              tocar()
            }}
          >
            {pendente
              ? 'Combinando…'
              : erro
                ? 'Tentar de novo'
                : 'Me avise quando o app chegar'}
          </button>
        )}
      </div>
    </div>
  )
}
