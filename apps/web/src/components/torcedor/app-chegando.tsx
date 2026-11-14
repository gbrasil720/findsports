import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { Ic } from './icones'
import { useTorcedor } from './shell'
import { TACA_SVG } from './taca-still'

/*
 * "No app, o Jules acha o bar do seu jogo" (`.appc`, versão A da prancha 3 do
 * estudo do Jules: a taça parada, sem animação): "Me avise" põe o
 * e-mail da conta na lista (`appWaitlist`); sem sessão passa pela folha de
 * entrar e conclui ao voltar (`agir`). Na lista, diz para qual e-mail vai e
 * deixa sair ("Não quero mais"). Nenhum e-mail sai agora: o aviso é no dia.
 * O web não conversa com o Jules: o cartão só aponta para o app.
 */
export function AppChegando() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { logado, agir } = useTorcedor()
  const status = useQuery({
    ...trpc.appWaitlist.status.queryOptions(),
    enabled: logado,
    meta: { errorToast: false }
  })
  const opcoes = {
    onSuccess: (dados: { email: string; joined: boolean }) =>
      queryClient.setQueryData(trpc.appWaitlist.status.queryKey(), dados)
  }
  const entrar = useMutation(trpc.appWaitlist.join.mutationOptions(opcoes))
  const sair = useMutation(trpc.appWaitlist.leave.mutationOptions(opcoes))

  const naLista = Boolean(status.data?.joined)
  const acao = naLista ? sair : entrar
  const erro = acao.error
    ? getUserFacingMessage(acao.error, 'Não deu para salvar agora.')
    : null

  const tocar = () => {
    if (!logado) {
      agir({ tipo: 'app', acao: { tipo: 'app' } })
      return
    }
    acao.reset()
    acao.mutate()
  }

  return (
    <div className={`appc${naLista ? ' ok' : ''}`}>
      <span
        className="ph2"
        aria-hidden="true"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG estático gerado, sem dado de usuário
        dangerouslySetInnerHTML={{ __html: TACA_SVG }}
      />
      <span aria-live="polite">
        <b>
          {naLista
            ? 'Combinado: avisamos quando o app chegar'
            : 'No app, o Jules acha o bar do seu jogo'}
        </b>
        <span>
          {naLista
            ? `Um e-mail só, para ${status.data?.email}, no dia em que sair nas lojas. Sua conta é a mesma.`
            : 'Você pede do seu jeito e a IA da Onside responde com os bares que vão passar. Quer saber no dia em que o app sair?'}
        </span>
        {erro ? (
          <span className="tk-aviso" role="alert">
            {erro}
          </span>
        ) : null}
      </span>
      <button
        className={`btn sm ${naLista ? 'b-ghost' : 'b-ink'}`}
        type="button"
        disabled={acao.isPending || (logado && status.isPending)}
        onClick={tocar}
      >
        {naLista ? null : <Ic n="bell" s={18} />}
        {acao.isPending
          ? naLista
            ? 'Saindo…'
            : 'Combinando…'
          : erro
            ? 'Tentar de novo'
            : naLista
              ? 'Não quero mais'
              : 'Me avise'}
      </button>
    </div>
  )
}
