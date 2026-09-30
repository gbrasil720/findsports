import { RESERVATION_CAP_MAX } from '@findsports_oficial/db/reservation-limits'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { getGameTitle } from '@/domain/reservation-validation'
import { countLabel } from '@/lib/plural'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { QueryError } from './query-error'

/**
 * Teto de pessoas por jogo (WEB-152, ADR 0003 "Teto por jogo"): padrão do bar
 * com override por jogo, e os lugares já confirmados diante do teto efetivo.
 */
export function ReservationCapPanel() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...trpc.barReservations.capacity.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    meta: { errorToast: false }
  })
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.barReservations.capacity.queryKey()
    })
  const setDefaultCap = useMutation(
    trpc.barReservations.setDefaultCap.mutationOptions({ onSuccess: refresh })
  )
  const setGameCap = useMutation(
    trpc.barReservations.setGameCap.mutationOptions({ onSuccess: refresh })
  )

  return (
    <section className="onside-panel mb-6 p-5" aria-labelledby="cap-title">
      <h3 id="cap-title" className="font-bold text-lg">
        Teto por jogo
      </h3>
      <p className="mt-1 text-[var(--onside-muted)] text-sm">
        Em pessoas com reserva confirmada. Ao atingir o teto, o perfil para de
        aceitar pedidos novos para o jogo. Pedidos pendentes não contam, e você
        ainda pode confirmar além do teto.
      </p>

      {query.isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : query.isError || !query.data ? (
        <QueryError
          message="Não foi possível carregar o teto por jogo."
          retryable={isRetryableError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <CapForm
            label="Padrão do bar"
            value={query.data.defaultCap}
            placeholder="Sem teto"
            onSave={(reservationCap) =>
              setDefaultCap.mutateAsync({ reservationCap })
            }
          />
          <ul className="mt-4 space-y-3">
            {query.data.games.map((game) => {
              const startsAt = new Date(game.startsAt)
              return (
                <li
                  key={game.id}
                  className="border-[var(--onside-line)] border-t pt-3"
                >
                  <p className="font-semibold text-sm">
                    {getGameTitle(game)} · {formatDayLabel(startsAt)} às{' '}
                    {formatEventTime(startsAt)}
                  </p>
                  <p className="text-[var(--onside-muted)] text-sm">
                    {game.effectiveCap === null
                      ? `${countLabel(game.confirmedSeats, 'lugar confirmado', 'lugares confirmados')}, sem teto`
                      : `${game.confirmedSeats} de ${countLabel(game.effectiveCap, 'lugar confirmado', 'lugares confirmados')}`}
                    {game.soldOut ? ' · pedidos fechados' : ''}
                  </p>
                  <CapForm
                    label="Teto deste jogo"
                    value={game.reservationCap}
                    placeholder={
                      query.data.defaultCap === null
                        ? 'Sem teto'
                        : `Padrão: ${query.data.defaultCap}`
                    }
                    onSave={(reservationCap) =>
                      setGameCap.mutateAsync({
                        eventId: game.id,
                        reservationCap
                      })
                    }
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/** Vazio grava `null`: sem teto no bar, ou volta ao padrão no jogo. */
function CapForm({
  label,
  value,
  placeholder,
  onSave
}: {
  label: string
  value: number | null
  placeholder: string
  onSave: (reservationCap: number | null) => Promise<unknown>
}) {
  const id = useId()
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Inteiro de 1 ao máximo: o `min`/`max` do campo barram o envio antes.
    const cap = draft.trim() === '' ? null : Number(draft)
    setError(null)
    setSaving(true)
    try {
      await onSave(cap)
    } catch (err) {
      setError(
        getUserFacingMessage(
          err,
          'Não foi possível salvar o teto. Tente novamente.'
        )
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-2 flex flex-wrap items-end gap-2"
    >
      <div>
        <label htmlFor={id} className="onside-label">
          {label}
        </label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={RESERVATION_CAP_MAX}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="onside-input w-36"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="onside-btn onside-btn-outline min-h-11 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
      {error ? (
        <p
          id={`${id}-error`}
          className="onside-field-error w-full"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  )
}
