import type { bar } from '@findsports_oficial/db/schema/platform'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { InferSelectModel } from 'drizzle-orm'
import { useEffect, useState } from 'react'
import Location from 'reicon-react/icons/Location'
import Star from 'reicon-react/icons/Star'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

// `geo` é coluna derivada de uso exclusivo do índice espacial; a API não a envia.
type Bar = Omit<InferSelectModel<typeof bar>, 'geo' | 'userId'>

type Props = {
  pub: Bar & {
    events: (InferSelectModel<
      typeof import('@findsports_oficial/db/schema/platform').event
    > & {
      sport: InferSelectModel<
        typeof import('@findsports_oficial/db/schema/platform').sport
      >
      participants: {
        team: InferSelectModel<
          typeof import('@findsports_oficial/db/schema/platform').team
        >
      }[]
    })[]
  }
}

export function BarHeroSection({ pub }: Props) {
  const { data: session } = authClient.useSession()
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoritePending, setFavoritePending] = useState(false)
  const trpc = useTRPC()

  const { data: favoriteData } = useQuery({
    ...trpc.pubs.isFavorited.queryOptions({ barId: pub.id }),
    enabled: Boolean(session)
  })

  useEffect(() => {
    if (favoriteData !== undefined) setIsFavorited(favoriteData.isFavorited)
  }, [favoriteData])

  const toggleFavoriteMutation = useMutation(
    trpc.pubs.favorite.mutationOptions({
      onSuccess: () => {
        toast.success('Adicionado aos favoritos')
        setIsFavorited(true)
      },
      onError: (err) => {
        toast.error(err.message || 'Erro ao favoritar')
      }
    })
  )

  const unfavoriteMutation = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onSuccess: () => {
        toast.success('Removido dos favoritos')
        setIsFavorited(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Erro ao remover favorito')
      }
    })
  )

  const handleToggleFavorite = async () => {
    if (!session) {
      toast.info('Faça login para favoritar.')
      return
    }
    setFavoritePending(true)
    try {
      if (isFavorited) {
        await unfavoriteMutation.mutateAsync({ barId: pub.id })
      } else {
        await toggleFavoriteMutation.mutateAsync({ barId: pub.id })
      }
    } catch {
      // errors handled in mutation callbacks
    } finally {
      setFavoritePending(false)
    }
  }

  return (
    <section className="onside-panel p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div className="min-w-0">
          <h1 className="onside-display mb-1 text-3xl">{pub.name}</h1>
          <p className="onside-text-muted-on-paper text-sm">
            {pub.neighborhood}, {pub.city}
          </p>
        </div>
        <button
          type="button"
          className="onside-badge onside-badge-ghost ml-4 shrink-0"
          onClick={handleToggleFavorite}
          disabled={favoritePending}
          aria-label={
            isFavorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
          }
        >
          <Star
            size={16}
            color="currentColor"
            className="text-[var(--onside-muted)]"
            aria-hidden="true"
          />
          <span className="ml-1.5 text-xs">
            {isFavorited ? 'Favoritado' : 'Favoritar'}
          </span>
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="onside-panel-inner p-3">
          <div className="mb-1 flex items-center gap-1.5 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            <Location size={12} color="currentColor" aria-hidden="true" />
            <span>Endereço</span>
          </div>
          <p className="onside-text-on-paper text-sm font-medium truncate">
            {pub.address}
          </p>
        </div>
        <div className="onside-panel-inner p-3">
          <div className="mb-1 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            <span>Bairro</span>
          </div>
          <p className="onside-text-on-paper text-sm font-medium">
            {pub.neighborhood}
          </p>
        </div>
        <div className="onside-panel-inner p-3">
          <div className="mb-1 font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            <span>Cidade</span>
          </div>
          <p className="onside-text-on-paper text-sm font-medium">{pub.city}</p>
        </div>
      </div>

      {pub.description && (
        <p className="onside-text-on-paper text-sm leading-relaxed">
          {pub.description}
        </p>
      )}
    </section>
  )
}
