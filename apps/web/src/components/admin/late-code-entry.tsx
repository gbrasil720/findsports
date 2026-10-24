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
import { Botao, CabecalhoCard, CampoTexto, Card } from '../painel'

type Props = {
  logLate: (input: { codes: string[] }) => Promise<LateEntryResult[]>
  /** "Faltou lançar?": quem marcou e ainda não foi lançado, por jogo. */
  missing?: NotLoggedGame[]
  /** Depois de lançar, para "Faltou lançar?" e a lista se atualizarem. */
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
  const titleId = `${fieldId}-title`
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
    <Card className="qv-comanda" aria-labelledby={titleId} role="region">
      <CabecalhoCard
        id={titleId}
        titulo="Lançar códigos da comanda"
        meta="Depois do jogo, pela comanda"
      />
      <p className="jogos-dica">
        Digite os códigos que a equipe anotou, um por linha. Vale até 48 h
        depois do fim do jogo, e cada código conta como visita no dia do jogo.
      </p>

      {missing.length ? <MissingList games={missing} /> : null}

      <form
        method="post"
        onSubmit={handleSubmit}
        noValidate
        className="qv-comanda"
      >
        <CampoTexto
          id={fieldId}
          rotulo="Códigos anotados"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder={'K7M·R4P\nH3X·W9T'}
          spellCheck={false}
          autoCapitalize="characters"
          aria-invalid={overLimit || undefined}
          dica={
            overLimit
              ? `Até ${MAX_CODES} códigos por vez. Tire ${codes.length - MAX_CODES}.`
              : 'Não precisa do ponto do meio nem de maiúscula.'
          }
        />
        {mutation.error ? (
          <p className="jogos-erro" role="alert">
            {getUserFacingMessage(
              mutation.error,
              'Não foi possível lançar. Tente de novo.'
            )}
          </p>
        ) : null}
        <div>
          <Botao
            type="submit"
            variante="acid"
            disabled={!codes.length || overLimit || mutation.isPending}
          >
            {mutation.isPending
              ? 'Lançando…'
              : codes.length > 1
                ? `Lançar ${codes.length} códigos`
                : 'Lançar código'}
          </Botao>
        </div>
      </form>

      <div role="status">
        {results ? (
          <div className="qv-comanda">
            <p className="m-0 font-semibold text-sm">
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
    </Card>
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
      <CabecalhoCard titulo={title} nivel={3} tamanho={14} />
      <ul className="qv-resultado" style={{ marginTop: 6 }}>
        {items.map((item) => (
          <li key={item.code}>
            <b className="painel-mono">{formatCode(item.code)}</b>
            <span
              className={item.status === 'logged' ? undefined : 'jogos-erro'}
            >
              {getLateEntryLabel(item.status)}
            </span>
            {item.guestName && item.event ? (
              <span>
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
    <div className="qv-faltou">
      <div>
        <p>
          <b>Faltou lançar?</b>
        </p>
        <p className="jogos-dica">
          Marcaram que iam e ainda não têm código lançado. Confira nas comandas.
        </p>
      </div>
      <ul>
        {games.map((game) => {
          const startsAt = new Date(game.startsAt)
          const closesAt = new Date(game.closesAt)
          return (
            <li key={game.id}>
              <p>
                <b>
                  {game.participantFreeText ?? game.championship} ·{' '}
                  {formatDayLabel(startsAt)}, {formatEventTime(startsAt)}
                </b>
              </p>
              <p className="[overflow-wrap:anywhere]">
                {game.names.join(', ')}
              </p>
              <p className="jogos-dica">
                Dá para lançar até {/* "Hoje" e "Amanhã" no meio da frase. */}
                {formatDayLabel(closesAt).toLowerCase()},{' '}
                {formatEventTime(closesAt)}.
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
