import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { analytics } from '@/lib/analytics'
import { countLabel } from '@/lib/plural'
import { roleLabel } from '@/lib/roles'
import {
  getUserFacingError,
  getUserFacingMessage
} from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/**
 * Controle de abertura da plataforma (ESC-19).
 *
 * Fica aqui, e não só em `/internal/flags`, porque as duas decisões são a
 * mesma tarefa: liberar as pessoas e abrir a porta. Separá-las em duas telas
 * criaria a chance de fechar o cadastro antes de aprovar alguém — o que
 * tranca todo mundo do lado de fora sem ninguém perceber, já que a página de
 * flags não sabe quantos estão liberados.
 *
 * Por isso o painel mostra as contagens ao lado dos interruptores: fechar com
 * zero liberados é visivelmente errado.
 */

type Props = {
  liberados: number
  pendentes: number
  convitesAtivos: number
  convitesExpirados: number
  ativados: number
  loading?: boolean
}

function Interruptor({
  titulo,
  descricao,
  fechado,
  desabilitado,
  onToggle
}: {
  titulo: string
  descricao: string
  fechado: boolean
  desabilitado: boolean
  onToggle: (proximo: boolean) => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 border border-[var(--onside-ink)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="onside-kicker text-[var(--onside-ink)]">{titulo}</p>
          <p
            className={`onside-display mt-1 text-2xl ${
              fechado ? 'text-[var(--onside-live-text)]' : ''
            }`}
          >
            {fechado ? 'Fechado' : 'Aberto'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={fechado}
          aria-label={`${titulo}: ${fechado ? 'fechado' : 'aberto'}`}
          disabled={desabilitado}
          onClick={() => onToggle(!fechado)}
          className={`min-h-11 shrink-0 border border-[var(--onside-ink)] px-3 py-2 font-bold text-xs transition-colors disabled:opacity-40 ${
            fechado
              ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
              : 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
          }`}
        >
          {fechado ? 'Abrir' : 'Fechar'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-[var(--onside-muted)]">
        {descricao}
      </p>
    </div>
  )
}

export function WaitlistAccessPanel({
  liberados,
  pendentes,
  convitesAtivos,
  convitesExpirados,
  ativados,
  loading = false
}: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const emailId = useId()
  const [convite, setConvite] = useState('')
  const [papel, setPapel] = useState<'fan' | 'pub'>('pub')

  const configQuery = useQuery({
    ...trpc.appConfig.list.queryOptions(),
    meta: { errorToast: false }
  })
  const portaoEntry = configQuery.data?.find(
    (entrada) => entrada.key === 'launch.waitlist_gate'
  )
  const portao = portaoEntry?.valor as { signup: boolean } | undefined
  const campaignQuery = useQuery({
    ...trpc.waitlist.campaignPreview.queryOptions(),
    meta: { errorToast: false }
  })
  const configErrorFeedback = configQuery.error
    ? getUserFacingError(
        configQuery.error,
        'Não foi possível ler o estado do portão.'
      )
    : null
  const campaignErrorFeedback = campaignQuery.error
    ? getUserFacingError(
        campaignQuery.error,
        'Não foi possível ler quem está elegível.'
      )
    : null

  async function recarregarConfig() {
    await queryClient.invalidateQueries({
      queryKey: trpc.appConfig.list.queryKey()
    })
  }

  const salvarPortao = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: recarregarConfig,
      onError: (erro) =>
        toast.error(
          getUserFacingMessage(erro, 'Não foi possível salvar o portão.')
        )
    })
  )

  const convidar = useMutation(
    trpc.waitlist.invite.mutationOptions({
      onSuccess: async (resultado) => {
        analytics.waitlistInviteSent()
        toast.success(
          resultado.criado
            ? `${resultado.email} liberado por convite.`
            : `${resultado.email} já estava liberado.`
        )
        setConvite('')
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.getAll.queryKey()
        })
      },
      onError: async (erro) => {
        toast.error(
          getUserFacingMessage(
            erro,
            'Não foi possível enviar o convite. Tente novamente.'
          )
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.getAll.queryKey()
        })
      }
    })
  )

  const enviarCampanha = useMutation(
    trpc.waitlist.sendLaunchNotice.mutationOptions({
      onSuccess: async (resultado) => {
        analytics.launchNoticeSent(resultado.sent, resultado.failed)
        toast.success(
          `${countLabel(resultado.sent, 'enviado', 'enviados')} · ${countLabel(
            resultado.failed,
            'falhou',
            'falharam'
          )}.`
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.waitlist.campaignPreview.queryKey()
        })
      },
      onError: (erro) =>
        toast.error(
          getUserFacingMessage(
            erro,
            'Não foi possível enviar o aviso. Tente novamente.'
          )
        )
    })
  )

  function alternar(proximo: boolean) {
    if (!portao) return
    const acao = proximo ? 'fechar' : 'abrir'
    if (
      !window.confirm(
        `Deseja ${acao} o cadastro para fãs e bares? Essa ação não envia e-mails.`
      )
    ) {
      return
    }
    salvarPortao.mutate({
      key: 'launch.waitlist_gate',
      value: { signup: proximo }
    })
  }

  const carregando = configQuery.isLoading
  const salvando = salvarPortao.isPending

  /*
   * O botão do aviso ficava cinza ao lado de "N elegíveis" sem dizer por quê,
   * e a razão mais comum não é a contagem: é o cadastro ainda estar fechado.
   * Avisar abertura antes de abrir mandaria todo mundo para uma porta
   * trancada, então o bloqueio é correto — o que faltava era dizê-lo.
   */
  const elegiveis = campaignQuery.data?.eligible ?? 0
  const bloqueioCampanha = campaignQuery.isLoading
    ? 'Lendo quem está elegível…'
    : campaignQuery.isError
      ? (campaignErrorFeedback?.message ??
        'Não foi possível ler quem está elegível.')
      : portao?.signup !== false
        ? 'Abra o cadastro antes de enviar: o aviso leva as pessoas para uma tela de cadastro fechada.'
        : elegiveis === 0
          ? 'Ninguém elegível: todo mundo da lista já recebeu o aviso.'
          : null

  return (
    <section
      className="onside-panel mb-8 p-5 sm:p-6"
      aria-label="Acesso"
      aria-busy={loading || carregando || salvando || undefined}
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="onside-display text-xl">Acesso à plataforma</h2>
        <div className="font-mono text-[11px] text-[var(--onside-muted)]">
          {loading ? (
            <Skeleton className="h-3 w-80 max-w-[60vw]" />
          ) : (
            <>
              {countLabel(liberados, 'liberado', 'liberados')} ·{' '}
              {countLabel(pendentes, 'pendente', 'pendentes')} ·{' '}
              {countLabel(convitesAtivos, 'convite ativo', 'convites ativos')} ·{' '}
              {countLabel(convitesExpirados, 'expirado', 'expirados')} ·{' '}
              {countLabel(ativados, 'ativado', 'ativados')}
            </>
          )}
        </div>
      </header>

      {carregando ? (
        <div
          className="flex flex-col gap-3 border border-[var(--onside-ink)] p-4"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Lendo o estado do portão…</span>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
            <Skeleton className="h-11 w-20" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : portao ? (
        <>
          <div className="flex flex-col gap-4">
            <Interruptor
              titulo="Cadastro"
              descricao="Fechado, só um convite ativa acesso. Aberto, fãs e bares podem criar conta normalmente. Contas já admitidas nunca perdem acesso ao fechar de novo."
              fechado={portao.signup}
              desabilitado={salvando}
              onToggle={alternar}
            />
          </div>

          <p className="mt-4 text-xs text-[var(--onside-muted)]">
            Mudanças valem na hora aqui, e em até 60 segundos nas outras
            instâncias — é o cache que evita uma consulta por requisição.
          </p>
          {portaoEntry?.updatedAt ? (
            <p className="mt-2 font-mono text-[11px] text-[var(--onside-muted)]">
              Última alteração:{' '}
              {new Date(portaoEntry.updatedAt).toLocaleString('pt-BR')} por{' '}
              {portaoEntry.updatedBy ?? 'admin'}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-[var(--onside-live-text)]">
            {configErrorFeedback?.message}
          </p>
          {configErrorFeedback?.retryable ? (
            <button
              type="button"
              className="font-bold text-sm underline underline-offset-2"
              onClick={() => void configQuery.refetch()}
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      )}

      <div
        className="mt-6 border-[var(--onside-line)] border-t pt-5"
        aria-busy={campaignQuery.isLoading || undefined}
      >
        <label
          htmlFor={emailId}
          className="onside-kicker mb-2 block text-[var(--onside-ink)]"
        >
          Liberar quem não está na lista
        </label>
        <p className="mb-3 max-w-prose text-xs text-[var(--onside-muted)]">
          Cria a inscrição já liberada, para convidar alguém direto sem pedir
          que preencha o formulário antes. Fica marcada como “Convite direto”.
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(evento) => {
            evento.preventDefault()
            const email = convite.trim()
            if (email) convidar.mutate({ email, role: papel })
          }}
        >
          <input
            id={emailId}
            type="email"
            required
            value={convite}
            onChange={(evento) => setConvite(evento.target.value)}
            placeholder="pessoa@exemplo.com"
            className="min-h-11 min-w-[16rem] flex-1 border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-3 text-sm"
          />
          <select
            value={papel}
            onChange={(evento) =>
              setPapel(evento.target.value === 'fan' ? 'fan' : 'pub')
            }
            aria-label="Tipo de conta"
            className="min-h-11 border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-3 text-sm"
          >
            <option value="pub">{roleLabel('pub')}</option>
            <option value="fan">{roleLabel('fan')}</option>
          </select>
          <button
            type="submit"
            disabled={convidar.isPending || convite.trim().length === 0}
            className="onside-btn onside-btn-acid min-h-11 text-xs disabled:opacity-40"
          >
            {convidar.isPending ? (
              <Loader
                size={14}
                color="currentColor"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Liberar
          </button>
        </form>
      </div>

      <div className="mt-6 border-[var(--onside-line)] border-t pt-5">
        <p className="onside-kicker text-[var(--onside-ink)]">
          Aviso de abertura
        </p>
        <p className="mt-2 text-xs text-[var(--onside-muted)]">
          {countLabel(elegiveis, 'elegível', 'elegíveis')} ·{' '}
          {countLabel(
            campaignQuery.data?.sent ?? 0,
            'já enviado',
            'já enviados'
          )}{' '}
          · {countLabel(campaignQuery.data?.failed ?? 0, 'falha', 'falhas')}
        </p>
        <button
          type="button"
          disabled={enviarCampanha.isPending || bloqueioCampanha !== null}
          aria-describedby={bloqueioCampanha ? 'campanha-bloqueio' : undefined}
          title={bloqueioCampanha ?? undefined}
          onClick={() => {
            if (
              window.confirm(
                `Enviar o aviso genérico para ${countLabel(elegiveis, 'pessoa elegível', 'pessoas elegíveis')}?`
              )
            ) {
              enviarCampanha.mutate()
            }
          }}
          className="onside-btn onside-btn-acid mt-3 min-h-11 text-xs disabled:opacity-40"
        >
          {enviarCampanha.isPending ? 'Enviando…' : 'Enviar aviso de abertura'}
        </button>
        {bloqueioCampanha ? (
          <p
            id="campanha-bloqueio"
            className="mt-2 max-w-prose text-xs text-[var(--onside-live-text)]"
            role={campaignQuery.isError ? 'alert' : undefined}
          >
            {bloqueioCampanha}
            {campaignErrorFeedback?.retryable ? (
              <button
                type="button"
                className="ml-2 font-bold underline underline-offset-2"
                onClick={() => void campaignQuery.refetch()}
              >
                Tentar novamente
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  )
}
