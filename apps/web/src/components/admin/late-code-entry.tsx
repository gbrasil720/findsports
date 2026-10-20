import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import {
  getLateEntryLabel,
  getRetryableCodes,
  type LateEntryResult,
  type NotLoggedGame,
  splitLateCodes
} from '@/domain/code-confirmation'
import { formatCode } from '@/domain/my-games'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { getUserFacingMessage } from '@/lib/user-facing-error'

type Props = {
  logLate: (input: { codes: string[] }) => Promise<LateEntryResult[]>
  /** "Faltou lançar?": quem marcou e ainda não foi lançado, por jogo. */
  missing?: NotLoggedGame[]
  /** Depois de lançar, para "Faltou lançar?" se atualizar. */
  onLogged?: () => void
}

/** O teto do servidor (`LATE_ENTRY_MAX_CODES`). */
const MAX_CODES = 80

/**
 * Lançar os códigos anotados na comanda (WEB-412), para o bar que confirma
 * depois do jogo. O dono digita ou cola a lista; cada código vira visita na
 * data do jogo. Os que não resolvem voltam para a caixa, para corrigir a letra.
 */
export function LateCodeEntry({ logLate, missing = [], onLogged }: Props) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const [draft, setDraft] = useState('')
  const [results, setResults] = useState<LateEntryResult[] | null>(null)
  const codes = splitLateCodes(draft)
  const overLimit = codes.length > MAX_CODES
  const mutation = useMutation({
    mutationFn: logLate,
    onSuccess: (answer) => {
      setResults(answer)
      setDraft(getRetryableCodes(answer).map(formatCode).join('\n'))
      onLogged?.()
    }
  })
  const logged = results?.filter(({ status }) => status === 'logged') ?? []
  const problems = results?.filter(({ status }) => status !== 'logged') ?? []

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!codes.length || overLimit || mutation.isPending) return
    mutation.mutate({ codes })
  }

  return (
    <section
      className="onside-panel mb-6 p-5 md:p-6"
      aria-labelledby={`${fieldId}-title`}
    >
      <p className="onside-kicker">Depois do jogo, pela comanda</p>
      <h2 id={`${fieldId}-title`} className="onside-display text-2xl">
        Lançar códigos da comanda
      </h2>
      <p className="mt-2 text-[var(--onside-muted)] text-sm">
        Digite os códigos que a equipe anotou, um por linha. Vale até 48 h
        depois do fim do jogo, e cada código conta como visita no dia do jogo.
      </p>

      {missing.length ? <MissingList games={missing} /> : null}

      <form method="post" onSubmit={handleSubmit} noValidate className="mt-4">
        <label htmlFor={fieldId} className="onside-label">
          Códigos anotados
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder={'K7M·R4P\nH3X·W9T'}
          spellCheck={false}
          autoCapitalize="characters"
          className="onside-textarea font-[family-name:var(--onside-mono)] uppercase tracking-[0.15em]"
          aria-describedby={hintId}
          aria-invalid={overLimit || undefined}
        />
        <p id={hintId} className="mt-1.5 text-[var(--onside-muted)] text-xs">
          {overLimit
            ? `Até ${MAX_CODES} códigos por vez. Tire ${codes.length - MAX_CODES}.`
            : 'Não precisa do ponto do meio nem de maiúscula.'}
        </p>
        {mutation.error ? (
          <p className="onside-field-error" role="alert">
            {getUserFacingMessage(
              mutation.error,
              'Não foi possível lançar. Tente de novo.'
            )}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!codes.length || overLimit || mutation.isPending}
          className="onside-btn onside-btn-acid mt-4"
        >
          {mutation.isPending
            ? 'Lançando…'
            : codes.length > 1
              ? `Lançar ${codes.length} códigos`
              : 'Lançar código'}
        </button>
      </form>

      <div role="status">
        {results ? (
          <div className="mt-5 space-y-4">
            <p className="font-semibold text-sm">
              {logged.length === 1
                ? '1 código lançado'
                : `${logged.length} códigos lançados`}
              {problems.length ? ` · ${problems.length} para conferir` : '.'}
            </p>
            {problems.length ? (
              <ResultList title="Para conferir" items={problems} />
            ) : null}
            {logged.length ? (
              <ResultList title="Lançados" items={logged} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ResultList({
  title,
  items
}: {
  title: string
  items: LateEntryResult[]
}) {
  return (
    <div>
      <p className="onside-kicker">{title}</p>
      <ul className="mt-1 divide-y divide-[var(--onside-line)] border-[1.5px] border-[var(--onside-line)]">
        {items.map((item) => (
          <li
            key={item.code}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
          >
            <span className="font-[family-name:var(--onside-mono)] font-bold tracking-[0.15em]">
              {formatCode(item.code)}
            </span>
            <span
              className={
                item.status === 'logged'
                  ? 'text-[var(--onside-ink)]'
                  : 'text-[var(--onside-live-text)]'
              }
            >
              {getLateEntryLabel(item.status)}
            </span>
            {item.guestName && item.event ? (
              <span className="basis-full text-[var(--onside-muted)] text-xs">
                {item.guestName} ·{' '}
                {item.event.participantFreeText ?? item.event.championship} ·{' '}
                {formatDayLabel(new Date(item.event.startsAt))},{' '}
                {formatEventTime(new Date(item.event.startsAt))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Quem marcou que ia e não tem código lançado, só pelo nome: o código está na
 * comanda. Não usa o que o torcedor respondeu no pós-jogo.
 */
function MissingList({ games }: { games: NotLoggedGame[] }) {
  return (
    <div className="onside-callout mt-4">
      <div className="w-full">
        <p className="font-semibold text-sm">Faltou lançar?</p>
        <p className="mt-1 text-[var(--onside-muted)] text-xs">
          Marcaram que iam e ainda não têm código lançado. Confira nas comandas.
        </p>
        <ul className="mt-3 space-y-3">
          {games.map((game) => {
            const startsAt = new Date(game.startsAt)
            const closesAt = new Date(game.closesAt)
            return (
              <li key={game.id} className="text-sm">
                <p className="font-semibold">
                  {game.participantFreeText ?? game.championship} ·{' '}
                  {formatDayLabel(startsAt)}, {formatEventTime(startsAt)}
                </p>
                <p className="[overflow-wrap:anywhere]">
                  {game.names.join(', ')}
                </p>
                <p className="text-[var(--onside-muted)] text-xs">
                  Dá para lançar até {/* "Hoje" e "Amanhã" no meio da frase. */}
                  {formatDayLabel(closesAt).toLowerCase()},{' '}
                  {formatEventTime(closesAt)}.
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
