import { avatarPathname } from '@findsports_oficial/api/lib/blob-avatar'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { upload } from '@vercel/blob/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import { toast } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { ProfileFavorites } from '@/components/profile/profile-favorites'
import { ProfileHeader } from '@/components/profile/profile-header'
import { compressProfileImage } from '@/components/profile/profile-image'
import {
  type Favorite,
  type FavoriteSort,
  type FavoriteView,
  type ProfileTab,
  profileTabId,
  profileTabPanelId
} from '@/components/profile/profile-model'
import { ProfileOverview } from '@/components/profile/profile-overview'
import {
  createFavoriteMapBars,
  getCompletionItems,
  getCompletionScore,
  getProfileInitials,
  groupFavoritesByCity,
  selectUpcomingFavoriteEvents,
  sortAndFilterFavorites
} from '@/components/profile/profile-selectors'
import { ProfileSettings } from '@/components/profile/profile-settings'
import { ProfileTabs } from '@/components/profile/profile-tabs'
import { persistProfileUser } from '@/components/profile/profile-user-update'
import {
  normalizeRadiusKm,
  type RadiusKm,
  SAO_PAULO_FALLBACK
} from '@/domain/discovery'
import { authClient } from '@/lib/auth-client'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { CATALOG_QUERY } from '@/lib/query-cache'
import {
  getUserFacingError,
  getUserFacingMessage,
  isRetryableError
} from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/profile')({
  head: () => ({
    meta: [
      { title: 'Meu perfil — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: ProfilePage
})

function ProfilePage() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const impressionRunIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<ProfileTab>('Visão geral')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [editingSports, setEditingSports] = useState(false)
  const [savingRadius, setSavingRadius] = useState(false)
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [viewMode, setViewMode] = useState<FavoriteView>('list')
  const [sortBy, setSortBy] = useState<FavoriteSort>('upcoming')
  const [filterWithEvents, setFilterWithEvents] = useState(false)
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }),
      () => {}
    )
  }, [])

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => authClient.getSession()
  })
  const sportsQuery = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY
  })
  const preferencesQuery = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    meta: { errorToast: false }
  })
  const favoritesQuery = useQuery({
    ...trpc.pubs.getFavorites.queryOptions(),
    meta: { errorToast: false }
  })
  const user = sessionQuery.data?.data?.user
  const favorites = favoritesQuery.data ?? []
  const preferences = preferencesQuery.data ?? []
  const sports = sportsQuery.data ?? []
  const favoritesErrorFeedback = favoritesQuery.error
    ? getUserFacingError(
        favoritesQuery.error,
        'Não foi possível carregar seus favoritos. Tente novamente.'
      )
    : null
  const preferencesErrorFeedback = preferencesQuery.error
    ? getUserFacingError(
        preferencesQuery.error,
        'Não foi possível carregar seus esportes. Tente novamente.'
      )
    : null
  const recommendationsQuery = useQuery({
    ...trpc.recommendations.get.queryOptions(coords ?? SAO_PAULO_FALLBACK),
    enabled: tab === 'Visão geral',
    meta: { errorToast: false }
  })

  const recordImpressions = useMutation(
    trpc.recommendations.recordImpressions.mutationOptions()
  )
  const recordRecommendationOpen = useMutation(
    trpc.recommendations.recordOpen.mutationOptions()
  )
  const dismissRecommendation = useMutation(
    trpc.recommendations.dismiss.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
    })
  )
  const resetRecommendations = useMutation(
    trpc.recommendations.reset.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
    })
  )

  useEffect(() => {
    const result = recommendationsQuery.data
    if (!result || result.recommendations.length === 0) return
    if (impressionRunIdRef.current === result.runId) return
    impressionRunIdRef.current = result.runId
    recordImpressions.mutate({
      runId: result.runId,
      items: result.recommendations.map((recommendation, index) => ({
        barId: recommendation.bar.id,
        position: index + 1,
        reason: recommendation.reason,
        expandedRadius: recommendation.isExpandedRadius
      }))
    })
  }, [recommendationsQuery.data, recordImpressions.mutate])

  const updatePreferences = useMutation(
    trpc.pubs.updateMyPreferences.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyPreferences.queryKey()
        })
        void queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
        setEditingSports(false)
      }
    })
  )
  const favoritesQueryKey = trpc.pubs.getFavorites.queryKey()
  const unfavorite = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onMutate: async ({ barId }) => {
        await queryClient.cancelQueries({ queryKey: favoritesQueryKey })
        const previous = queryClient.getQueryData<Favorite[]>(favoritesQueryKey)
        queryClient.setQueryData<Favorite[]>(
          favoritesQueryKey,
          (current = []) =>
            current.filter((favorite) => favorite.barId !== barId)
        )
        return {
          previous,
          query: queryClient
            .getQueryCache()
            .find({ queryKey: favoritesQueryKey })
        }
      },
      onError: (error, _variables, context) => {
        if (
          context?.previous &&
          context.query ===
            queryClient.getQueryCache().find({ queryKey: favoritesQueryKey })
        ) {
          queryClient.setQueryData(favoritesQueryKey, context.previous)
        }
        toast.error(
          getUserFacingMessage(
            error,
            'Não foi possível remover o bar dos favoritos. Tente novamente.'
          )
        )
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
        void queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
      }
    })
  )

  const completionItems = useMemo(
    () => getCompletionItems(user, preferences, favorites),
    [user, preferences, favorites]
  )
  const upcomingEvents = useMemo(
    () => selectUpcomingFavoriteEvents(favorites),
    [favorites]
  )
  const sortedFavorites = useMemo(
    () => sortAndFilterFavorites(favorites, sortBy, filterWithEvents),
    [favorites, sortBy, filterWithEvents]
  )
  const favoritesByCity = useMemo(
    () => (sortBy === 'city' ? groupFavoritesByCity(sortedFavorites) : null),
    [sortBy, sortedFavorites]
  )
  const mapBars = useMemo(() => createFavoriteMapBars(favorites), [favorites])

  const handleTabChange = (nextTab: ProfileTab) => {
    setTab(nextTab)
  }
  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    setNameError(null)
    try {
      await persistProfileUser(authClient.updateUser, {
        name: nameInput.trim()
      })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
      setEditingName(false)
    } catch {
      setNameError('Não foi possível salvar o nome. Tente de novo.')
    }
  }
  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageError(null)
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Imagem muito grande. Máximo 5 MB.')
      return
    }
    if (!user?.id) {
      setImageError('Entre na conta para alterar a foto.')
      return
    }
    setUploadingImage(true)
    try {
      const compressed = await compressProfileImage(file)
      const blob = await upload(avatarPathname(user.id), compressed, {
        access: 'public',
        handleUploadUrl: '/api/user/avatar',
        contentType: 'image/jpeg'
      })
      await persistProfileUser(authClient.updateUser, { image: blob.url })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    } catch {
      setImageError('Erro ao processar imagem. Tente novamente.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  const openEditSports = () => {
    setSelectedSportIds(preferences.map((preference) => preference.sportId))
    setEditingSports(true)
  }
  const toggleSport = (sportId: string) => {
    setSelectedSportIds((current) =>
      current.includes(sportId)
        ? current.filter((id) => id !== sportId)
        : [...current, sportId]
    )
  }
  const saveSports = () => {
    if (selectedSportIds.length === 0) return
    updatePreferences.mutate({ sportIds: selectedSportIds })
  }
  const saveRadius = async (radiusKm: RadiusKm) => {
    setSavingRadius(true)
    setRadiusError(null)
    try {
      await persistProfileUser(authClient.updateUser, {
        searchRadiusKm: radiusKm
      })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
      void queryClient.invalidateQueries({
        queryKey: trpc.recommendations.get.queryKey()
      })
    } catch {
      setRadiusError('Não foi possível salvar o raio. Tente de novo.')
    } finally {
      setSavingRadius(false)
    }
  }
  if (sessionQuery.isLoading) {
    return (
      <AppShell variant="fan">
        <ProfilePageSkeleton />
      </AppShell>
    )
  }

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      })
    : null

  return (
    <AppShell variant="fan">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleImageChange}
        aria-label="Escolher foto de perfil"
      />
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-2 font-bold text-[var(--onside-muted)] text-sm hover:text-[var(--onside-ink)]"
      >
        <ArrowLeft size={16} color="currentColor" /> Voltar
      </Link>
      <ProfileHeader
        user={user}
        initials={getProfileInitials(user)}
        memberSince={memberSince}
        editingName={editingName}
        nameInput={nameInput}
        uploadingImage={uploadingImage}
        imageError={imageError}
        nameError={nameError}
        onNameInputChange={(value) => {
          setNameError(null)
          setNameInput(value)
        }}
        onStartEditingName={() => {
          setNameInput(user?.name ?? '')
          setNameError(null)
          setEditingName(true)
        }}
        onCancelEditingName={() => {
          setNameError(null)
          setEditingName(false)
        }}
        onSaveName={() => void handleSaveName()}
        onChooseImage={() => fileInputRef.current?.click()}
      />
      <ProfileTabs activeTab={tab} onChange={handleTabChange} />

      <div
        id={profileTabPanelId('Visão geral')}
        role="tabpanel"
        aria-labelledby={profileTabId('Visão geral')}
        hidden={tab !== 'Visão geral'}
      >
        {tab === 'Visão geral' ? (
          <ProfileOverview
            completionItems={completionItems}
            completionScore={getCompletionScore(completionItems)}
            favoritesCount={favorites.length}
            preferencesCount={preferences.length}
            loadingPreferences={preferencesQuery.isLoading}
            preferencesError={preferencesErrorFeedback?.message ?? null}
            preferencesRetryable={preferencesErrorFeedback?.retryable ?? false}
            onRetryPreferences={() => void preferencesQuery.refetch()}
            radiusKm={normalizeRadiusKm(user?.searchRadiusKm)}
            loadingFavorites={favoritesQuery.isLoading}
            favoritesError={favoritesErrorFeedback?.message ?? null}
            favoritesRetryable={favoritesErrorFeedback?.retryable ?? false}
            onRetryFavorites={() => void favoritesQuery.refetch()}
            upcomingEvents={upcomingEvents}
            recommendations={recommendationsQuery.data?.recommendations ?? []}
            loadingRecommendations={recommendationsQuery.isLoading}
            recommendationsError={recommendationsQuery.isError}
            recommendationsRetryable={isRetryableError(
              recommendationsQuery.error
            )}
            dismissingRecommendation={dismissRecommendation.isPending}
            onRetryRecommendations={() => void recommendationsQuery.refetch()}
            onOpenRecommendation={(barId) => {
              const runId = recommendationsQuery.data?.runId
              if (runId) {
                sessionStorage.setItem(`onside:recommendation:${barId}`, runId)
                recordRecommendationOpen.mutate({ runId, barId })
              }
            }}
            onDismissRecommendation={(barId) => {
              const runId = recommendationsQuery.data?.runId
              if (runId) dismissRecommendation.mutate({ runId, barId })
            }}
            onSelectTab={setTab}
          />
        ) : null}
      </div>

      <div
        id={profileTabPanelId('Favoritos')}
        role="tabpanel"
        aria-labelledby={profileTabId('Favoritos')}
        hidden={tab !== 'Favoritos'}
      >
        {tab === 'Favoritos' ? (
          <ProfileFavorites
            favorites={favorites}
            sortedFavorites={sortedFavorites}
            favoritesByCity={favoritesByCity}
            mapBars={mapBars}
            coords={coords}
            loading={favoritesQuery.isLoading}
            error={favoritesErrorFeedback?.message ?? null}
            retryable={favoritesErrorFeedback?.retryable ?? false}
            onRetry={() => void favoritesQuery.refetch()}
            sortBy={sortBy}
            viewMode={viewMode}
            filterWithEvents={filterWithEvents}
            hoveredBarId={hoveredBarId}
            unfavoritePending={unfavorite.isPending}
            onSortChange={setSortBy}
            onViewModeChange={setViewMode}
            onToggleEventsFilter={() =>
              setFilterWithEvents((current) => !current)
            }
            onHoverBar={setHoveredBarId}
            onSelectBar={(barId) =>
              navigate({ to: '/pub/$pubId', params: { pubId: barId } })
            }
            onUnfavorite={(barId) => unfavorite.mutate({ barId })}
          />
        ) : null}
      </div>

      <div
        id={profileTabPanelId('Configurações')}
        role="tabpanel"
        aria-labelledby={profileTabId('Configurações')}
        hidden={tab !== 'Configurações'}
      >
        {tab === 'Configurações' ? (
          <ProfileSettings
            user={user}
            sports={sports}
            preferences={preferences}
            loadingPreferences={preferencesQuery.isLoading}
            preferencesError={preferencesErrorFeedback?.message ?? null}
            preferencesRetryable={preferencesErrorFeedback?.retryable ?? false}
            onRetryPreferences={() => void preferencesQuery.refetch()}
            editingSports={editingSports}
            selectedSportIds={selectedSportIds}
            savingSports={updatePreferences.isPending}
            sportsError={
              updatePreferences.error
                ? getUserFacingMessage(
                    updatePreferences.error,
                    'Não foi possível salvar seus esportes. Tente novamente.'
                  )
                : null
            }
            savingRadius={savingRadius}
            radiusError={radiusError}
            resettingRecommendations={resetRecommendations.isPending}
            recommendationsReset={resetRecommendations.isSuccess}
            recommendationsResetError={
              resetRecommendations.error
                ? getUserFacingMessage(
                    resetRecommendations.error,
                    'Não foi possível recomeçar suas sugestões. Tente novamente.'
                  )
                : null
            }
            onStartEditingSports={openEditSports}
            onCancelEditingSports={() => setEditingSports(false)}
            onToggleSport={toggleSport}
            onSaveSports={saveSports}
            onRadiusChange={(radiusKm) => void saveRadius(radiusKm)}
            onResetRecommendations={() => {
              if (
                window.confirm(
                  'Recomeçar somente suas sugestões personalizadas? Seus esportes, raio, favoritos e avaliações serão preservados.'
                )
              ) {
                resetRecommendations.mutate()
              }
            }}
          />
        ) : null}
      </div>
    </AppShell>
  )
}

function ProfilePageSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando perfil…</span>
      <Skeleton className="h-5 w-20" />
      <section className="onside-panel-ink onside-shadow-acid p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <Skeleton className="size-24 shrink-0 bg-[var(--onside-paper)]/20" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-32 bg-[var(--onside-paper)]/20" />
            <Skeleton className="h-10 w-64 max-w-full bg-[var(--onside-paper)]/20" />
            <Skeleton className="h-4 w-52 max-w-full bg-[var(--onside-paper)]/20" />
          </div>
          <Skeleton className="h-11 w-28 bg-[var(--onside-paper)]/20" />
        </div>
      </section>
      <div className="flex gap-2" aria-hidden="true">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5"
            aria-hidden="true"
          >
            <Skeleton className="mb-3 size-5" />
            <Skeleton className="h-9 w-14" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <section
        className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6"
        aria-hidden="true"
      >
        <Skeleton className="mb-4 h-6 w-56" />
        <div className="divide-y divide-[var(--onside-line)]">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3 py-3">
              <Skeleton className="size-9 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 max-w-full" />
                <Skeleton className="h-3 w-1/2 max-w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section
        className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6"
        aria-hidden="true"
      >
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-4 h-3 w-72 max-w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="space-y-3 border border-[var(--onside-line)] p-4"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
