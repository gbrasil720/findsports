import { Button } from '@findsports_oficial/ui/components/button'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Monitor from 'reicon-react/icons/Monitor'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { describeDevice } from '@/lib/describe-device'
import {
  getUserFacingError,
  getUserFacingMessage
} from '@/lib/user-facing-error'

type AccountSession = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>['data']
>[number]

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

export function SessionSettings() {
  const { data: current } = authClient.useSession()
  const [revoking, setRevoking] = useState<string | null>(null)
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return result.data ?? []
    },
    meta: { errorToast: false }
  })
  const sessionsErrorFeedback = sessions.error
    ? getUserFacingError(
        sessions.error,
        'Não foi possível carregar os acessos. Tente novamente.'
      )
    : null

  const revoke = async (session: AccountSession) => {
    setRevoking(session.token)
    const result = await authClient.revokeSession({ token: session.token })
    setRevoking(null)
    if (result.error) {
      toast.error(
        getUserFacingMessage(
          result.error,
          'Não foi possível encerrar o acesso.'
        )
      )
      return
    }
    toast.success('Acesso encerrado.')
    await sessions.refetch()
  }

  const revokeOthers = async () => {
    setRevoking('all')
    const result = await authClient.revokeOtherSessions()
    setRevoking(null)
    if (result.error) {
      toast.error(
        getUserFacingMessage(
          result.error,
          'Não foi possível encerrar os outros acessos.'
        )
      )
      return
    }
    toast.success('Todos os outros acessos foram encerrados.')
    await sessions.refetch()
  }

  const ordered = [...(sessions.data ?? [])].sort((left, right) =>
    left.token === current?.session.token
      ? -1
      : right.token === current?.session.token
        ? 1
        : new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
  )
  const otherCount = ordered.filter(
    (session) => session.token !== current?.session.token
  ).length

  return (
    <section className="border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="onside-kicker mb-2">Sessões</p>
          <h2 className="onside-display text-2xl">Acessos ativos</h2>
          <p className="mt-1 text-[var(--onside-muted)] text-sm">
            Dispositivo confiável do 2FA não aparece nesta lista.
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          disabled={otherCount === 0 || revoking !== null}
          onClick={() => void revokeOthers()}
        >
          {revoking === 'all' ? <Spinner data-icon="inline-start" /> : null}
          Encerrar outros acessos
        </Button>
      </div>

      <div
        className="mt-5 flex flex-col gap-3"
        aria-busy={sessions.isLoading || undefined}
        aria-live="polite"
      >
        {sessions.isLoading ? (
          <>
            <span className="sr-only">Carregando acessos ativos…</span>
            {[1, 2].map((item) => (
              <article
                key={item}
                className="flex min-h-[132px] flex-col gap-4 border border-[var(--onside-line)] bg-[var(--onside-stone)] p-4 sm:flex-row sm:items-center"
              >
                <Skeleton className="size-[18px] shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-3/4 max-w-full" />
                  <Skeleton className="h-3 w-full max-w-[28rem]" />
                </div>
                <Skeleton className="h-11 w-24 shrink-0" />
              </article>
            ))}
          </>
        ) : sessions.isError ? (
          <div className="onside-callout onside-callout-danger" role="alert">
            <p>{sessionsErrorFeedback?.message}</p>
            {sessionsErrorFeedback?.retryable ? (
              <Button variant="outline" onClick={() => void sessions.refetch()}>
                Tentar novamente
              </Button>
            ) : null}
          </div>
        ) : ordered.length === 0 ? (
          <p className="text-[var(--onside-muted)] text-sm">
            Nenhum acesso ativo encontrado.
          </p>
        ) : (
          ordered.map((session) => {
            const isCurrent = session.token === current?.session.token
            const device = describeDevice(session.userAgent)
            return (
              <article
                key={session.id}
                className={`flex flex-col gap-4 border p-4 sm:flex-row sm:items-center ${
                  isCurrent
                    ? 'border-[var(--onside-ink)] bg-[var(--onside-acid)]/10'
                    : 'border-[var(--onside-line)] bg-[var(--onside-stone)]'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <Monitor
                    size={18}
                    color="currentColor"
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-sm">{device.label}</h3>
                      {isCurrent ? (
                        <span className="font-bold text-[10px] uppercase tracking-[0.1em]">
                          Este dispositivo
                        </span>
                      ) : null}
                    </div>
                    {/*
                     * A string crua fica, um degrau abaixo: ela é o que
                     * permite conferir um acesso que o rótulo não descreveu
                     * bem — ou que não descreveu nada.
                     */}
                    <p className="mt-1 break-all text-[var(--onside-muted)] text-xs">
                      {session.userAgent ?? 'Navegador não informado'}
                    </p>
                    <p className="mt-2 text-[var(--onside-muted)] text-[11px]">
                      IP {session.ipAddress ?? 'não informado'} · atividade{' '}
                      {formatDate(session.updatedAt)} · expira{' '}
                      {formatDate(session.expiresAt)}
                    </p>
                  </div>
                </div>
                {!isCurrent ? (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={revoking !== null}
                    onClick={() => void revoke(session)}
                  >
                    {revoking === session.token ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    Encerrar
                  </Button>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
