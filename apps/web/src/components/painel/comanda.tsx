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
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { brasiliaDay, brasiliaTime, relativeDayLabel } from './noite'

/*
 * Lançar os códigos anotados na comanda (WEB-412), em Quem vai (WEB-501,
 * fase 3): para o bar Elite que confirma depois do jogo. O dono digita ou
 * cola a lista; cada código vira visita na data do jogo, e os que não
 * resolvem voltam para a caixa, para corrigir a letra.
 */

/** O teto do servidor (`LATE_ENTRY_MAX_CODES`). */
const MAX_CODES = 80

type Props = {
  logLate: (input: { codes: string[] }) => Promise<LateEntryResult[]>
  /** "Faltou lançar?": quem marcou e ainda não foi lançado, por jogo. */
  missing?: NotLoggedGame[]
  /** Depois de lançar, para "Faltou lançar?" e a lista se atualizarem. */
  onLogged?: () => void
  today: string
}

function when(date: string, today: string) {
  return `${relativeDayLabel(brasiliaDay(date), today)}, ${brasiliaTime(date)}`
}

export function Comanda({ logLate, missing = [], onLogged, today }: Props) {
  const id = useId()
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!codes.length || overLimit || mutation.isPending) return
    mutation.mutate({ codes })
  }

  return (
    <section
      id="comanda"
      className="pn-card pn-sec pn-comanda"
      aria-labelledby={`${id}-t`}
    >
      <div className="pn-chd">
        <h3 id={`${id}-t`}>Lançar códigos da comanda</h3>
        <small>até 48 h depois do jogo</small>
      </div>
      <p className="pn-note">
        O garçom anotou o código na comanda: digite os códigos, um por linha.
        Cada um conta como visita no dia do jogo.
      </p>

      {missing.length ? (
        <div className="pn-faltou">
          <b>Faltou lançar?</b>
          <p className="pn-hint">
            Marcaram que iam e ainda não têm código lançado. Confira nas
            comandas.
          </p>
          <ul>
            {missing.map((game) => (
              <li key={game.id}>
                <b>
                  {game.participantFreeText ?? game.championship} ·{' '}
                  {when(game.startsAt, today)}
                </b>
                <span className="pn-faltou-n">{game.names.join(', ')}</span>
                <span className="pn-hint">
                  Dá para lançar até {when(game.closesAt, today).toLowerCase()}.
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form method="post" onSubmit={submit} noValidate className="pn-fl">
        <label htmlFor={`${id}-c`} className="pn-fl-l">
          Códigos anotados
        </label>
        <textarea
          id={`${id}-c`}
          className="pn-inp pn-codes"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          placeholder={'K7M·R4P\nH3X·W9T'}
          spellCheck={false}
          autoCapitalize="characters"
          aria-describedby={`${id}-h`}
          aria-invalid={overLimit || undefined}
        />
        <p id={`${id}-h`} className="pn-hint">
          {overLimit
            ? `Até ${MAX_CODES} códigos por vez. Tire ${codes.length - MAX_CODES}.`
            : 'Não precisa do ponto do meio nem de maiúscula.'}
        </p>
        {mutation.error ? (
          <p className="pn-ferr" role="alert">
            {getUserFacingMessage(
              mutation.error,
              'Não foi possível lançar. Tente de novo.'
            )}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            className="pn-btn pn-acid pn-sm"
            disabled={!codes.length || overLimit || mutation.isPending}
          >
            {mutation.isPending
              ? 'Lançando…'
              : codes.length > 1
                ? `Lançar ${codes.length} códigos`
                : 'Lançar código'}
          </button>
        </div>
      </form>

      <div role="status">
        {results ? (
          <div className="pn-lancados">
            <p>
              <b>
                {logged.length === 1
                  ? '1 código lançado'
                  : `${logged.length} códigos lançados`}
              </b>
              {problems.length ? ` · ${problems.length} para conferir` : '.'}
            </p>
            {problems.length ? (
              <Resultados
                title="Para conferir"
                items={problems}
                today={today}
              />
            ) : null}
            {logged.length ? (
              <Resultados title="Lançados" items={logged} today={today} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Resultados({
  title,
  items,
  today
}: {
  title: string
  items: LateEntryResult[]
  today: string
}) {
  return (
    <div>
      <p className="pn-fl-l">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={item.code}>
            <span className="pn-mono pn-code">{formatCode(item.code)}</span>
            <span className={item.status === 'logged' ? '' : 'pn-ferr'}>
              {getLateEntryLabel(item.status)}
            </span>
            {item.guestName && item.event ? (
              <span className="pn-hint">
                {item.guestName} ·{' '}
                {item.event.participantFreeText ?? item.event.championship} ·{' '}
                {when(item.event.startsAt, today)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
