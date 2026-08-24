import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
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

export function WaitlistAccessPanel({ liberados, pendentes }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const emailId = useId()
  const [convite, setConvite] = useState('')
  const [papel, setPapel] = useState<'fan' | 'pub'>('pub')

  const configQuery = useQuery(trpc.appConfig.list.queryOptions())
  const portao = configQuery.data?.find(
    (entrada) => entrada.key === 'launch.waitlist_gate'
  )?.valor as { signup: boolean } | undefined

  async function recarregarConfig() {
    await queryClient.invalidateQueries({
      queryKey: trpc.appConfig.list.queryKey()
    })
  }

  const salvarPortao = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: recarregarConfig,
      onError: (erro) => toast.error(erro.message)
    })
  )

  const convidar = useMutation(
    trpc.waitlist.invite.mutationOptions({
      onSuccess: async (resultado) => {
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
      onError: (erro) => toast.error(erro.message)
    })
  )

  function alternar(proximo: boolean) {
    if (!portao) return
    salvarPortao.mutate({
      key: 'launch.waitlist_gate',
      value: { signup: proximo }
    })
  }

  const carregando = configQuery.isLoading
  const salvando = salvarPortao.isPending

  return (
    <section className="onside-panel mb-8 p-5 sm:p-6" aria-label="Acesso">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="onside-display text-xl">Acesso à plataforma</h2>
        <p className="font-mono text-[11px] text-[var(--onside-muted)]">
          {liberados} liberados · {pendentes} pendentes
        </p>
      </header>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-[var(--onside-muted)]">
          <Loader
            size={16}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
          Lendo o estado do portão…
        </div>
      ) : portao ? (
        <>
          <div className="flex flex-col gap-4">
            <Interruptor
              titulo="Cadastro"
              descricao="Fechado, só e-mail liberado cria conta. Login de contas existentes nunca é afetado. O modo invite-only do deploy continua soberano."
              fechado={portao.signup}
              desabilitado={salvando}
              onToggle={alternar}
            />
          </div>

          <p className="mt-4 text-xs text-[var(--onside-muted)]">
            Mudanças valem na hora aqui, e em até 60 segundos nas outras
            instâncias — é o cache que evita uma consulta por requisição.
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--onside-live-text)]">
          Não foi possível ler o estado do portão.
        </p>
      )}

      <div className="mt-6 border-[var(--onside-line)] border-t pt-5">
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
            <option value="pub">Bar / Pub</option>
            <option value="fan">Torcedor</option>
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
    </section>
  )
}
