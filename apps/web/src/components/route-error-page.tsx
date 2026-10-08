import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  INVITE_ACTION,
  InviteStateArrow,
  InviteStateCta,
  InviteStatePage
} from '@/components/onboarding/invite-state-page'

/**
 * Tela de erro padrão das rotas. Sem ela, falha num `beforeLoad` ou loader
 * caía na tela do TanStack Router: em inglês e com a mensagem crua do erro.
 * Aqui o erro não chega à tela — nem mensagem, nem stack.
 */
export function RouteErrorPage() {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  return (
    <InviteStatePage
      label="Erro ao carregar"
      kicker="Algo deu errado"
      titleTop="Não deu pra"
      titleBottom="abrir a página"
      lead="A página falhou ao carregar. Costuma ser passageiro: tente de novo ou volte para a página inicial."
      score="Situação: jogo interrompido"
      visual={{
        src: '/onside-icone-preto-broken.webp',
        width: 1200,
        height: 936
      }}
    >
      <InviteStateCta
        label={retrying ? 'Tentando…' : 'Tentar de novo'}
        disabled={retrying}
        onClick={() => {
          setRetrying(true)
          // Recarrega `beforeLoad`/loaders e, com isso, desarma o limite de
          // erro. Se falhar de novo, esta tela volta com o botão liberado.
          void router.invalidate().finally(() => setRetrying(false))
        }}
      />
      <Link to="/" className={INVITE_ACTION.secondary}>
        Voltar para a página inicial
        <InviteStateArrow size={14} />
      </Link>
    </InviteStatePage>
  )
}
