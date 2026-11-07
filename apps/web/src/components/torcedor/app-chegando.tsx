import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { Ic } from './icones'
import { useTorcedor } from './shell'

/*
 * "O app da Onside está chegando" (`.appc` do protótipo): "Me avise" põe o
 * e-mail da conta na lista (`appWaitlist`); sem sessão passa pela folha de
 * entrar e conclui ao voltar (`agir`). Na lista, diz para qual e-mail vai e
 * deixa sair ("Não quero mais"). Nenhum e-mail sai agora: o aviso é no dia.
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
      <span className="ph2">
        <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
          <circle
            cx="14"
            cy="14"
            r="10.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.2"
          />
          <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
        </svg>
      </span>
      <span aria-live="polite">
        <b>
          {naLista
            ? 'Combinado: avisamos quando o app chegar'
            : 'O app da Onside está chegando'}
        </b>
        <span>
          {naLista
            ? `Um e-mail só, para ${status.data?.email}, no dia em que sair na App Store. Sua conta é a mesma.`
            : 'Tudo o que você faz aqui continua lá, com a mesma conta. Quer saber no dia?'}
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
