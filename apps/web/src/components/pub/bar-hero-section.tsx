import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useState } from 'react'
import Call from 'reicon-react/icons/Call'
import Check from 'reicon-react/icons/Check'
import Compass from 'reicon-react/icons/Compass'
import Copy from 'reicon-react/icons/Copy'
import Heart from 'reicon-react/icons/Heart'
import Link from 'reicon-react/icons/Link'
import Location from 'reicon-react/icons/Location'
import Share from 'reicon-react/icons/Share'
import { formatStoredPhone } from '@/utils/format-phone'

type Participant = { team: { name: string } }

type Event = {
  id: string
  championship: string
  participants: Participant[]
}

type Bar = {
  id: string
  name: string
  address: string
  neighborhood: string
  phone?: string | null
  description?: string | null
  photoUrl?: string | null
}

type Props = {
  bar: Bar
  liveEvent?: Event
  isFavorited?: boolean
  favoritePending?: boolean
  favoriteDisabled?: boolean
  favoriteHint?: string
  onDirections: () => void
  onFavorite: () => void
}

export function BarHeroSection({
  bar,
  liveEvent,
  isFavorited = false,
  favoritePending = false,
  favoriteDisabled = false,
  favoriteHint,
  onDirections,
  onFavorite
}: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const initials = bar.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleCopy = async () => {
    setShareError(null)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShareError('Não foi possível copiar o link.')
    }
  }

  const handleNativeShare = async () => {
    setShareError(null)
    try {
      await navigator.share({ title: bar.name, url: shareUrl })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setShareError('Não foi possível compartilhar.')
      }
    }
  }

  const handleShareClick = () => {
    setShareOpen(true)
  }

  return (
    <>
      <section className="onside-panel-ink relative mb-8 overflow-hidden">
        {liveEvent && (
          <div
            className="h-1.5 w-full bg-[var(--onside-live)]"
            aria-hidden="true"
          />
        )}
        <div className="relative grid items-end gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
          <div className="flex items-start gap-5">
            <div className="size-[88px] shrink-0 overflow-hidden border-2 border-[var(--onside-paper)] bg-[rgb(241_238_230_/_10%)] md:size-[112px]">
              {bar.photoUrl ? (
                <img
                  src={bar.photoUrl}
                  alt={bar.name}
                  width={112}
                  height={112}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center font-bold text-3xl text-[var(--onside-paper)]">
                  {initials}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {liveEvent && (
                <div className="mb-3 inline-flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-live)] uppercase tracking-[0.16em]">
                  <span
                    className="onside-live-dot is-pulse"
                    aria-hidden="true"
                  />
                  Ao vivo ·{' '}
                  {liveEvent.participants.length > 0
                    ? liveEvent.participants.map((p) => p.team.name).join(' × ')
                    : liveEvent.championship}
                </div>
              )}
              <h1 className="onside-display mb-3 break-words text-4xl text-[var(--onside-paper)] md:text-5xl">
                {bar.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-[color-mix(in_srgb,var(--onside-paper)_78%,transparent)] text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Location size={16} color="currentColor" aria-hidden="true" />
                  {bar.address} · {bar.neighborhood}
                </span>
                {bar.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Call size={16} color="currentColor" aria-hidden="true" />
                    {formatStoredPhone(bar.phone)}
                  </span>
                )}
              </div>
              {bar.description && (
                <p className="mt-3 max-w-lg text-[color-mix(in_srgb,var(--onside-paper)_65%,transparent)] text-sm">
                  {bar.description}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={onDirections}
              className="onside-btn onside-btn-acid min-h-11"
            >
              <Compass size={16} color="currentColor" aria-hidden="true" />
              Como chegar
            </button>
            <button
              type="button"
              onClick={onFavorite}
              disabled={favoritePending || favoriteDisabled}
              title={favoriteHint}
              aria-label={
                favoriteHint
                  ? favoriteHint
                  : isFavorited
                    ? 'Remover dos favoritos'
                    : 'Adicionar aos favoritos'
              }
              aria-pressed={isFavorited}
              className={`grid min-h-11 min-w-11 place-items-center border border-[var(--onside-paper)] transition-colors disabled:opacity-50 ${
                isFavorited
                  ? 'bg-[var(--onside-live)] text-[var(--onside-paper)]'
                  : 'bg-transparent text-[var(--onside-paper)] hover:bg-[rgb(241_238_230_/_12%)]'
              }`}
            >
              <Heart
                size={16}
                color="currentColor"
                fill={isFavorited ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={handleShareClick}
              aria-label="Compartilhar bar"
              className="grid min-h-11 min-w-11 place-items-center border border-[var(--onside-paper)] text-[var(--onside-paper)] transition-colors hover:bg-[rgb(241_238_230_/_12%)]"
            >
              <Share size={16} color="currentColor" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="onside-dialog max-w-[calc(100vw-2rem)] rounded-none border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] sm:max-w-lg">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-acid)]">
                <Share size={18} color="currentColor" aria-hidden="true" />
              </div>
              <DialogTitle className="font-bold text-[var(--onside-ink)]">
                Compartilhar bar
              </DialogTitle>
            </div>
            <DialogClose className="min-h-11 min-w-11" />
          </div>

          <p className="mb-4 text-[var(--onside-muted)] text-sm">
            Compartilhe{' '}
            <span className="font-semibold text-[var(--onside-ink)]">
              {bar.name}
            </span>{' '}
            com seus amigos.
          </p>

          {shareError ? (
            <p
              className="mb-3 text-sm text-[var(--onside-live-text)]"
              role="alert"
            >
              {shareError}
            </p>
          ) : null}

          <div className="mb-4 flex flex-col gap-2 border border-[var(--onside-ink)] bg-[var(--onside-stone)] px-4 py-3 sm:flex-row sm:items-center">
            <Link
              size={16}
              color="currentColor"
              className="shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-all font-[family-name:var(--onside-mono)] text-[var(--onside-muted)] text-sm">
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex shrink-0 items-center gap-1.5 border border-[var(--onside-ink)] px-3 py-1.5 font-bold text-xs transition-colors ${
                copied
                  ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                  : 'bg-[var(--onside-paper)] text-[var(--onside-ink)]'
              }`}
            >
              {copied ? (
                <Check size={13} color="currentColor" aria-hidden="true" />
              ) : (
                <Copy size={13} color="currentColor" aria-hidden="true" />
              )}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="onside-btn onside-btn-ink onside-btn-full"
            >
              <Share size={16} color="currentColor" aria-hidden="true" />
              Compartilhar via...
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
