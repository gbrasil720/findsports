import { amenitiesByGroup } from '@findsports_oficial/api/lib/amenities'
import {
  formatAverageSpend,
  menuUrlHost
} from '@findsports_oficial/db/bar-menu'
import ArrowUpRight from 'reicon-react/icons/ArrowUpRight'
import Check from 'reicon-react/icons/Check'
import Display from 'reicon-react/icons/Display'
import type { Fact } from '@/domain/bar-facts'
import { OwnerNudge } from './owner-notice'

type Props = {
  amenities: number[]
  screenCount: number | null
  description: string | null
  /** `null` quando não informado ou sem Pro/Elite — o servidor decide. */
  menuUrl: string | null
  averageSpendCents: number | null
  facts: Fact[]
  isOwner: boolean
}

/**
 * O que o bar oferece.
 *
 * Substitui a antiga seção "Sobre o bar", que era um título grande com um
 * parágrafo curto embaixo: um bar que escrevia "telas grandes e comida boa"
 * produzia uma caixa quase vazia. O texto livre continua aqui, mas rebaixado
 * — ele agora complementa o que o bar marcou, em vez de ser a seção inteira.
 *
 * A coluna da direita é o que sustenta a seção quando o dono preencheu pouco:
 * são fatos que a Onside deriva da agenda dele, sem pedir nada. Ver
 * `domain/bar-facts.ts`.
 *
 * Fica no fim de propósito: quem chegou por um jogo já decidiu antes daqui, e
 * quem está explorando lê. O cardápio e o gasto médio (WEB-39) entram aqui,
 * como declaração do bar e não como dado da Onside.
 */
export function BarCharacteristics({
  amenities,
  screenCount,
  description,
  menuUrl,
  averageSpendCents,
  facts,
  isOwner
}: Props) {
  const groups = amenitiesByGroup(amenities)
  const hasScreenCount = screenCount !== null && screenCount > 0
  // O aviso ao dono é sobre características e telas; cardápio não o cala.
  const hasAmenities = groups.length > 0 || hasScreenCount
  const hasDeclared =
    hasAmenities || Boolean(menuUrl) || Boolean(averageSpendCents)
  const isEmpty = !hasDeclared && !description && facts.length === 0

  // Sem nada declarado, sem texto e sem agenda, a seção não tem o que dizer —
  // e um título sozinho é pior que a ausência dele. O dono continua vendo,
  // porque para ele o vazio é a informação.
  if (isEmpty && !isOwner) return null

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-4 text-2xl">Características do bar</h2>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="min-w-0 space-y-5">
          <BarMenuInfo
            menuUrl={menuUrl}
            averageSpendCents={averageSpendCents}
          />

          {hasScreenCount && (
            <div className="flex items-center gap-3 border border-[var(--onside-line)] bg-[var(--onside-stone)]/55 px-4 py-3">
              <Display
                size={20}
                color="var(--onside-ink)"
                className="shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <span className="onside-display text-2xl tabular-nums">
                  {screenCount}
                </span>{' '}
                <span className="text-[var(--onside-ink)] text-sm">
                  {screenCount === 1 ? 'tela' : 'telas'} para assistir
                </span>
              </div>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key} className="min-w-0">
              <h3 className="mb-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.16em]">
                {group.label}
              </h3>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.amenities.map((amenity) => (
                  <li
                    key={amenity.id}
                    className="flex items-center gap-2 text-[var(--onside-ink)] text-sm"
                  >
                    <span
                      className="grid size-4 shrink-0 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-acid)]"
                      aria-hidden="true"
                    >
                      <Check size={11} color="var(--onside-ink)" />
                    </span>
                    <span className="min-w-0">{amenity.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {description ? (
            <p className="text-[var(--onside-ink)] text-sm leading-relaxed">
              {description}
            </p>
          ) : null}

          {isOwner && !hasAmenities ? (
            <OwnerNudge
              action={{ label: 'Marcar', to: '/admin', hash: 'admin-espaco' }}
            >
              Sem características marcadas, o torcedor que está explorando não
              sabe o que diferencia o seu bar dos outros da lista.
            </OwnerNudge>
          ) : null}
        </div>

        {facts.length > 0 && (
          <dl className="min-w-0 space-y-3 border-[var(--onside-line)] md:border-l md:pl-5">
            {facts.map((fact) => (
              <div key={fact.key} className="min-w-0">
                <dt className="font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.16em]">
                  {fact.label}
                </dt>
                <dd className="text-[var(--onside-ink)] text-sm">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Só faz sentido ressalvar o que foi declarado. Sem nada marcado, a
          linha seria ruído numa página que já é curta. */}
      {hasDeclared && (
        <p className="mt-5 text-[var(--onside-muted)] text-xs">
          Informações declaradas pelo estabelecimento.
        </p>
      )}
    </section>
  )
}

/**
 * Gasto médio e link do cardápio. Também é a prévia do painel, para o dono ver
 * o formato exato antes de salvar.
 *
 * `0` e `null` não desenham nada: melhor sem bloco do que um `R$ 0,00` que
 * parece preço. O rótulo diz que o valor é do bar, não uma média da Onside.
 */
export function BarMenuInfo({
  menuUrl,
  averageSpendCents
}: {
  menuUrl: string | null
  averageSpendCents: number | null
}) {
  if (!menuUrl && !averageSpendCents) return null
  const host = menuUrl ? menuUrlHost(menuUrl) : ''

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
      {averageSpendCents ? (
        <div className="min-w-0 border border-[var(--onside-line)] bg-[var(--onside-stone)]/55 px-4 py-3">
          <p className="font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.16em]">
            Preço médio por pessoa informado pelo bar
          </p>
          <p className="onside-display text-2xl tabular-nums">
            {formatAverageSpend(averageSpendCents)}
          </p>
        </div>
      ) : null}

      {menuUrl ? (
        <a
          href={menuUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="onside-btn onside-btn-outline min-h-12 min-w-0 justify-between gap-3 px-4 text-left sm:self-center"
        >
          <span className="min-w-0">
            <span className="block text-sm">Ver cardápio</span>
            {/* Quebra em vez de cortar: o fim do domínio é o que diz para
                onde o link leva. */}
            {host ? (
              <span className="block font-normal text-[var(--onside-muted)] text-xs normal-case tracking-normal [overflow-wrap:anywhere]">
                {host}
              </span>
            ) : null}
          </span>
          <span className="sr-only">(site externo, abre em nova aba)</span>
          <ArrowUpRight
            size={16}
            color="currentColor"
            className="shrink-0"
            aria-hidden="true"
          />
        </a>
      ) : null}
    </div>
  )
}
