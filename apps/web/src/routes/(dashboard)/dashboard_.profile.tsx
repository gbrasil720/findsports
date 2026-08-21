import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import Loader from 'reicon-react/icons/Loader'
import { AppShell } from '@/components/app/app-shell'
import { ProfileFavorites } from '@/components/profile/profile-favorites'
import { ProfileHeader } from '@/components/profile/profile-header'
import { compressProfileImage } from '@/components/profile/profile-image'
import type {
  Favorite,
  FavoriteSort,
  FavoriteView,
  ProfileTab
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
import {
  DEFAULT_RADIUS_KM,
  type RadiusKm,
  SAO_PAULO_FALLBACK,
  SEARCH_RADII
} from '@/domain/discovery'
import { authClient } from '@/lib/auth-client'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/profile')({
  head: () => ({
    meta: [
      { title: 'Meu perfil — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
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
  const preferencesQuery = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const favoritesQuery = useQuery(trpc.pubs.getFavorites.queryOptions())
  const user = sessionQuery.data?.data?.user
  const favorites = favoritesQuery.data ?? []
  const preferences = preferencesQuery.data ?? []
  const sports = sportsQuery.data ?? []
  const userRadius =
    SEARCH_RADII.find((radius) => radius === user?.searchRadiusKm) ??
    DEFAULT_RADIUS_KM
  const recommendationsQuery = useQuery({
    ...trpc.recommendations.get.queryOptions({
      ...(coords ?? SAO_PAULO_FALLBACK),
      radiusKm: userRadius
    }),
    enabled: tab === 'Visão geral'
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
        return { previous }
      },
      onError: (_error, _variables, context) => {
        if (context?.previous) {
          queryClient.setQueryData(favoritesQueryKey, context.previous)
        }
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
    await authClient.updateUser({ name: nameInput.trim() })
    void queryClient.invalidateQueries({ queryKey: ['session'] })
    setEditingName(false)
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
    setUploadingImage(true)
    try {
      await authClient.updateUser({ image: await compressProfileImage(file) })
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
      await authClient.updateUser({ searchRadiusKm: radiusKm })
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
        <div className="flex items-center justify-center py-24 text-[var(--onside-muted)]">
          <Loader size={24} color="currentColor" className="animate-spin" />
        </div>
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
        onNameInputChange={setNameInput}
        onStartEditingName={() => {
          setNameInput(user?.name ?? '')
          setEditingName(true)
        }}
        onCancelEditingName={() => setEditingName(false)}
        onSaveName={() => void handleSaveName()}
        onChooseImage={() => fileInputRef.current?.click()}
      />
      <ProfileTabs activeTab={tab} onChange={handleTabChange} />

      {tab === 'Visão geral' ? (
        <ProfileOverview
          completionItems={completionItems}
          completionScore={getCompletionScore(completionItems)}
          favoritesCount={favorites.length}
          preferencesCount={preferences.length}
          radiusKm={user?.searchRadiusKm ?? 3}
          loadingFavorites={favoritesQuery.isLoading}
          upcomingEvents={upcomingEvents}
          recommendations={recommendationsQuery.data?.recommendations ?? []}
          loadingRecommendations={recommendationsQuery.isLoading}
          recommendationsError={recommendationsQuery.isError}
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
      {tab === 'Favoritos' ? (
        <ProfileFavorites
          favorites={favorites}
          sortedFavorites={sortedFavorites}
          favoritesByCity={favoritesByCity}
          mapBars={mapBars}
          coords={coords}
          loading={favoritesQuery.isLoading}
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
      {tab === 'Configurações' ? (
        <ProfileSettings
          user={user}
          sports={sports}
          preferences={preferences}
          loadingPreferences={preferencesQuery.isLoading}
          editingSports={editingSports}
          selectedSportIds={selectedSportIds}
          savingSports={updatePreferences.isPending}
          sportsError={updatePreferences.error?.message ?? null}
          savingRadius={savingRadius}
          radiusError={radiusError}
          resettingRecommendations={resetRecommendations.isPending}
          recommendationsReset={resetRecommendations.isSuccess}
          recommendationsResetError={
            resetRecommendations.error?.message ?? null
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
    </AppShell>
  )
}
