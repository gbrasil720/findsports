import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { InstallAppCard } from '@/components/app/install-app-card'
import { AttendanceReportCard } from '@/components/dashboard/attendance-report-card'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import {
  DashboardResults,
  type SuggestionKind
} from '@/components/dashboard/dashboard-results'
import { PendingRatingCard } from '@/components/dashboard/pending-rating-card'
import {
  type ActiveFilter,
  SearchFilterBar,
  type SearchSort
} from '@/components/dashboard/search-filter-bar'
import {
  deriveDiscoveryResultState,
  type FavoriteOverrides,
  filterDiscoveryBars,
  resolveFavoriteIds,
  type SportsState,
  toMapBars
} from '@/domain/dashboard-selectors'
import {
  type LocationState,
  normalizeRadiusKm,
  parseDashboardFilters,
  type RadiusKm,
  SAO_PAULO_FALLBACK,
  serializeDashboardFilters
} from '@/domain/discovery'
import { canRecordCommercialEvents } from '@/domain/viewer'
import { analytics } from '@/lib/analytics'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard')({
  head: () => ({
    meta: [
      { title: 'Bares perto de você — Onside' },
      {
        name: 'description',
        content:
          'Descubra quais bares perto de você estão passando o jogo. Filtre por esporte, campeonato e distância.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: FanDashboard
})

/** Como liberar a localização depois de bloqueada, por navegador. */
const LOCATION_HELP = [
  [
    'Android (Chrome)',
    'toque no ícone à esquerda do endereço → Permissões → Localização → Permitir'
  ],
  [
    'Computador (Chrome)',
    'clique no ícone à esquerda do endereço → Configurações do site → Localização → Permitir'
  ],
  [
    'iPhone/iPad',
    'Ajustes → Privacidade → Serviços de Localização → Safari → Permitir'
  ],
  [
    'Mac (Safari)',
    'Safari → Ajustes → Sites → Localização → permitir este site'
  ]
] as const

/** Quanto o campo de busca espera parado antes de o termo virar requisição. */
const SEARCH_DEBOUNCE_MS = 300

function toggled<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((it) => it !== item)
    : [...list, item]
}

function FanDashboard() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [locationState, setLocationState] = useState<LocationState>('unknown')
  const [sportSlug, setSportSlug] = useState<string>()
  /*
   * `searchText` é o que o campo mostra; `championship` é o termo assentado,
   * o único que vai para a busca e para a URL. Digitar atualizava os dois e
   * disparava um `pubs.search` por tecla.
   */
  const [searchText, setSearchText] = useState('')
  const [championship, setChampionship] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /*
   * O raio da busca começa no raio salvo pelo torcedor, não numa constante da
   * tela. Eram três números diferentes para a mesma preferência: 3 no banco,
   * 5 na busca e o do perfil — quem trocava o raio no perfil voltava ao
   * dashboard e via outro valor marcado.
   */
  const preferredRadiusKm = normalizeRadiusKm(session?.user.searchRadiusKm)
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(preferredRadiusKm)
  const [amenities, setAmenities] = useState<number[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [gamesTodayOnly, setGamesTodayOnly] = useState(false)
  const [favoriteOverrides, setFavoriteOverrides] = useState<FavoriteOverrides>(
    {}
  )
  /*
   * Os filtros moram no hash da URL (WEB-293; formato em `domain/discovery`).
   * No servidor não existe hash: a tela nasce com os padrões, igual ao HTML
   * do SSR, e só então lê a URL — a busca espera por `hashRead` para não sair
   * uma requisição com os filtros errados antes da certa.
   *
   * ponytail: só `hashchange` devolve a URL para o estado, como nas abas do
   * /admin. Um <Link> para o próprio /dashboard limpa a URL sem limpar os
   * filtros, até o próximo filtro mexido; se incomodar, ler `useLocation`.
   */
  const [hashRead, setHashRead] = useState(false)
  const lastHash = useRef('')
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.slice(1)
      // Âncora da página (`#main-content`, do link de pular) não é filtro.
      if (hash && !hash.includes('=')) return
      const filters = parseDashboardFilters(hash, preferredRadiusKm)
      lastHash.current = serializeDashboardFilters(filters, preferredRadiusKm)
      clearTimeout(searchTimer.current)
      setSearchText(filters.championship)
      setChampionship(filters.championship)
      setSportSlug(filters.sportSlug)
      setRadiusKm(filters.radiusKm)
      setAmenities(filters.amenities)
      setTeamIds(filters.teamIds)
      setSort(filters.sort)
      setFavoritesOnly(filters.favoritesOnly)
      setGamesTodayOnly(filters.gamesTodayOnly)
    }
    readHash()
    setHashRead(true)
    window.addEventListener('hashchange', readHash)
    return () => {
      window.removeEventListener('hashchange', readHash)
      clearTimeout(searchTimer.current)
    }
  }, [preferredRadiusKm])
  /*
   * `notify` é o pedido feito por clique. O pedido automático da abertura
   * falha em silêncio — o aviso fixo já explica —, mas quem clicou e não viu
   * nada mudar na tela precisa de resposta na hora (WEB-266).
   */
  const requestLocation = useCallback((notify = false) => {
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
        setLocationState('granted')
      },
      (error) => {
        console.debug('Geolocation unavailable:', error.code)
        const denied = error.code === 1
        setLocationState(denied ? 'denied' : 'unavailable')
        if (!notify) return
        toast.error(
          denied
            ? 'O navegador está bloqueando sua localização. Veja abaixo como liberar.'
            : 'Não foi possível obter sua localização. Tente de novo.'
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    if (!navigator.permissions) {
      requestLocation()
      return
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'granted') requestLocation()
        else if (status.state === 'denied') setLocationState('denied')
        else setLocationState('idle')
      })
      .catch(() => requestLocation())
  }, [requestLocation])

  const sportsQuery = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })
  const sportsState: SportsState = sportsQuery.isLoading
    ? { status: 'loading' }
    : sportsQuery.isError || !sportsQuery.data
      ? {
          status: 'error',
          retry: () => void sportsQuery.refetch(),
          retryable: isRetryableError(sportsQuery.error)
        }
      : { status: 'ready', sports: sportsQuery.data }
  const sports = sportsState.status === 'ready' ? sportsState.sports : []
  // A URL guarda o slug; a busca quer o id, que só o catálogo traduz.
  const selectedSport = sports.find((item) => item.slug === sportSlug)
  const sportId = selectedSport?.id

  // Falha aqui só esconde o filtro de times; a busca segue.
  const myTeamsQuery = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const myTeams = myTeamsQuery.data ?? []
  // Um link compartilhado pode trazer time que este torcedor não acompanha.
  // Sem chip nem botão para desligar, o filtro ficaria preso: só vale o time
  // que a tela consegue mostrar.
  const activeTeamIds = myTeamsQuery.isPending
    ? teamIds
    : teamIds.filter((id) => myTeams.some((team) => team.id === id))

  // A ordenação por nota só existe quando a nota é pública. Falha de leitura
  // cai no lado conservador — sem o controle — porque um botão que ordena
  // por um número que ninguém vê confunde mais do que ajuda.
  const appConfigQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const canSortByRating =
    appConfigQuery.data?.['rating.public_display'] === true
  const searchCenter = coords ?? SAO_PAULO_FALLBACK
  const primaryQuery = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...searchCenter,
      radiusKm,
      sportId,
      championship: championship || undefined,
      amenities: amenities.length > 0 ? amenities : undefined,
      teamIds: activeTeamIds.length > 0 ? activeTeamIds : undefined,
      sort,
      limit: 30
    }),
    // Espera a URL ser lida e, com esporte nela, o catálogo que traduz o slug.
    enabled: hashRead && !(sportSlug && sportsQuery.isLoading),
    meta: { errorToast: false }
  })
  // Termo, esporte ou característica marcada é pedido explícito. Com um deles
  // no ar, "todos os bares por perto" não responde à pergunta feita.
  const hasSearchIntent =
    championship.trim().length > 0 ||
    sportId !== undefined ||
    amenities.length > 0 ||
    activeTeamIds.length > 0
  const primaryEmpty = primaryQuery.data?.bars.length === 0
  const fallbackQuery = useQuery({
    ...trpc.pubs.searchByLocation.queryOptions({
      ...searchCenter,
      radiusKm,
      limit: 30
    }),
    enabled: primaryEmpty && !hasSearchIntent,
    meta: { errorToast: false }
  })
  const favoritesQuery = useQuery(trpc.pubs.getFavorites.queryOptions())

  // Avaliações pendentes deste torcedor. Falha aqui não pode atrapalhar a
  // busca — o card some e a tela segue fazendo o trabalho principal. Só
  // torcedor chega aqui: `applyAuthGuards` tira admin e bar do /dashboard.
  const pendingRatingsQuery = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    retry: false
  })
  const submitRatingMutation = useMutation(
    trpc.ratings.submit.mutationOptions({
      onSuccess: () => {
        toast.success('Obrigado! Sua resposta ajuda outros torcedores.')
        queryClient.invalidateQueries({
          queryKey: trpc.ratings.getPending.queryKey()
        })
      },
      onError: (err) =>
        toast.error(
          getUserFacingMessage(
            err,
            'Não foi possível registrar sua avaliação. Tente novamente.'
          )
        )
    })
  )

  const resultState = useMemo(
    () =>
      deriveDiscoveryResultState({
        primary: primaryQuery,
        fallback: fallbackQuery,
        locationState,
        radiusKm,
        hasSearchIntent
      }),
    [primaryQuery, fallbackQuery, locationState, radiusKm, hasSearchIntent]
  )
  const favoriteIds = useMemo(
    () => resolveFavoriteIds(favoritesQuery.data ?? [], favoriteOverrides),
    [favoritesQuery.data, favoriteOverrides]
  )
  const resultBars = useMemo(
    () => (resultState.status === 'ready' ? resultState.bars : []),
    [resultState]
  )
  const displayedBars = useMemo(
    () =>
      filterDiscoveryBars({
        bars: resultBars,
        favoriteIds,
        favoritesOnly,
        gamesTodayOnly
      }),
    [resultBars, favoriteIds, favoritesOnly, gamesTodayOnly]
  )
  const mapBars = toMapBars(displayedBars)
  // Só torcedor registra evento comercial (WEB-311): com admin personificando
  // o servidor recusaria com 403, então exposição e clique nem são enviados.
  const classicPlacementGuaranteed =
    canRecordCommercialEvents(
      session?.user.role,
      session?.session.impersonatedBy
    ) &&
    sort === 'relevance' &&
    !primaryQuery.isFetching &&
    primaryQuery.data !== undefined &&
    resultState.status === 'ready' &&
    !resultState.fallback

  useEffect(() => {
    if (!classicPlacementGuaranteed) return

    for (const bar of displayedBars) {
      if (
        bar.plan !== 'elite' ||
        !('nextEvent' in bar) ||
        !bar.nextEvent?.classic
      ) {
        continue
      }

      trackCommercialEvent({
        pubId: bar.id,
        type: 'classic_exposure',
        sourceEventId: bar.nextEvent.id
      })
    }
  }, [classicPlacementGuaranteed, displayedBars])

  const favoritesQueryKey = trpc.pubs.getFavorites.queryKey()
  const clearOverride = (barId: string, expected: boolean) => {
    setFavoriteOverrides((current) => {
      if (current[barId] !== expected) return current
      const remaining = { ...current }
      delete remaining[barId]
      return remaining
    })
  }
  const favoriteMutation = useMutation({
    mutationFn: trpc.pubs.favorite.mutationOptions().mutationFn,
    onMutate: ({ barId }) => {
      const previous = favoriteOverrides[barId]
      setFavoriteOverrides((current) => ({ ...current, [barId]: true }))
      return { previous }
    },
    onError: (error, { barId }, context) => {
      setFavoriteOverrides((current) => ({
        ...current,
        [barId]: context?.previous
      }))
      toast.error(
        getUserFacingMessage(
          error,
          'Não foi possível adicionar o bar aos favoritos. Tente novamente.'
        )
      )
    },
    onSettled: async (_data, _error, { barId }) => {
      await queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
      clearOverride(barId, true)
    }
  })
  const unfavoriteMutation = useMutation({
    mutationFn: trpc.pubs.unfavorite.mutationOptions().mutationFn,
    onMutate: ({ barId }) => {
      const previous = favoriteOverrides[barId]
      setFavoriteOverrides((current) => ({ ...current, [barId]: false }))
      return { previous }
    },
    onError: (error, { barId }, context) => {
      setFavoriteOverrides((current) => ({
        ...current,
        [barId]: context?.previous
      }))
      toast.error(
        getUserFacingMessage(
          error,
          'Não foi possível remover o bar dos favoritos. Tente novamente.'
        )
      )
    },
    onSettled: async (_data, _error, { barId }) => {
      await queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
      clearOverride(barId, false)
    }
  })

  /*
   * Digitar não busca a cada tecla: o campo responde na hora e o termo só
   * assenta depois de `SEARCH_DEBOUNCE_MS` parado. Limpar, sugestão e chip
   * assentam na hora — ali não há tecla seguinte para esperar.
   */
  const setSearch = (value: string, settle = true) => {
    clearTimeout(searchTimer.current)
    setSearchText(value)
    if (settle) setChampionship(value)
    else {
      searchTimer.current = setTimeout(
        () => setChampionship(value),
        SEARCH_DEBOUNCE_MS
      )
    }
  }
  const handleSportChange = (id: string | undefined) => {
    setSportSlug(sports.find((item) => item.id === id)?.slug)
  }
  const handleRadiusChange = (value: RadiusKm) => {
    setRadiusKm(value)
  }
  const reset = () => {
    setSportSlug(undefined)
    setSearch('')
    setRadiusKm(preferredRadiusKm)
    setFavoritesOnly(false)
    setGamesTodayOnly(false)
    setAmenities([])
    setTeamIds([])
    setSort('relevance')
  }
  const toggleAmenity = (id: number) => {
    setAmenities((current) => toggled(current, id))
  }
  const toggleTeam = (id: string) => {
    setTeamIds((current) => toggled(current, id))
  }
  const applySuggestion = (kind: SuggestionKind) => {
    if (kind === 'brasileirao') {
      setGamesTodayOnly(true)
      setFavoritesOnly(false)
      setSearch('Brasileirão')
      const football = sports.find((item) => item.slug === 'futebol')
      if (football) handleSportChange(football.id)
    } else if (kind === 'nba') {
      setGamesTodayOnly(false)
      setFavoritesOnly(false)
      setSearch('NBA')
      const basketball = sports.find((item) => item.slug === 'basquete')
      if (basketball) handleSportChange(basketball.id)
    } else {
      reset()
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: analytics fires for a resolved result snapshot, not intermediate filter input
  useEffect(() => {
    if (!primaryQuery.data) return
    analytics.searchPerformed({
      sport: selectedSport?.slug,
      championship: championship || undefined,
      radius_km: radiusKm,
      results_count: primaryQuery.data.bars.length,
      has_location: locationState === 'granted'
    })
  }, [primaryQuery.data])

  /*
   * Estado → URL, com o que está de fato aplicado: slug ou time que o
   * catálogo não conhece sai do link. `replaceState` porque filtro não é
   * navegação — "voltar" tem de sair da busca, não desfazer um chip por vez.
   *
   * O estado da entrada vai junto (`history.state`): é nele que o router
   * guarda a chave da rolagem. Com `null` a chave muda, e tirar o último
   * filtro — URL sem hash — joga a página para o topo.
   */
  const urlHash = serializeDashboardFilters(
    {
      championship,
      sportSlug:
        sportsState.status === 'ready' ? selectedSport?.slug : sportSlug,
      radiusKm,
      amenities,
      teamIds: activeTeamIds,
      sort,
      favoritesOnly,
      gamesTodayOnly
    },
    preferredRadiusKm
  )
  useEffect(() => {
    if (!hashRead || urlHash === lastHash.current) return
    lastHash.current = urlHash
    window.history.replaceState(
      window.history.state,
      '',
      urlHash
        ? `#${urlHash}`
        : window.location.pathname + window.location.search
    )
  }, [hashRead, urlHash])

  const activeFilters: ActiveFilter[] = []
  if (selectedSport) {
    activeFilters.push({
      label: selectedSport.name,
      clear: () => setSportSlug(undefined)
    })
  }
  if (championship) {
    activeFilters.push({
      label: championship,
      clear: () => setSearch('')
    })
  }
  if (radiusKm !== preferredRadiusKm) {
    activeFilters.push({
      label: `Até ${radiusKm} km`,
      clear: () => setRadiusKm(preferredRadiusKm)
    })
  }
  if (favoritesOnly) {
    activeFilters.push({
      label: 'Só favoritos',
      clear: () => setFavoritesOnly(false)
    })
  }
  if (gamesTodayOnly) {
    activeFilters.push({
      label: 'Jogos hoje',
      clear: () => setGamesTodayOnly(false)
    })
  }
  for (const id of activeTeamIds) {
    const selectedTeam = myTeams.find((item) => item.id === id)
    if (!selectedTeam) continue

    activeFilters.push({
      label: selectedTeam.name,
      clear: () => setTeamIds((current) => current.filter((it) => it !== id))
    })
  }
  for (const id of amenities) {
    const amenity = findAmenity(id)
    if (!amenity) continue

    activeFilters.push({
      label: amenity.label,
      clear: () => setAmenities((current) => current.filter((it) => it !== id))
    })
  }

  const retryResults = () => {
    if (resultState.status !== 'error') return
    if (resultState.source === 'primary') void primaryQuery.refetch()
    else void fallbackQuery.refetch()
  }
  const retryableResults = primaryQuery.isError
    ? isRetryableError(primaryQuery.error)
    : isRetryableError(fallbackQuery.error)
  const toggleFavorite = (barId: string) => {
    if (favoriteIds.has(barId)) {
      unfavoriteMutation.mutate({ barId })
    } else {
      analytics.barIntent({ bar_id: barId, action: 'favorite' })
      favoriteMutation.mutate({ barId })
    }
  }
  return (
    <AppShell variant="fan">
      <DashboardHero
        isLoading={resultState.status === 'loading'}
        count={displayedBars.length}
        radiusKm={radiusKm}
        locationState={locationState}
      />
      <AttendanceReportCard />
      {pendingRatingsQuery.data && pendingRatingsQuery.data.length > 0 ? (
        <PendingRatingCard
          pending={pendingRatingsQuery.data}
          isPending={submitRatingMutation.isPending}
          onAnswer={(answer) => submitRatingMutation.mutate(answer)}
        />
      ) : null}
      <SearchFilterBar
        championship={searchText}
        onChampionshipChange={(value) => setSearch(value, value === '')}
        sportId={sportId}
        onSportChange={handleSportChange}
        radiusKm={radiusKm}
        preferredRadiusKm={preferredRadiusKm}
        onRadiusChange={handleRadiusChange}
        amenities={amenities}
        onToggleAmenity={toggleAmenity}
        teams={myTeams}
        teamIds={activeTeamIds}
        onToggleTeam={toggleTeam}
        favoritesOnly={favoritesOnly}
        onFavoritesOnlyChange={setFavoritesOnly}
        hasFavorites={
          favoritesQuery.isSuccess ? favoriteIds.size > 0 : undefined
        }
        sort={sort}
        onSortChange={setSort}
        canSortByRating={canSortByRating}
        sportsState={sportsState}
        activeFilters={activeFilters}
        onReset={reset}
        locationState={locationState}
        onRequestLocation={() => requestLocation(true)}
      />

      {locationState === 'denied' ? (
        <div className="onside-callout onside-callout-stone mb-4 w-full flex-col gap-1 text-xs">
          <p className="font-bold text-[var(--onside-ink)]">
            Localização bloqueada
          </p>
          {LOCATION_HELP.map(([where, steps]) => (
            <p key={where} className="text-[var(--onside-muted)]">
              <span className="font-semibold text-[var(--onside-ink)]">
                {where}:
              </span>{' '}
              {steps}
            </p>
          ))}
          <p className="text-[var(--onside-muted)]">
            Depois, toque em “Usar minha localização” de novo.
          </p>
        </div>
      ) : null}

      <DashboardResults
        resultState={resultState}
        bars={displayedBars}
        mapBars={mapBars}
        radiusKm={radiusKm}
        hasActiveFilters={activeFilters.length > 0}
        locationState={locationState}
        coords={coords}
        hoveredId={hoveredId}
        favoriteIds={favoriteIds}
        favoritePending={
          favoritesQuery.isLoading ||
          favoriteMutation.isPending ||
          unfavoriteMutation.isPending
        }
        classicPlacementGuaranteed={classicPlacementGuaranteed}
        onHover={setHoveredId}
        onFavorite={toggleFavorite}
        onRequestLocation={() => requestLocation(true)}
        onRadiusChange={handleRadiusChange}
        onReset={reset}
        onRetry={retryResults}
        retryable={retryableResults}
        onSuggestion={applySuggestion}
        onSelectMapBar={(barId) => {
          const bar = displayedBars.find((item) => item.id === barId)
          analytics.barOpened({
            bar_id: barId,
            source: 'map',
            bar_plan: bar?.plan
          })
          if (
            classicPlacementGuaranteed &&
            bar?.plan === 'elite' &&
            'nextEvent' in bar &&
            bar.nextEvent?.classic
          ) {
            trackCommercialEvent({
              pubId: bar.id,
              type: 'classic_click',
              sourceEventId: bar.nextEvent.id
            })
          }
          navigate({ to: '/pub/$pubId', params: { pubId: barId } })
        }}
      />
      {session ? (
        <InstallAppCard userId={session.user.id} surface="dashboard" />
      ) : null}
    </AppShell>
  )
}
