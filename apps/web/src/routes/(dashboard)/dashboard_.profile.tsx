/** biome-ignore-all lint/a11y/useValidAriaRole: <explanation> */
/** biome-ignore-all lint/a11y/noAutofocus: <explanation> */

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar01Icon,
  Camera01Icon,
  Cancel01Icon,
  Compass01Icon,
  Edit03Icon,
  FavouriteIcon,
  FlashIcon,
  FloppyDiskIcon,
  HeartMinusIcon,
  ListViewIcon,
  Loading01Icon,
  Location01Icon,
  Logout01Icon,
  MapsLocation01Icon,
  Medal01Icon,
  Sorting01Icon,
  Tick01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { GoogleMap, type MapBar } from '@/components/app/google-map'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/profile')({
  head: () => ({
    meta: [
      { title: 'Meu perfil — FindSports' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: ProfilePage
})

const TABS = ['Visão geral', 'Favoritos', 'Configurações'] as const
type Tab = (typeof TABS)[number]

const RADIUS_OPTIONS = [1, 3, 5, 10] as const
type SortBy = 'upcoming' | 'az' | 'city'

const SP_FALLBACK = { lat: -23.5505, lng: -46.6333 }

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 200
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas not supported'))
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatEventDate(startsAt: string | Date): string {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  if (d.toDateString() === today.toDateString()) return `Hoje, ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã, ${time}`
  return (
    d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }) + `, ${time}`
  )
}

function ProfilePage() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>('Visão geral')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [editingSports, setEditingSports] = useState(false)
  const [savingRadius, setSavingRadius] = useState(false)
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [sortBy, setSortBy] = useState<SortBy>('upcoming')
  const [filterWithEvents, setFilterWithEvents] = useState(false)
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ['session'],
    queryFn: () => authClient.getSession()
  })

  const { data: allSports = [] } = useQuery(trpc.pubs.getSports.queryOptions())

  const { data: myPreferences = [], isLoading: loadingPrefs } = useQuery(
    trpc.pubs.getMyPreferences.queryOptions()
  )

  const { data: favorites = [], isLoading: loadingFavorites } = useQuery(
    trpc.pubs.getFavorites.queryOptions()
  )

  const userRadius =
    ([1, 3, 5, 10] as const).find(
      (v) => v === session?.data?.user?.searchRadiusKm
    ) ?? 5

  const { data: nearbyData } = useQuery({
    ...trpc.pubs.search.queryOptions({
      lat: coords?.lat ?? SP_FALLBACK.lat,
      lng: coords?.lng ?? SP_FALLBACK.lng,
      radiusKm: userRadius,
      limit: 4
    }),
    enabled: tab === 'Visão geral'
  })

  const updatePrefsMutation = useMutation(
    trpc.pubs.updateMyPreferences.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyPreferences.queryKey()
        })
        setEditingSports(false)
      }
    })
  )

  const favoritesQueryKey = trpc.pubs.getFavorites.queryKey()

  const unfavoriteMutation = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onMutate: async ({ barId }) => {
        await queryClient.cancelQueries({ queryKey: favoritesQueryKey })
        const prev = queryClient.getQueryData(favoritesQueryKey)
        queryClient.setQueryData(
          favoritesQueryKey,
          (old: typeof favorites | undefined) =>
            (old ?? []).filter((f) => f.barId !== barId)
        )
        return { prev }
      },
      onError: (_err, _vars, ctx: any) => {
        if (ctx?.prev) queryClient.setQueryData(favoritesQueryKey, ctx.prev)
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
      }
    })
  )

  const user = session?.data?.user

  const initials =
    user?.name
      ?.split(' ')
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      })
    : null

  const completionItems = useMemo(
    () => [
      { label: 'Foto de perfil', done: !!user?.image },
      {
        label: 'Esportes favoritos',
        done: (myPreferences as any[]).length > 0
      },
      { label: 'Primeiro bar favorito', done: (favorites as any[]).length > 0 }
    ],
    [user?.image, myPreferences, favorites]
  )

  const completionScore = Math.round(
    (completionItems.filter((i) => i.done).length / completionItems.length) *
      100
  )

  const upcomingEvents = useMemo(() => {
    return (favorites as any[])
      .flatMap((f) =>
        (f.bar.events ?? []).map((e: any) => ({ ...e, bar: f.bar }))
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      )
      .slice(0, 5)
  }, [favorites])

  const nearbyBars = useMemo(() => {
    const favIds = new Set((favorites as any[]).map((f) => f.bar.id))
    return (nearbyData?.bars ?? [])
      .filter((b: any) => !favIds.has(b.id))
      .slice(0, 3)
  }, [nearbyData, favorites])

  const sortedFavorites = useMemo(() => {
    let list = [...(favorites as any[])]
    if (filterWithEvents)
      list = list.filter((f) => (f.bar.events ?? []).length > 0)
    if (sortBy === 'upcoming') {
      list.sort((a, b) => {
        const aNext = a.bar.events?.[0]?.startsAt
        const bNext = b.bar.events?.[0]?.startsAt
        if (!aNext && !bNext) return 0
        if (!aNext) return 1
        if (!bNext) return -1
        return new Date(aNext).getTime() - new Date(bNext).getTime()
      })
    } else if (sortBy === 'az') {
      list.sort((a, b) => a.bar.name.localeCompare(b.bar.name))
    } else {
      list.sort((a, b) => {
        const cmp = a.bar.city.localeCompare(b.bar.city)
        return cmp !== 0 ? cmp : a.bar.name.localeCompare(b.bar.name)
      })
    }
    return list
  }, [favorites, sortBy, filterWithEvents])

  const favoritesByCity = useMemo(() => {
    if (sortBy !== 'city') return null
    const map = new Map<string, any[]>()
    for (const f of sortedFavorites) {
      const city = f.bar.city
      if (!map.has(city)) map.set(city, [])
      map.get(city)!.push(f)
    }
    return map
  }, [sortBy, sortedFavorites])

  const mapBars = useMemo<MapBar[]>(() => {
    return (favorites as any[]).map((f) => ({
      id: f.bar.id,
      name: f.bar.name,
      lat: parseFloat(f.bar.latitude),
      lng: parseFloat(f.bar.longitude),
      accent: 'orange' as const,
      occupancy: (f.bar.events ?? []).length > 0 ? 80 : 0
    }))
  }, [favorites])

  const handleLogout = async () => {
    await authClient.signOut()
    navigate({ to: '/login' })
  }

  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    await authClient.updateUser({ name: nameInput.trim() })
    queryClient.invalidateQueries({ queryKey: ['session'] })
    setEditingName(false)
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageError(null)
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Imagem muito grande. Máximo 5 MB.')
      return
    }
    setUploadingImage(true)
    try {
      const compressed = await compressImage(file)
      await authClient.updateUser({ image: compressed })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    } catch {
      setImageError('Erro ao processar imagem. Tente novamente.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openEditSports = () => {
    setSelectedSportIds(myPreferences.map((p: any) => p.sportId))
    setEditingSports(true)
  }

  const toggleSport = (id: string) =>
    setSelectedSportIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const saveSports = () => {
    if (selectedSportIds.length === 0) return
    updatePrefsMutation.mutate({ sportIds: selectedSportIds })
  }

  if (loadingSession) {
    return (
      <AppShell role="fan">
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <HugeiconsIcon
            icon={Loading01Icon}
            size={24}
            color="currentColor"
            strokeWidth={1.5}
            className="animate-spin"
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell role="fan">
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
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-black mb-4"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
        />{' '}
        Voltar
      </Link>

      {/* Header card */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-orange to-orange-600 text-white mb-8 p-8 md:p-10">
        <div className="absolute -top-20 -right-10 size-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="relative shrink-0 self-start md:self-auto">
            <div className="size-24 rounded-3xl bg-white text-brand-orange grid place-items-center font-heading font-bold text-4xl ring-4 ring-white/30 overflow-hidden">
              {user?.image ? (
                <img
                  src={user.image}
                  alt={user.name ?? 'Foto de perfil'}
                  className="size-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <button
              type="button"
              disabled={uploadingImage}
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 size-8 rounded-full bg-white text-brand-orange grid place-items-center shadow-lg ring-2 ring-white/30 hover:scale-105 transition-transform disabled:opacity-60"
              aria-label="Trocar foto de perfil"
            >
              {uploadingImage ? (
                <HugeiconsIcon
                  icon={Loading01Icon}
                  size={14}
                  color="currentColor"
                  strokeWidth={2}
                  className="animate-spin"
                />
              ) : (
                <HugeiconsIcon
                  icon={Camera01Icon}
                  size={14}
                  color="currentColor"
                  strokeWidth={2}
                />
              )}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/80 mb-1">
              Torcedor · FindSports
            </div>
            {editingName ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  className="bg-white/20 text-white placeholder-white/50 rounded-xl px-3 py-1.5 font-heading text-2xl font-bold outline-none focus:ring-2 focus:ring-white/40 w-full max-w-xs"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30"
                >
                  <HugeiconsIcon
                    icon={FloppyDiskIcon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </button>
              </div>
            ) : (
              <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-1">
                {user?.name}
              </h1>
            )}
            <p className="text-white/80 text-sm">{user?.email}</p>
            {memberSince && (
              <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  size={11}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                Membro desde {memberSince}
              </p>
            )}
            {imageError && (
              <p className="text-red-200 text-xs mt-2">{imageError}</p>
            )}
          </div>

          {!editingName && (
            <button
              type="button"
              onClick={() => {
                setNameInput(user?.name ?? '')
                setEditingName(true)
              }}
              className="bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 shrink-0"
            >
              <HugeiconsIcon
                icon={Edit03Icon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
              />{' '}
              Editar nome
            </button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-full p-1 ring-1 ring-black/5 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
              tab === t
                ? 'bg-black text-white'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Visão geral ──────────────────────────────────── */}
      {tab === 'Visão geral' && (
        <div className="space-y-6">
          {/* Completion nudge */}
          {completionScore < 100 && (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-sm">
                  Perfil {completionScore}% configurado
                </p>
                <span className="text-xs text-zinc-500">
                  {completionItems.filter((i) => i.done).length}/
                  {completionItems.length}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-orange transition-all duration-500"
                  style={{ width: `${completionScore}%` }}
                />
              </div>
              <ul className="space-y-1.5">
                {completionItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`size-4 rounded-full grid place-items-center ${item.done ? 'bg-brand-orange text-white' : 'bg-zinc-100 text-zinc-400'}`}
                    >
                      <HugeiconsIcon
                        icon={Tick01Icon}
                        size={10}
                        color="currentColor"
                        strokeWidth={2.5}
                      />
                    </span>
                    <span
                      className={item.done ? 'text-zinc-700' : 'text-zinc-400'}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                v: String((favorites as any[]).length),
                l: 'Favoritos',
                i: FavouriteIcon,
                tab: 'Favoritos' as Tab
              },
              {
                v: `${user?.searchRadiusKm ?? 3} km`,
                l: 'Raio de busca',
                i: Location01Icon,
                tab: 'Configurações' as Tab
              },
              {
                v: String((myPreferences as any[]).length),
                l: 'Esportes',
                i: Medal01Icon,
                tab: 'Configurações' as Tab
              }
            ].map((s) => (
              <button
                key={s.l}
                type="button"
                onClick={() => setTab(s.tab)}
                className="bg-white rounded-2xl ring-1 ring-black/5 p-5 text-left hover:ring-brand-orange/30 hover:shadow-sm transition-all group"
              >
                <HugeiconsIcon
                  icon={s.i}
                  size={20}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-brand-orange mb-3"
                />
                <div className="font-heading text-3xl font-bold">{s.v}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1 flex items-center justify-between">
                  {s.l}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    color="currentColor"
                    strokeWidth={2}
                    className="text-zinc-300 group-hover:text-brand-orange transition-colors"
                  />
                </div>
              </button>
            ))}
          </div>

          {/* Upcoming events at favorites */}
          {loadingFavorites ? null : upcomingEvents.length > 0 ? (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
              <h2 className="font-heading text-lg font-bold flex items-center gap-2 mb-4">
                <HugeiconsIcon
                  icon={FlashIcon}
                  size={18}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-brand-orange"
                />
                Próximos jogos nos seus bares
              </h2>
              <ul className="divide-y divide-zinc-100">
                {upcomingEvents.map((e: any) => (
                  <li key={e.id}>
                    <Link
                      to="/pub/$pubId"
                      params={{ pubId: e.bar.id }}
                      className="flex items-center gap-3 py-3 group"
                    >
                      <div className="size-9 rounded-xl bg-brand-orange/10 grid place-items-center shrink-0">
                        <HugeiconsIcon
                          icon={Medal01Icon}
                          size={16}
                          color="currentColor"
                          strokeWidth={1.5}
                          className="text-brand-orange"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate group-hover:text-brand-orange transition-colors">
                          {e.championship}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {e.bar.name}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-bold text-zinc-700">
                          {formatEventDate(e.startsAt)}
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
                          {e.sport?.name}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setTab('Favoritos')}
                className="mt-2 text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
              >
                Ver todos os favoritos{' '}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={12}
                  color="currentColor"
                  strokeWidth={2}
                />
              </button>
            </section>
          ) : (favorites as any[]).length > 0 ? (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6 text-center">
              <HugeiconsIcon
                icon={FlashIcon}
                size={28}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-200 mx-auto mb-2"
              />
              <p className="text-sm font-bold text-zinc-700 mb-1">
                Sem jogos agendados nos seus bares
              </p>
              <p className="text-xs text-zinc-500 mb-3">
                Seus bares favoritos não têm eventos próximos.
              </p>
              <Link
                to="/dashboard"
                className="text-xs font-bold text-brand-orange hover:underline inline-flex items-center gap-1"
              >
                Encontrar bar para hoje{' '}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={12}
                  color="currentColor"
                  strokeWidth={2}
                />
              </Link>
            </section>
          ) : (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6 text-center">
              <HugeiconsIcon
                icon={FavouriteIcon}
                size={28}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-200 mx-auto mb-2"
              />
              <p className="text-sm font-bold text-zinc-700 mb-1">
                Nenhum bar favoritado
              </p>
              <p className="text-xs text-zinc-500 mb-3">
                Favorite bares para acompanhar os próximos jogos aqui.
              </p>
              <Link
                to="/dashboard"
                className="text-xs font-bold text-brand-orange hover:underline inline-flex items-center gap-1"
              >
                Explorar bares{' '}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={12}
                  color="currentColor"
                  strokeWidth={2}
                />
              </Link>
            </section>
          )}

          {/* Nearby bars discovery */}
          {nearbyBars.length > 0 && (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-bold flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Compass01Icon}
                    size={18}
                    color="currentColor"
                    strokeWidth={1.5}
                    className="text-brand-orange"
                  />
                  Perto de você
                </h2>
                <Link
                  to="/dashboard"
                  className="text-xs font-bold text-zinc-500 hover:text-black flex items-center gap-1"
                >
                  Ver mais{' '}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    color="currentColor"
                    strokeWidth={2}
                  />
                </Link>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {nearbyBars.map((b: any) => (
                  <Link
                    key={b.id}
                    to="/pub/$pubId"
                    params={{ pubId: b.id }}
                    className="group block rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors p-4"
                  >
                    <div className="font-bold text-sm group-hover:text-brand-orange transition-colors truncate mb-1">
                      {b.name}
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center gap-1 mb-2">
                      <HugeiconsIcon
                        icon={Location01Icon}
                        size={11}
                        color="currentColor"
                        strokeWidth={1.5}
                      />
                      {b.neighborhood} ·{' '}
                      {b.distance_km < 1
                        ? `${Math.round(b.distance_km * 1000)} m`
                        : `${b.distance_km.toFixed(1)} km`}
                    </div>
                    {b.event_count > 0 && (
                      <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                        {b.event_count} jogo{b.event_count !== 1 ? 's' : ''}{' '}
                        agendado{b.event_count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ─── Favoritos ────────────────────────────────────── */}
      {tab === 'Favoritos' && (
        <div className="space-y-4">
          {/* Controls */}
          {(favorites as any[]).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Sort */}
              <div className="flex items-center gap-1 bg-white rounded-full ring-1 ring-black/5 p-1">
                <HugeiconsIcon
                  icon={Sorting01Icon}
                  size={14}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-zinc-400 ml-2"
                />
                {(
                  [
                    { v: 'upcoming', l: 'Próximos jogos' },
                    { v: 'az', l: 'A–Z' },
                    { v: 'city', l: 'Cidade' }
                  ] as { v: SortBy; l: string }[]
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSortBy(s.v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      sortBy === s.v
                        ? 'bg-black text-white'
                        : 'text-zinc-600 hover:text-black'
                    }`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>

              {/* Filter */}
              <button
                type="button"
                onClick={() => setFilterWithEvents((p) => !p)}
                className={`px-3 py-2 rounded-full text-xs font-bold transition-colors ring-1 ${
                  filterWithEvents
                    ? 'bg-brand-orange text-white ring-transparent'
                    : 'bg-white text-zinc-600 ring-black/5 hover:text-black'
                }`}
              >
                Com jogos
              </button>

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-white rounded-full ring-1 ring-black/5 p-1 ml-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-full transition-colors ${viewMode === 'list' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}
                  aria-label="Visualização em lista"
                >
                  <HugeiconsIcon
                    icon={ListViewIcon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  className={`p-1.5 rounded-full transition-colors ${viewMode === 'map' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}
                  aria-label="Visualização no mapa"
                >
                  <HugeiconsIcon
                    icon={MapsLocation01Icon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {loadingFavorites && (
            <div className="flex justify-center py-12 text-zinc-400">
              <HugeiconsIcon
                icon={Loading01Icon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="animate-spin"
              />
            </div>
          )}

          {/* Empty */}
          {!loadingFavorites && (favorites as any[]).length === 0 && (
            <section className="bg-white rounded-2xl ring-1 ring-black/5 p-8 text-center">
              <HugeiconsIcon
                icon={FavouriteIcon}
                size={36}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-200 mx-auto mb-3"
              />
              <p className="text-sm font-bold text-zinc-700 mb-1">
                Nenhum bar favoritado
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                Explore bares e favorite os seus preferidos.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-orange hover:underline"
              >
                Explorar bares{' '}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={14}
                  color="currentColor"
                  strokeWidth={2}
                />
              </Link>
            </section>
          )}

          {/* Filter empty */}
          {!loadingFavorites &&
            (favorites as any[]).length > 0 &&
            sortedFavorites.length === 0 && (
              <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6 text-center">
                <p className="text-sm text-zinc-500">
                  Nenhum bar favorito com jogos agendados no momento.
                </p>
              </section>
            )}

          {/* Map view */}
          {!loadingFavorites &&
            viewMode === 'map' &&
            sortedFavorites.length > 0 && (
              <div className="relative h-[420px] md:h-[520px] rounded-2xl overflow-hidden ring-1 ring-black/5">
                <GoogleMap
                  bars={mapBars}
                  center={coords ?? undefined}
                  hoveredId={hoveredBarId}
                  onHover={setHoveredBarId}
                  onSelect={(id) =>
                    navigate({ to: '/pub/$pubId', params: { pubId: id } })
                  }
                />
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 text-xs font-bold ring-1 ring-black/5">
                  {sortedFavorites.length} bar
                  {sortedFavorites.length !== 1 ? 'es' : ''} favorito
                  {sortedFavorites.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}

          {/* List view — flat or grouped by city */}
          {!loadingFavorites &&
            viewMode === 'list' &&
            sortedFavorites.length > 0 && (
              <>
                {favoritesByCity ? (
                  Array.from(favoritesByCity.entries()).map(([city, bars]) => (
                    <div key={city}>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <HugeiconsIcon
                          icon={Location01Icon}
                          size={13}
                          color="currentColor"
                          strokeWidth={1.5}
                          className="text-zinc-400"
                        />
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                          {city}
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {bars.map((f: any) => (
                          <FavoriteCard
                            key={f.bar.id}
                            favorite={f}
                            onUnfavorite={() =>
                              unfavoriteMutation.mutate({ barId: f.bar.id })
                            }
                            isPending={unfavoriteMutation.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedFavorites.map((f: any) => (
                      <FavoriteCard
                        key={f.bar.id}
                        favorite={f}
                        onUnfavorite={() =>
                          unfavoriteMutation.mutate({ barId: f.bar.id })
                        }
                        isPending={unfavoriteMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
        </div>
      )}

      {/* ─── Configurações ────────────────────────────────── */}
      {tab === 'Configurações' && (
        <div className="space-y-4">
          {/* Esportes favoritos */}
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-bold flex items-center gap-2">
                <HugeiconsIcon
                  icon={Medal01Icon}
                  size={20}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="text-brand-orange"
                />
                Esportes favoritos
              </h3>
              {!editingSports && (
                <button
                  type="button"
                  onClick={openEditSports}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-black px-3 py-1.5 rounded-full hover:bg-zinc-100"
                >
                  <HugeiconsIcon
                    icon={Edit03Icon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                  />{' '}
                  Editar
                </button>
              )}
            </div>

            {loadingPrefs ? (
              <HugeiconsIcon
                icon={Loading01Icon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
                className="animate-spin text-zinc-400"
              />
            ) : editingSports ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {allSports.map((s: any) => {
                    const on = selectedSportIds.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSport(s.id)}
                        className={`relative rounded-xl p-4 text-left transition-all ring-1 ${
                          on
                            ? 'bg-brand-orange text-white ring-transparent'
                            : 'bg-zinc-50 ring-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        <div className="font-bold text-sm">{s.name}</div>
                        {on && (
                          <HugeiconsIcon
                            icon={Tick01Icon}
                            size={14}
                            color="currentColor"
                            strokeWidth={1.5}
                            className="absolute top-2 right-2"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-zinc-400 mb-4">
                  {selectedSportIds.length} selecionado
                  {selectedSportIds.length !== 1 ? 's' : ''} — escolha pelo
                  menos 1.
                </p>
                {updatePrefsMutation.error && (
                  <p className="text-xs text-red-500 mb-3">
                    {updatePrefsMutation.error.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveSports}
                    disabled={
                      selectedSportIds.length === 0 ||
                      updatePrefsMutation.isPending
                    }
                    className="px-4 py-2 rounded-full text-sm font-bold bg-brand-orange text-white disabled:opacity-50"
                  >
                    {updatePrefsMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSports(false)}
                    className="px-4 py-2 rounded-full text-sm font-bold text-zinc-600 hover:bg-zinc-100"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(myPreferences as any[]).length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Nenhum esporte selecionado.
                  </p>
                ) : (
                  (myPreferences as any[]).map((p) => (
                    <span
                      key={p.sportId}
                      className="px-3 py-1.5 rounded-full bg-brand-orange/10 text-brand-orange text-xs font-bold"
                    >
                      {p.sport.name}
                    </span>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Raio de busca */}
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
            <h3 className="font-heading text-lg font-bold flex items-center gap-2 mb-1">
              <HugeiconsIcon
                icon={Location01Icon}
                size={20}
                color="currentColor"
                strokeWidth={1.5}
                className="text-brand-orange"
              />
              Raio de busca
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Distância máxima para buscar bares
            </p>
            <div className="flex gap-2 flex-wrap">
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  disabled={savingRadius}
                  onClick={async () => {
                    setSavingRadius(true)
                    await authClient.updateUser({
                      searchRadiusKm: km as number
                    })
                    queryClient.invalidateQueries({ queryKey: ['session'] })
                    setSavingRadius(false)
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-colors disabled:opacity-60 ${
                    user?.searchRadiusKm === km
                      ? 'bg-brand-orange text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {km} km
                </button>
              ))}
            </div>
            {savingRadius && (
              <p className="text-[10px] text-zinc-400 mt-2">Salvando...</p>
            )}
          </section>

          {/* Sair */}
          <section className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left p-5 flex items-center gap-4 hover:bg-red-50 transition-colors group"
            >
              <div className="size-10 rounded-xl bg-zinc-100 group-hover:bg-red-100 grid place-items-center transition-colors">
                <HugeiconsIcon
                  icon={Logout01Icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="group-hover:text-red-600 transition-colors"
                />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm group-hover:text-red-600 transition-colors">
                  Sair
                </div>
                <div className="text-xs text-zinc-500">
                  Encerrar a sessão neste dispositivo
                </div>
              </div>
              <span className="text-zinc-300">›</span>
            </button>
          </section>
        </div>
      )}
    </AppShell>
  )
}

type FavoriteCardProps = {
  favorite: any
  onUnfavorite: () => void
  isPending: boolean
}

function FavoriteCard({
  favorite: f,
  onUnfavorite,
  isPending
}: FavoriteCardProps) {
  const nextEvent = f.bar.events?.[0]

  return (
    <div className="group relative rounded-xl bg-white ring-1 ring-black/5 hover:shadow-sm transition-all overflow-hidden">
      <Link to="/pub/$pubId" params={{ pubId: f.bar.id }} className="block p-4">
        <div className="font-heading font-bold text-base group-hover:text-brand-orange transition-colors truncate pr-6 mb-1">
          {f.bar.name}
        </div>
        <div className="text-xs text-zinc-500 flex items-center gap-1 mb-3">
          <HugeiconsIcon
            icon={Location01Icon}
            size={11}
            color="currentColor"
            strokeWidth={1.5}
          />
          {f.bar.neighborhood}, {f.bar.city}
        </div>
        {nextEvent ? (
          <div className="rounded-lg bg-brand-orange/8 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-0.5">
              {nextEvent.sport?.name}
            </div>
            <div className="text-xs font-bold text-zinc-800 truncate">
              {nextEvent.championship}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {formatEventDate(nextEvent.startsAt)}
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <div className="text-xs text-zinc-400">Sem jogos agendados</div>
          </div>
        )}
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={onUnfavorite}
        className="absolute top-3 right-3 size-7 rounded-full grid place-items-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
        aria-label={`Remover ${f.bar.name} dos favoritos`}
      >
        <HugeiconsIcon
          icon={HeartMinusIcon}
          size={14}
          color="currentColor"
          strokeWidth={1.5}
        />
      </button>
    </div>
  )
}
