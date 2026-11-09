import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useSession } from '@/hooks/use-session'
import { refreshSessionCache } from '@/lib/auth-client'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  BEM_VINDO_PATH,
  contaRecente,
  lerNovo,
  type Novo,
  semNovo
} from './acao'
import { Ic } from './icones'
import { useTorcedor } from './shell'

/*
 * O card da conta nova por uma ação (WEB-501, protótipo `freshCard`): a ação
 * já está na tela, e o card oferece as preferências em 30 segundos. Aparece
 * com `?novo=` na URL (`destinoContaNova`, `acao.ts`).
 */

/** Título e frase de cada card, os do protótipo (`FRESH`). */
export const CONTA_NOVA: Record<Novo, [string, string]> = {
  vou: [
    'Conta criada e presença marcada',
    'Seu código está aqui e em Meus jogos.'
  ],
  vouc: [
    'Conta criada e presença marcada',
    'Quando chegar ao bar, faça check-in em Meus jogos.'
  ],
  fav: [
    'Conta criada e bar salvo',
    'Ele está em Seus bares, com a semana de jogos.'
  ],
  lembrar: ['Conta criada e lembrete marcado', 'Avisamos 3 h antes do jogo.']
}

/** Conta de antes (mais de um dia) sem onboarding: o mesmo card, sem "Conta criada". */
const SO_A_ACAO: Record<Novo, string> = {
  vou: 'Presença marcada',
  vouc: 'Presença marcada',
  fav: 'Bar salvo',
  lembrar: 'Lembrete marcado'
}

/** O título do card e da tag da tela curta, pela idade da conta da sessão. */
export function tituloContaNova(
  novo: Novo,
  criadaEm: Date | string | undefined,
  agora = new Date()
): string {
  return contaRecente(criadaEm, agora) ? CONTA_NOVA[novo][0] : SO_A_ACAO[novo]
}

export const DEPOIS_AVISO =
  'Tudo bem. Esportes, times e raio ficam em Preferências.'

/**
 * Conclui o onboarding sem escolher nada (o "Depois"): o servidor guarda só
 * `onboardingCompleted`, e o raio fica no padrão da coluna.
 */
export function useConcluirOnboarding() {
  const trpc = useTRPC()
  return useMutation(trpc.onboarding.completeFan.mutationOptions())
}

/** Conclui; já concluído (outra aba) conta como sucesso. Devolve o erro. */
export async function concluirOnboarding(
  concluir: ReturnType<typeof useConcluirOnboarding>,
  input: Parameters<ReturnType<typeof useConcluirOnboarding>['mutateAsync']>[0]
): Promise<string | null> {
  try {
    await concluir.mutateAsync(input)
  } catch (error) {
    if (!mensagemOnboardingJaConcluido(error))
      return getUserFacingMessage(error, 'Não deu para salvar. Tente de novo.')
  }
  await refreshSessionCache()
  return null
}

export function CartaoContaNova() {
  const { href, search } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const { avisar, avisando } = useTorcedor()
  const concluir = useConcluirOnboarding()
  const novo = lerNovo((search as Record<string, unknown>).novo)
  // Um por vez: o card entra quando o último aviso da ação sai, e fica.
  const [pronto, setPronto] = useState<Novo | null>(null)
  useEffect(() => {
    if (novo && !avisando) setPronto(novo)
  }, [novo, avisando])
  if (!novo || pronto !== novo) return null
  const titulo = tituloContaNova(novo, session?.user.createdAt)
  const frase = CONTA_NOVA[novo][1]
  const volta = semNovo(href)

  const depois = async () => {
    const erro = await concluirOnboarding(concluir, {})
    if (erro) return avisar(erro)
    avisar(DEPOIS_AVISO)
    await navigate({ to: volta, replace: true, resetScroll: false })
  }

  return (
    <section className="fresh" aria-labelledby="fr-t">
      <span className="ck" aria-hidden="true">
        <Ic n="check" s={22} />
      </span>
      <span className="tx">
        <b id="fr-t">{titulo}</b>
        <span>
          {frase} Quer que a Onside mostre primeiro o que você curte? Esportes,
          times e até onde você vai: leva 30 segundos.
        </span>
      </span>
      <span className="ac">
        <Link
          className="btn b-acid sm"
          to={BEM_VINDO_PATH}
          search={{ feito: novo, callbackUrl: volta }}
        >
          Escolher agora
        </Link>
        <button
          className="btn sm gh2"
          type="button"
          onClick={depois}
          disabled={concluir.isPending}
        >
          {concluir.isPending ? 'Salvando…' : 'Depois'}
        </button>
      </span>
    </section>
  )
}
