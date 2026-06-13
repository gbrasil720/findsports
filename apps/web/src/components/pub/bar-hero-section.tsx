import {
  CallIcon,
  Copy01Icon,
  FavouriteIcon,
  LinkCircleIcon,
  MapPinIcon,
  NavigationIcon,
  ShareKnowledgeIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@findsports_oficial/ui/components/dialog'

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
  onDirections: () => void
  onFavorite: () => void
}

export function BarHeroSection({
  bar,
  liveEvent,
  isFavorited = false,
  onDirections,
  onFavorite,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const initials = bar.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNativeShare = () => {
    navigator.share({ title: bar.name, url: shareUrl })
  }

  const handleShareClick = () => {
    setShareOpen(true)
  }

  return (
    <>
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white mb-8">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,31,0.6),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(30,107,255,0.5),transparent_45%)]" />
        <div className="relative p-8 md:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-end">
          {/* Left: avatar + info */}
          <div className="flex gap-5 items-start">
            <div className="size-20 md:size-24 rounded-3xl ring-4 ring-white/20 overflow-hidden shrink-0 bg-white/10">
              {bar.photoUrl ? (
                <img src={bar.photoUrl} alt={bar.name} className="size-full object-cover" />
              ) : (
                <div className="size-full grid place-items-center font-heading font-bold text-3xl text-white/80">
                  {initials}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {liveEvent && (
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-3">
                  <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                  Ao vivo ·{' '}
                  {liveEvent.participants.length > 0
                    ? liveEvent.participants.map((p) => p.team.name).join(' × ')
                    : liveEvent.championship}
                </div>
              )}
              <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-[0.95] mb-3">
                {bar.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <HugeiconsIcon icon={MapPinIcon} size={16} color="currentColor" strokeWidth={1.5} />
                  {bar.address} · {bar.neighborhood}
                </span>
                {bar.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <HugeiconsIcon icon={CallIcon} size={16} color="currentColor" strokeWidth={1.5} />
                    {formatStoredPhone(bar.phone)}
                  </span>
                )}
              </div>
              {bar.description && (
                <p className="text-sm text-white/60 mt-3 max-w-lg">
                  {bar.description}
                </p>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDirections}
              className="bg-brand-orange text-white text-sm font-bold px-5 py-3 rounded-full hover:scale-105 transition-transform shadow-[0_8px_30px_-6px_rgba(255,90,31,0.7)] inline-flex items-center gap-2 min-h-[44px]"
            >
              <HugeiconsIcon icon={NavigationIcon} size={16} color="currentColor" strokeWidth={1.5} /> Como chegar
            </button>
            <button
              type="button"
              onClick={onFavorite}
              className={`p-3 rounded-full backdrop-blur min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${isFavorited ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              <HugeiconsIcon
                icon={FavouriteIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
                fill={isFavorited ? 'currentColor' : 'none'}
              />
            </button>
            <button
              type="button"
              onClick={handleShareClick}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <HugeiconsIcon icon={ShareKnowledgeIcon} size={16} color="currentColor" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </section>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-brand-orange/10 grid place-items-center shrink-0">
                <HugeiconsIcon icon={ShareKnowledgeIcon} size={18} color="currentColor" strokeWidth={1.5} className="text-brand-orange" />
              </div>
              <DialogTitle>Compartilhar bar</DialogTitle>
            </div>
            <DialogClose />
          </div>

          <p className="text-sm text-zinc-500 mb-4">
            Compartilhe <span className="font-semibold text-zinc-800">{bar.name}</span> com seus amigos.
          </p>

          <div className="flex items-center gap-2 bg-zinc-50 ring-1 ring-black/8 rounded-xl px-4 py-3 mb-4">
            <HugeiconsIcon icon={LinkCircleIcon} size={16} color="currentColor" strokeWidth={1.5} className="text-zinc-400 shrink-0" />
            <span className="text-sm text-zinc-600 truncate flex-1 font-mono">{shareUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${copied ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'}`}
            >
              <HugeiconsIcon
                icon={copied ? Tick01Icon : Copy01Icon}
                size={13}
                color="currentColor"
                strokeWidth={1.5}
              />
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full bg-black text-white text-sm font-bold py-3 rounded-xl hover:bg-zinc-800 transition-colors inline-flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={ShareKnowledgeIcon} size={16} color="currentColor" strokeWidth={1.5} />
              Compartilhar via...
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
