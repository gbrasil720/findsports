import Star from 'reicon-react/icons/Star'
import Verified from 'reicon-react/icons/Verified'
import { getBarInitials, getPlanPresentation } from '@/domain/pub-profile'

type Props = {
  name: string
  neighborhood: string
  city: string
  photoUrl: string | null
  plan: string | null
  canFavorite: boolean
  isFavorited: boolean
  favoritePending: boolean
  onToggleFavorite: () => void
}

/**
 * Capa e identidade do bar.
 *
 * Bar sem foto não pode virar um retângulo quebrado nem encolher a página: a
 * capa gerada usa as iniciais e a tipografia da marca, ocupando a mesma
 * altura que a foto ocuparia. Assim o layout não pula quando o bar sobe uma
 * foto depois.
 */
export function BarCover({
  name,
  neighborhood,
  city,
  photoUrl,
  plan,
  canFavorite,
  isFavorited,
  favoritePending,
  onToggleFavorite
}: Props) {
  const presentation = getPlanPresentation(plan)
  const initials = getBarInitials(name)

  return (
    <section className="onside-panel overflow-hidden">
      <div
        className={`relative ${presentation.coverHeight} border-[var(--onside-ink)] border-b-[1.5px]`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`Fachada do ${name}`}
            className="size-full object-cover"
            loading="eager"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[var(--onside-ink)]">
            <span
              className="font-[family-name:var(--onside-display)] text-[64px] leading-none text-[var(--onside-paper)] md:text-[96px]"
              aria-hidden="true"
            >
              {initials}
            </span>
          </div>
        )}

        {presentation.badge && (
          <span
            className={`onside-badge absolute top-3 left-3 ${presentation.badge.className}`}
          >
            <Verified size={12} color="currentColor" aria-hidden="true" />
            {presentation.badge.label}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-4 p-5 md:p-6">
        <div className="min-w-0">
          <h1 className="onside-display text-3xl md:text-4xl">{name}</h1>
          <p className="mt-1 font-[family-name:var(--onside-mono)] text-[11px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            {neighborhood} · {city}
          </p>
        </div>

        {canFavorite && (
          <button
            type="button"
            className={`onside-badge shrink-0 min-h-11 px-3 ${
              isFavorited
                ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                : 'bg-[var(--onside-paper)] text-[var(--onside-ink)]'
            }`}
            onClick={onToggleFavorite}
            disabled={favoritePending}
            aria-pressed={isFavorited}
            aria-label={
              isFavorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
            }
          >
            <Star size={14} color="currentColor" aria-hidden="true" />
            {isFavorited ? 'Favoritado' : 'Favoritar'}
          </button>
        )}
      </div>
    </section>
  )
}
