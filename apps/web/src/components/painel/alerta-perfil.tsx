import {
  PROFILE_ALERT_DISMISS_DAYS,
  type ProfileAlert
} from '@findsports_oficial/db/profile-alerts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { usePlanAvisosVisiveis } from './avisos'
import { usePasseio, usePrimeirosPassosVisivel } from './passeio'

/*
 * Alerta de perfil do bar no topo das telas do painel (design "Alerta", no
 * jeito do Alert do shadcn): um assunto por vez, vindo de
 * `pub.getProfileAlert`. O link leva a Meu espaço já no campo (`#<id>`, que
 * `useIrParaCampo` rola e foca); o X é o "Agora não" de 3 dias. Fica fora de
 * Meu espaço, e cede o lugar ao card "Primeiros passos" e aos avisos do
 * plano da tela. Erro na leitura não mostra nada: é sugestão.
 */

export const ALERTA_TEXTO: Record<
  ProfileAlert,
  { titulo: string; texto: string; acao: string; campo: string }
> = {
  horario: {
    titulo: 'Seu bar está sem horário de funcionamento',
    texto: 'Sem ele, o app não mostra se vocês estão abertos agora.',
    acao: 'Informar horário',
    campo: 'esp-hor'
  },
  whatsapp: {
    titulo: 'O botão de WhatsApp não aparece no seu perfil',
    texto:
      'Confirme que o telefone do bar recebe mensagem para o torcedor poder chamar.',
    acao: 'Confirmar WhatsApp',
    campo: 'esp-wpp'
  },
  oferta: {
    titulo: 'Seu bar está sem oferta da casa',
    texto: 'Quem filtra por “Oferta da casa” na busca não encontra o seu bar.',
    acao: 'Escrever a oferta',
    campo: 'esp-oferta'
  },
  cardapio: {
    titulo: 'Seu bar está sem cardápio',
    texto:
      'Com o link, o torcedor confere o que tem e quanto custa antes de sair de casa.',
    acao: 'Adicionar cardápio',
    campo: 'esp-menu'
  },
  descricao: {
    titulo: 'Seu perfil está sem descrição',
    texto:
      'Duas linhas sobre a casa em dia de jogo ajudam quem não conhece a escolher.',
    acao: 'Escrever descrição',
    campo: 'esp-desc'
  },
  times: {
    titulo: 'Você ainda não marcou os times da casa',
    texto: 'Os jogos deles passam a vir primeiro nas sugestões da semana.',
    acao: 'Escolher os times',
    campo: 'esp-tdc'
  }
}

/** "19 nov": o dia em que o assunto volta, no relógio de Brasília. */
export function diaDaVolta(now = new Date()): string {
  const volta = new Date(
    now.getTime() + PROFILE_ALERT_DISMISS_DAYS * 86_400_000
  )
  const partes = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Sao_Paulo'
  }).formatToParts(volta)
  const dia = partes.find((p) => p.type === 'day')?.value ?? ''
  const mes = (partes.find((p) => p.type === 'month')?.value ?? '').replace(
    '.',
    ''
  )
  return `${dia} ${mes}`
}

function useAlertaCabe(pathname: string): boolean {
  const passos = usePrimeirosPassosVisivel()
  const plano = usePlanAvisosVisiveis()
  const { ativo } = usePasseio()
  if (ativo || pathname === '/admin/meu-espaco') return false
  if (pathname === '/admin') return !passos && !plano.hoje
  if (pathname === '/admin/jogos') return !plano.jogos
  return true
}

export function AlertaDePerfil() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const cabe = useAlertaCabe(pathname)
  // Só lê quando pode mostrar: a leitura marca o assunto como visto hoje.
  const { data } = useQuery({
    ...trpc.pub.getProfileAlert.queryOptions(),
    enabled: cabe,
    meta: { errorToast: false }
  })
  const dispensar = useMutation(
    trpc.pub.dismissProfileAlert.mutationOptions({
      meta: { errorToast: false }
    })
  )

  const alerta = data?.alert ?? null
  if (!cabe || !alerta) return null
  const a = ALERTA_TEXTO[alerta]

  const agoraNao = async () => {
    const key = trpc.pub.getProfileAlert.queryKey()
    const antes = queryClient.getQueryData(key)
    queryClient.setQueryData(key, { alert: null })
    try {
      await dispensar.mutateAsync({ alert: alerta })
      toast(`Tudo bem. Lembramos de novo em ${diaDaVolta()}.`)
    } catch (error) {
      queryClient.setQueryData(key, antes)
      toast.error(
        getUserFacingMessage(
          error,
          'Não deu para dispensar o aviso. Tente de novo.'
        )
      )
    }
  }

  return (
    <div className="pn-wa" role="status">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      <div className="pn-wa-t">
        <b>{a.titulo}</b>
        <p>
          {a.texto}{' '}
          <Link to="/admin/meu-espaco" hash={a.campo} className="pn-wa-go">
            {a.acao}
          </Link>
        </p>
      </div>
      <button
        type="button"
        className="pn-wa-x"
        aria-label={`Agora não (volta em ${PROFILE_ALERT_DISMISS_DAYS} dias)`}
        onClick={() => void agoraNao()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  )
}

/**
 * Meu espaço aberto por `#<id>` (o link do alerta): rola até o campo e o
 * foca. Cabeçalho de seção (`esp-hor`, `esp-tdc`) foca o primeiro controle dela.
 * A seção pode chegar depois (plano carregando), então tenta por ~2 s.
 */
export function irParaCampo(id: string): () => void {
  let tentativas = 0
  let frame = 0
  const tentar = () => {
    const el = document.getElementById(id)
    if (!el) {
      if (++tentativas < 120) frame = requestAnimationFrame(tentar)
      return
    }
    const campo = el.matches('input, textarea, button')
      ? el
      : el
          .closest('section')
          ?.querySelector<HTMLElement>('input, textarea, button')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    campo?.focus({ preventScroll: true })
  }
  frame = requestAnimationFrame(tentar)
  return () => cancelAnimationFrame(frame)
}
