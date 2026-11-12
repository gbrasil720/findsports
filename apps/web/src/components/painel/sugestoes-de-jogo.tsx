import type { GameSuggestion } from '@findsports_oficial/api/lib/game-suggestions/index'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { Add } from '@/components/landing/v3/icons'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { brasiliaDay, brasiliaTime, dayLabel, shiftDay } from './noite'
import { useSugestoesDaSemana } from './semana-pra-voce'

export type SugestaoDeJogo = GameSuggestion

/** "hoje", "amanhã" ou "sáb, 7 nov". */
export function diaDaSugestao(startsAt: string, now = Date.now()): string {
  const day = brasiliaDay(startsAt)
  const today = brasiliaDay(now)
  if (day === today) return 'hoje'
  if (day === shiftDay(today, 1)) return 'amanhã'
  return dayLabel(day)
}

/**
 * "Jogos que outros bares perto já marcaram" (`pub.gameSuggestions`): um
 * toque publica o jogo no bar, com o telão e o som das características dele
 * (o servidor herda quando não vêm, WEB-399). Sem sugestão, ou se a leitura
 * falhar, a seção não aparece e fica o formulário de sempre. Serve ao "Seu
 * primeiro jogo" do cadastro e ao passo Jogos do passeio; as duas telas dão
 * as classes (`className`) e o título.
 */
export function SugestoesDeJogo({
  className,
  title,
  hint,
  onCreated,
  disabled,
  alvo
}: {
  className: string
  title: ReactNode
  hint?: ReactNode
  onCreated?: (sugestao: SugestaoDeJogo) => void
  /** Sem poder criar (limite do Starter): a lista some. */
  disabled?: boolean
  /** O alvo do passeio pelo painel (`data-passeio`). */
  alvo?: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [criando, setCriando] = useState<string | null>(null)
  // A mesma leitura dos jogos da semana (`SemanaPraVoce`): uma ida só.
  const sugestoes = useSugestoesDaSemana()
  const create = useMutation(
    trpc.pub.createEvent.mutationOptions({ meta: { errorToast: false } })
  )

  const lista = (sugestoes.data ?? []).slice(0, 6)
  if (disabled || lista.length === 0) return null

  const publicar = async (sugestao: SugestaoDeJogo) => {
    setCriando(sugestao.key)
    try {
      await create.mutateAsync({
        sportId: sugestao.sportId,
        championship: sugestao.championship,
        startsAt: sugestao.startsAt,
        ...(sugestao.participantIds.length
          ? { participantIds: sugestao.participantIds }
          : {}),
        ...(sugestao.participantFreeText
          ? { participantFreeText: sugestao.participantFreeText }
          : {})
      })
      await Promise.all(
        [
          trpc.pub.getMyEvents.queryKey(),
          trpc.pub.getMyEventCreationPolicy.queryKey(),
          trpc.pub.gameSuggestions.queryKey(),
          trpc.pub.getMe.queryKey()
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      )
      toast.success(
        `${sugestao.title} publicado. Já aparece para quem procura esse jogo perto do bar.`
      )
      onCreated?.(sugestao)
    } catch (error) {
      toast.error(
        getUserFacingMessage(
          error,
          'Não deu para publicar este jogo agora. Tente de novo.'
        )
      )
    } finally {
      setCriando(null)
    }
  }

  return (
    <section
      className={className}
      aria-label="Jogos que outros bares perto já marcaram"
      data-passeio={alvo}
    >
      {title}
      <ul className="sgj-l">
        {lista.map((sugestao) => (
          <li key={sugestao.key}>
            <button
              type="button"
              className="sgj-b"
              disabled={criando !== null}
              aria-busy={criando === sugestao.key}
              onClick={() => void publicar(sugestao)}
            >
              <span className="sgj-h">{brasiliaTime(sugestao.startsAt)}</span>
              <span className="sgj-t">
                <b>{sugestao.title}</b>
                <span>
                  {sugestao.title === sugestao.championship
                    ? diaDaSugestao(sugestao.startsAt)
                    : `${sugestao.championship} · ${diaDaSugestao(sugestao.startsAt)}`}
                </span>
              </span>
              {criando === sugestao.key ? (
                <Loader
                  size={18}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Add size={18} />
              )}
              <span className="sr-only">Publicar</span>
            </button>
          </li>
        ))}
      </ul>
      {hint}
    </section>
  )
}
