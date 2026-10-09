import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { formatDayLabel } from '@/domain/pub-profile'
import { getGameTitle } from '@/domain/reservation-validation'
import { toastWithUndo } from '@/lib/undo-toast'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Answer = { attended: boolean; offerReceived?: boolean }

/**
 * "Você foi?" depois do jogo (WEB-128): a segunda fonte de comparecimento,
 * ao lado do registro do bar. Uma pergunta por vez e um toque para
 * responder; com oferta congelada na reserva, as opções já trazem o brinde,
 * para continuar sendo um toque só.
 *
 * O card só troca de pergunta quando a resposta grava; se falhar, a pergunta
 * continua ali, com o erro. A confirmação é um aviso com "Desfazer"
 * (WEB-321), que guarda o jogo respondido: desfazer nunca age sobre a
 * pergunta que estiver na tela.
 */
export function AttendanceReportCard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...trpc.attendance.pendingReports.queryOptions(),
    retry: false,
    meta: { errorToast: false }
  })
  const [skipped, setSkipped] = useState<string[]>([])
  // A pergunta desfeita volta na frente das outras: é a que o torcedor quer
  // corrigir.
  const [front, setFront] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Os botões clicados trocam de pergunta; o foco vai para o título, que é o
  // mesmo nó de uma pergunta para a outra.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const open = query.data?.filter(({ eventId }) => !skipped.includes(eventId))
  const item = open?.find(({ eventId }) => eventId === front) ?? open?.[0]

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.attendance.pendingReports.queryKey()
    })
  const undo = useMutation(
    trpc.attendance.removeReport.mutationOptions({
      onSuccess: (_data, { eventId }) => {
        setFront(eventId)
        return refresh()
      }
    })
  )
  const mutation = useMutation(
    trpc.attendance.report.mutationOptions({
      onSuccess: async (_data, { eventId }) => {
        await refresh()
        toastWithUndo('Resposta registrada. Obrigado!', () =>
          undo.mutateAsync({ eventId })
        )
        titleRef.current?.focus()
      },
      onError: (err) =>
        setError(
          getUserFacingMessage(
            err,
            'Não foi possível registrar sua resposta. Tente novamente.'
          )
        )
    })
  )

  const answer = (value: Answer) => {
    if (!item) return
    setError(null)
    mutation.mutate({ eventId: item.eventId, ...value })
  }

  const options: { label: string; value: Answer; primary?: boolean }[] =
    item?.offer
      ? [
          {
            label: 'Fui e recebi',
            value: { attended: true, offerReceived: true },
            primary: true
          },
          {
            label: 'Fui, sem a oferta',
            value: { attended: true, offerReceived: false }
          },
          { label: 'Não fui', value: { attended: false } }
        ]
      : [
          { label: 'Fui', value: { attended: true }, primary: true },
          { label: 'Não fui', value: { attended: false } }
        ]

  return (
    <>
      {item ? (
        <section
          className="onside-panel mb-6 p-4 md:p-5"
          aria-labelledby="attendance-report-title"
        >
          <p className="onside-kicker mb-1">Depois do jogo</p>
          <h2
            id="attendance-report-title"
            ref={titleRef}
            tabIndex={-1}
            className="onside-display text-xl md:text-2xl"
          >
            Você foi ao {item.barName}?
          </h2>
          <p className="mt-1 text-[var(--onside-muted)] text-sm">
            {getGameTitle(item)} · {formatDayLabel(new Date(item.startsAt))} ·{' '}
            {item.neighborhood}
          </p>
          {item.offer ? (
            <p className="mt-2 text-sm [overflow-wrap:anywhere]">
              <span className="font-semibold">Oferta da casa:</span>{' '}
              {item.offer}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {options.map(({ label, value, primary }) => (
              <button
                key={label}
                type="button"
                onClick={() => answer(value)}
                disabled={mutation.isPending}
                className={`onside-btn ${primary ? 'onside-btn-acid' : 'onside-btn-outline'} min-h-11 px-4 text-xs disabled:opacity-60`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSkipped((current) => [...current, item.eventId])
                titleRef.current?.focus()
              }}
              disabled={mutation.isPending}
              className="min-h-11 px-2 font-bold text-[11px] text-[var(--onside-muted)] uppercase tracking-[0.08em] transition-colors hover:text-[var(--onside-ink)]"
            >
              Pular
            </button>
          </div>

          {error ? (
            <p className="onside-field-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="mt-3 text-[var(--onside-muted)] text-xs">
            Opcional. O bar não vê a sua resposta.
          </p>
        </section>
      ) : null}
    </>
  )
}
