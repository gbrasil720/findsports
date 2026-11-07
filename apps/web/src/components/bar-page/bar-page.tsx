import { groupOpeningHours } from '@findsports_oficial/api/lib/opening-hours'
import type { PublicGame } from '@findsports_oficial/api/lib/public-bar-page'
import { RATING_REASONS } from '@findsports_oficial/api/lib/rating-reasons'
import { photoCategoryLabel } from '@findsports_oficial/db/bar-gallery'
import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { pinDoPlano } from '@/components/app/map-icons'
import { Logo } from '@/components/landing/v3/icons'
import { ThemeSwitch } from '@/components/landing/v3/theme-switch'
import { QRCode } from '@/components/qr-code'
import { canRecordCommercialEvents } from '@/domain/viewer'
import { analytics } from '@/lib/analytics'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
import { env } from '@/lib/env'
import { buildDirectionsUrl } from '@/lib/maps-link'
import { SITE_URL } from '@/lib/site'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { buildWhatsAppLink } from '@/lib/whatsapp-link'
import { useTRPC } from '@/utils/trpc'
import { Dialog } from './bar-dialog'
import { AMENITY_ICON, Icon } from './bar-icons'
import {
  amenityGroups,
  clock,
  dayLabel,
  firstName,
  gameState,
  goingText,
  type PageBar,
  pickGame,
  screensLabel
} from './bar-page-model'
import { type LoginKind, LoginSheet } from './login-sheet'

const OnsideMap = lazy(() =>
  import('@/components/app/onside-map').then((m) => ({ default: m.OnsideMap }))
)

export type LiveBar = PageBar & {
  plan: string
  issuesCode: boolean
  phoneAcceptsWhatsapp: boolean | null
  description: string | null
  menuUrl: string | null
  averageSpendCents: number | null
  ratingReasons: { positive: string[]; negative: string[] } | null
  photos: {
    id: string
    url: string
    category: Parameters<typeof photoCategoryLabel>[0]
    caption: string | null
  }[]
}

export type Nearby = {
  id: string
  name: string
  neighborhood: string
  photoUrl: string | null
  path: string
  title: string
  startsAt: Date
  endsAt: Date | null
}

export type BarPageSearch = { jogo?: string; acao?: 'vou' | 'salvar' }

type Props = {
  bar: LiveBar
  path: string
  now: Date
  ownerPreview: boolean
  nearby: Nearby[]
  search: BarPageSearch
}

const AVATAR_BG = ['#e8320c', '#c9b79c', '#8fa3a0', '#2f55c7', '#5b6d0c']
const reasonLabel = (id: string) =>
  RATING_REASONS.find((reason) => reason.id === id)?.label ?? id

function useSession() {
  return useRouteContext({ from: '__root__', select: (ctx) => ctx.session })
}

/** O título com o "×" aceso, como no telão. */
function Matchup({ title }: { title: string }) {
  const parts = title.split(' × ')
  return (
    <>
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? <span className="x"> × </span> : null}
          {part}
        </span>
      ))}
    </>
  )
}

/**
 * Distância só quando o navegador já deu a localização a esta página: nada de
 * pedir permissão (decisão do dono, 05/11/2026).
 */
function useKnownDistance(lat: number, lng: number) {
  const [meters, setMeters] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (status.state !== 'granted' || !alive) return
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            if (!alive) return
            const rad = Math.PI / 180
            const a =
              Math.sin(((coords.latitude - lat) * rad) / 2) ** 2 +
              Math.cos(lat * rad) *
                Math.cos(coords.latitude * rad) *
                Math.sin(((coords.longitude - lng) * rad) / 2) ** 2
            setMeters(2 * 6_371_000 * Math.asin(Math.sqrt(a)))
          },
          () => {},
          { maximumAge: 300_000 }
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [lat, lng])
  if (meters === null || meters > 50_000) return null
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

export function BarPage({
  bar,
  path,
  now,
  ownerPreview,
  nearby,
  search
}: Props) {
  const session = useSession()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const viewerKey = trpc.pubs.pageViewer.queryKey({ barId: bar.id })
  const viewer = useQuery({
    ...trpc.pubs.pageViewer.queryOptions({ barId: bar.id }),
    enabled: Boolean(session),
    meta: { errorToast: false }
  })
  const fan = viewer.data?.fan === true
  const game = pickGame(bar.events, search.jogo, now)
  const mine = game ? viewer.data?.games[game.id] : undefined
  const attending = mine?.attendance?.attending === true
  const url = `${SITE_URL}${path}`
  const [login, setLogin] = useState<{
    kind: LoginKind
    game: PublicGame | null
  } | null>(null)
  const [modal, setModal] = useState<'code' | 'share' | null>(null)
  const distance = useKnownDistance(Number(bar.latitude), Number(bar.longitude))
  const canTrack = canRecordCommercialEvents(
    session?.user.role,
    session?.session.impersonatedBy
  )
  const directionsUrl = buildDirectionsUrl({
    latitude: bar.latitude,
    longitude: bar.longitude,
    name: bar.name,
    address: bar.address
  })
  const whatsappUrl = buildWhatsAppLink({
    phone: bar.phone,
    acceptsWhatsapp: bar.phoneAcceptsWhatsapp === true,
    event: game
      ? {
          matchup: game.title,
          when: `${dayLabel(game.startsAt, now)} às ${clock(game.startsAt)}`
        }
      : null
  })

  // A visita conta para o bar como no perfil antigo: só torcedor (WEB-311).
  useEffect(() => {
    if (canTrack)
      trackCommercialEvent({
        pubId: bar.id,
        type: 'profile_view',
        sourceEventId: search.jogo
      })
  }, [canTrack, bar.id, search.jogo])

  const intent = (action: 'directions' | 'whatsapp' | 'phone') => () => {
    analytics.barIntent({ bar_id: bar.id, action })
    if (!canTrack) return
    trackCommercialEvent({
      pubId: bar.id,
      type:
        action === 'directions'
          ? 'directions_opened'
          : action === 'whatsapp'
            ? 'whatsapp_opened'
            : 'phone_clicked',
      sourceEventId: game?.id
    })
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: viewerKey })
  const attend = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: async (result) => {
        await refresh()
        if (result.attending) {
          toast.success(
            result.code
              ? 'Pronto: você vai assistir aqui. Este é o seu código.'
              : 'Pronto: você vai assistir aqui.'
          )
        } else toast.success('Presença desmarcada.')
      },
      onError: (error) =>
        toast.error(
          getUserFacingMessage(error, 'Não deu para marcar. Tente de novo.')
        )
    })
  )
  const favorite = useMutation(
    trpc.pubs.favorite.mutationOptions({
      onSuccess: async () => {
        await refresh()
        toast.success(`${bar.name} salvo em Seus bares.`)
      },
      onError: (error) =>
        toast.error(getUserFacingMessage(error, 'Não deu para salvar.'))
    })
  )
  const unfavorite = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onSuccess: async () => {
        await refresh()
        toast.success('Tirado de Seus bares.')
      },
      onError: (error) =>
        toast.error(getUserFacingMessage(error, 'Não deu para tirar.'))
    })
  )

  const saved = viewer.data?.favorited === true
  const toggleSave = () => {
    if (!session) return setLogin({ kind: 'salvar', game: null })
    if (!fan) return toast.info('Salvar bar é para conta de torcedor.')
    if (saved) unfavorite.mutate({ barId: bar.id })
    else favorite.mutate({ barId: bar.id })
  }
  const markGoing = (target: PublicGame) => {
    if (!session) return setLogin({ kind: 'vou', game: target })
    if (!fan) return toast.info('Marcar presença é para conta de torcedor.')
    attend.mutate({ eventId: target.id, attending: true })
  }

  /*
   * A ação pedida antes de entrar (`?acao=`): a folha de login, o cadastro e
   * o 2FA voltam para cá com ela, e ela acontece uma vez só.
   */
  const pending = useRef(false)
  useEffect(() => {
    if (!search.acao || !session || !viewer.data || pending.current) return
    pending.current = true
    const { acao, ...rest } = search
    void navigate({ to: '.', search: rest, replace: true, resetScroll: false })
    if (!viewer.data.fan) {
      toast.info('Marcar presença e salvar bar são para conta de torcedor.')
      return
    }
    if (acao === 'salvar' && !viewer.data.favorited)
      favorite.mutate({ barId: bar.id })
    if (acao === 'vou' && game && !attending)
      attend.mutate({ eventId: game.id, attending: true })
  }, [
    search,
    session,
    viewer.data,
    navigate,
    favorite,
    attend,
    bar.id,
    game,
    attending
  ])

  const share = async () => {
    const text = shareText(bar, game, now)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: bar.name, text, url })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }
    setModal('share')
  }

  const anchorRef = useRef<HTMLDivElement>(null)
  const ctaOn = usePastAnchor(anchorRef)
  const opening = bar.opening
  const noGames = bar.events.length === 0

  return (
    <div className={`bp${noGames && !nearby.length ? '' : ' has-cta'}`}>
      <TopBar onLogin={() => setLogin({ kind: 'entrar', game })} />
      {ownerPreview ? (
        <div className="owner">
          <div className="wrap">
            Prévia: o seu bar está fora do ar e esta página não aparece para
            mais ninguém.
          </div>
        </div>
      ) : null}
      <main>
        <section className="hero">
          {bar.photoUrl ? (
            <img
              src={bar.photoUrl}
              alt={`Foto do ${bar.name}`}
              width={1800}
              height={900}
            />
          ) : null}
          <div className="wrap">
            <div className="hacts">
              <button
                className="btn ic"
                type="button"
                aria-pressed={saved}
                aria-label={
                  saved ? 'Salvo em Seus bares' : `Salvar o ${bar.name}`
                }
                onClick={toggleSave}
                disabled={favorite.isPending || unfavorite.isPending}
              >
                <Icon name="heart" size={21} />
              </button>
              <button
                className="btn ic"
                type="button"
                aria-label="Compartilhar"
                onClick={share}
              >
                <Icon name="share" />
              </button>
            </div>
            <div className="hero-in">
              <h1>
                <span className="disp">{bar.name}</span>
                <span className="wh">
                  Bar na {bar.neighborhood}, {bar.city}
                </span>
              </h1>
              <div className="meta">
                {opening ? (
                  opening.open ? (
                    <span className="pill open">
                      ● Aberto · até {opening.closes}
                    </span>
                  ) : opening.opens ? (
                    <span className="pill shut">
                      ● Fechado · abre{' '}
                      {opening.opens.day === 'hoje'
                        ? ''
                        : `${opening.opens.day} `}
                      {opening.opens.time}
                    </span>
                  ) : null
                ) : null}
                {bar.rating ? (
                  <span className="pill">
                    {bar.rating.percentage}% voltariam
                  </span>
                ) : null}
                {screensLabel(bar) ? (
                  <span className="pill hide-m">
                    <Icon name="tv" size={15} />
                    {screensLabel(bar)}
                  </span>
                ) : null}
                {distance ? (
                  <span className="pill hide-m">
                    <Icon name="pin" size={14} />
                    {distance} de você
                  </span>
                ) : null}
                {bar.issuesCode ? (
                  <span
                    className="pill elite"
                    title="Bar Elite: código no balcão e oferta da casa"
                  >
                    ELITE
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="wrap cols">
          <div className="main">
            {noGames && nearby.length ? (
              <NearSection nearby={nearby} now={now} />
            ) : null}
            <Gallery bar={bar} />
            {game ? (
              <NextGames
                bar={bar}
                current={game}
                now={now}
                attendingIds={Object.entries(viewer.data?.games ?? {})
                  .filter(([, value]) => value.attendance?.attending)
                  .map(([id]) => id)}
                onPick={(id) => {
                  void navigate({
                    to: '.',
                    search: { jogo: id },
                    replace: true,
                    resetScroll: false
                  })
                  document
                    .getElementById('today')
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }}
              />
            ) : null}
            <Amenities bar={bar} />
            <Rating bar={bar} />
            <div className="duo">
              <Where
                bar={bar}
                distance={distance}
                directionsUrl={directionsUrl}
                whatsappUrl={whatsappUrl}
                onDirections={intent('directions')}
                onWhatsApp={intent('whatsapp')}
                onPhone={intent('phone')}
              />
              <Hours bar={bar} now={now} />
            </div>
          </div>
          <aside className="side" aria-label="Jogo de hoje">
            {game ? (
              <TodayCard
                bar={bar}
                game={game}
                now={now}
                session={Boolean(session)}
                fan={fan}
                friends={mine?.friends ?? []}
                attendance={mine?.attendance ?? null}
                anchorRef={anchorRef}
                busy={attend.isPending}
                directionsUrl={directionsUrl}
                onDirections={intent('directions')}
                onGo={() => markGoing(game)}
                onUnmark={() =>
                  attend.mutate({ eventId: game.id, attending: false })
                }
                onShare={share}
                onCode={() => setModal('code')}
                onFriends={() => setLogin({ kind: 'amigos', game })}
              />
            ) : (
              <EmptyCard
                bar={bar}
                anchorRef={anchorRef}
                saved={saved}
                directionsUrl={directionsUrl}
                onDirections={intent('directions')}
                onSave={toggleSave}
              />
            )}
          </aside>
        </div>

        <div className="wrap more">
          <ol className="crumbs" aria-label="Você está em">
            <li>
              <a href="/">Onside</a>
            </li>
            <li>{bar.city}</li>
            <li>{bar.neighborhood}</li>
            <li aria-current="page">{bar.name}</li>
          </ol>
        </div>
      </main>
      <Footer />

      <div
        className={`bp-layer mcta${ctaOn ? ' on' : ''}`}
        aria-hidden={!ctaOn}
      >
        {game ? (
          <>
            <span className="info">
              <b>{game.title}</b>
              <span>
                {gameState(game, now) === 'live' ? (
                  <span className="lvt">● ao vivo</span>
                ) : (
                  `${dayLabel(game.startsAt, now)} ${clock(game.startsAt)}`
                )}
                {game.going !== null ? ` · ${game.going} vão` : ''}
              </span>
            </span>
            {attending && mine?.attendance?.code ? (
              <button
                className="btn b-acid"
                type="button"
                tabIndex={ctaOn ? 0 : -1}
                onClick={() => setModal('code')}
              >
                <Icon name="qr" size={18} />
                Código
              </button>
            ) : gameState(game, now) === 'upcoming' &&
              !attending &&
              game.attendanceEnabled ? (
              <button
                className="btn b-acid"
                type="button"
                tabIndex={ctaOn ? 0 : -1}
                onClick={() => markGoing(game)}
              >
                Vou assistir aqui
              </button>
            ) : directionsUrl ? (
              <a
                className="btn b-acid"
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={ctaOn ? 0 : -1}
                onClick={intent('directions')}
              >
                Como chegar
              </a>
            ) : null}
          </>
        ) : nearby.length ? (
          <>
            <span className="info">
              <b>{bar.name}</b>
              <span>sem jogo marcado</span>
            </span>
            <button
              className="btn b-acid"
              type="button"
              tabIndex={ctaOn ? 0 : -1}
              onClick={() =>
                document
                  .getElementById('perto')
                  ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }
            >
              Jogos perto
            </button>
          </>
        ) : null}
      </div>

      <LoginSheet
        open={login}
        bar={bar}
        path={path}
        now={now}
        onClose={() => setLogin(null)}
      />
      {modal === 'code' && game && mine?.attendance?.code ? (
        <CodeModal
          code={mine.attendance.code}
          game={game}
          bar={bar}
          now={now}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'share' ? (
        <ShareModal
          bar={bar}
          text={shareText(bar, game, now)}
          url={url}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}

/** O rodapé fixo do celular aparece quando o botão do cartão passou para cima. */
function usePastAnchor(ref: React.RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return past
}

function shareText(bar: LiveBar, game: PublicGame | null, now: Date) {
  if (!game)
    return `${bar.name}, ${bar.neighborhood}: veja a grade de jogos na Onside.`
  const when =
    gameState(game, now) === 'live'
      ? 'Ao vivo agora'
      : `${dayLabel(game.startsAt, now).replace(/^./, (c) => c.toUpperCase())} ${clock(game.startsAt)}`
  return `${when}: ${game.title} no ${bar.name}, ${bar.neighborhood}.${game.going ? ` ${game.going} pessoas vão.` : ''}`
}

export function TopBar({ onLogin }: { onLogin?: () => void }) {
  const session = useSession()
  const role = session?.user.role
  const initials = (session?.user.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <header className="top">
      <div className="wrap top-in">
        <a className="logo" href="/" aria-label="Onside, início">
          <Logo size={28} />
          <b>
            ONSIDE<i></i>
          </b>
        </a>
        <span className="sp" />
        <nav aria-label="Conta">
          {!session ? (
            <>
              <a className="lnk dk" href="/signup?role=pub">
                Para bares
              </a>
              {onLogin ? (
                <button
                  className="btn b-ink sm"
                  type="button"
                  onClick={onLogin}
                >
                  Entrar
                </button>
              ) : (
                <a className="btn b-ink sm" href="/login">
                  Entrar
                </a>
              )}
            </>
          ) : role === 'pub' ? (
            <a className="btn b-ink sm" href="/admin">
              Meu painel
            </a>
          ) : (
            <>
              <a className="lnk dk" href="/dashboard">
                Jogos de hoje
              </a>
              <a className="lnk dk" href="/dashboard/games">
                Meus jogos
              </a>
              <a
                className="ava"
                href="/dashboard/profile"
                aria-label={`Conta de ${session.user.name}`}
              >
                {session.user.image ? (
                  <img src={session.user.image} alt="" />
                ) : (
                  initials || '·'
                )}
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="bp-foot">
      <div className="wrap foot-in">
        <a className="logo" href="/" aria-label="Onside, início">
          <Logo size={26} />
          <b>
            ONSIDE<i></i>
          </b>
        </a>
        <span className="own">
          Tem um bar? <a href="/signup?role=pub">Coloque o seu na Onside</a>
        </span>
        <nav aria-label="Rodapé">
          <a href="/signup?role=pub">Para bares</a>
          <a href="/termos">Termos</a>
          <a href="/privacidade">Privacidade</a>
        </nav>
        <div className="lp3 bp-theme">
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  )
}

type CardProps = {
  bar: LiveBar
  game: PublicGame
  now: Date
  session: boolean
  fan: boolean
  friends: { name: string; image: string | null }[]
  attendance: {
    attending: boolean
    code: string | null
    validated: boolean
  } | null
  anchorRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  directionsUrl: string | null
  onDirections: () => void
  onGo: () => void
  onUnmark: () => void
  onShare: () => void
  onCode: () => void
  onFriends: () => void
}

function TodayCard({
  bar,
  game,
  now,
  session,
  fan,
  friends,
  attendance,
  anchorRef,
  busy,
  directionsUrl,
  onDirections,
  onGo,
  onUnmark,
  onShare,
  onCode,
  onFriends
}: CardProps) {
  const state = gameState(game, now)
  const mine = attendance?.attending === true
  const going = goingText(game.going, friends)
  const canMark =
    state === 'upcoming' && game.attendanceEnabled && (!session || fan)
  const route = directionsUrl ? (
    <a
      className={`btn ${mine ? 'b-ghost sm' : 'b-acid full-w'}`}
      href={directionsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onDirections}
    >
      <Icon name="map" size={18} />
      Como chegar
    </a>
  ) : null
  return (
    <section className="today o-today on-ink" aria-labelledby="t-h" id="today">
      <div className="k">
        {state === 'live' ? (
          <>
            <span className="live">
              <i />
              AO VIVO
            </span>
            <span>
              Começou {clock(game.startsAt)} · {game.championship}
            </span>
          </>
        ) : (
          <span>
            {dayLabel(game.startsAt, now)} · {clock(game.startsAt)} ·{' '}
            {game.championship}
          </span>
        )}
        {mine ? (
          <span className="you">
            <Icon name="check" size={14} />
            VOCÊ VAI
          </span>
        ) : null}
      </div>
      <h2 id="t-h">
        <span className="sr">
          {state === 'live'
            ? `Ao vivo agora no ${bar.name}: `
            : 'Onde assistir '}
        </span>
        <Matchup title={game.title} />
      </h2>
      {game.onBigScreen || game.withSound ? (
        <ul className="tags">
          {game.onBigScreen ? (
            <li>
              <Icon name="tv" size={16} />
              {screensLabel(bar) ?? 'Telão'}
            </li>
          ) : null}
          {game.withSound ? (
            <li>
              <Icon name="sound" size={16} />
              Som ligado
            </li>
          ) : null}
        </ul>
      ) : null}
      {going || !session ? (
        <div className="going">
          {going ? (
            <span className="stack" aria-hidden="true">
              {(friends.length ? friends.slice(0, 3) : [null, null, null]).map(
                (friend, index) => (
                  <span
                    key={friend?.name ?? index}
                    style={{ background: AVATAR_BG[index] }}
                  >
                    {friend?.image ? (
                      <img src={friend.image} alt="" />
                    ) : friend ? (
                      firstName(friend.name)[0]
                    ) : null}
                  </span>
                )
              )}
            </span>
          ) : null}
          <span>
            {going ? (
              <>
                {going.count !== null ? (
                  <b className="mono">{going.count}</b>
                ) : null}{' '}
                {going.text}
              </>
            ) : null}
            {!session ? (
              <small>
                <button className="linkish" type="button" onClick={onFriends}>
                  Entre
                </button>{' '}
                para ver se algum amigo vai.
              </small>
            ) : null}
          </span>
        </div>
      ) : null}

      {mine && attendance?.code ? (
        <div className="ticket">
          <span className="qr">
            <QRCode value={codeUrl(attendance.code)} size={44} />
          </span>
          <span>
            <span className="lb">SEU CÓDIGO</span>
            <span className="cd" aria-hidden="true">
              {attendance.code.slice(0, 3)} {attendance.code.slice(3)}
            </span>
            <span className="sr">
              Código {attendance.code.split('').join(' ')}
            </span>
          </span>
          <button className="btn b-ink sm" type="button" onClick={onCode}>
            Abrir
          </button>
        </div>
      ) : null}
      {game.houseOffer && bar.issuesCode ? (
        <div className="offer">
          <i>
            <Icon name="beer" size={18} />
          </i>
          <span>
            {mine && attendance?.code ? (
              <>
                Mostrou o código no balcão, ganhou:{' '}
                <b>{bare(game.houseOffer)}</b>.
              </>
            ) : (
              <>
                Oferta da casa neste jogo: <b>{bare(game.houseOffer)}</b>, para
                quem mostra o código no balcão.
              </>
            )}
          </span>
        </div>
      ) : null}

      <div className="act" id="cta-anchor" ref={anchorRef}>
        {mine ? (
          <>
            {attendance?.code ? (
              <button
                className="btn b-acid full-w"
                type="button"
                onClick={onCode}
              >
                <Icon name="qr" />
                Mostrar código no balcão
              </button>
            ) : null}
            <div className="row2">
              <button
                className="btn b-ghost sm"
                type="button"
                onClick={onShare}
              >
                <Icon name="share" size={18} />
                Chamar a turma
              </button>
              {route}
            </div>
            {state === 'upcoming' && !attendance?.validated ? (
              <button
                className="txtbtn"
                type="button"
                onClick={onUnmark}
                disabled={busy}
              >
                Não vou mais
              </button>
            ) : null}
          </>
        ) : (
          <>
            {canMark ? (
              <>
                <button
                  className="btn b-acid full-w"
                  type="button"
                  onClick={onGo}
                  disabled={busy}
                >
                  {busy ? 'Marcando…' : 'Vou assistir aqui'}
                </button>
                <p className="note">
                  {bar.issuesCode
                    ? session
                      ? 'Grátis. Você recebe o código do balcão.'
                      : 'Grátis e sem reserva de mesa: você avisa que vai e recebe o código do balcão.'
                    : 'Grátis e sem reserva de mesa: você só avisa que vai.'}
                </p>
              </>
            ) : state === 'live' ? (
              <>
                {route}
                <p className="note">O jogo já começou: é só chegar.</p>
              </>
            ) : (
              route
            )}
            <button
              className="btn b-ghost sm full-w"
              type="button"
              onClick={onShare}
            >
              <Icon name="share" size={18} />
              Mandar pro grupo
            </button>
          </>
        )}
      </div>
    </section>
  )
}

/** A oferta como o bar escreveu, sem o ponto final: a frase põe o dela. */
const bare = (offer: string) => offer.trim().replace(/[.!;,]+$/, '')

function codeUrl(code: string) {
  const origin =
    typeof window === 'undefined' ? SITE_URL : window.location.origin
  return `${origin}/admin/validate?code=${code}`
}

function EmptyCard({
  bar,
  anchorRef,
  saved,
  directionsUrl,
  onDirections,
  onSave
}: {
  bar: LiveBar
  anchorRef: React.RefObject<HTMLDivElement | null>
  saved: boolean
  directionsUrl: string | null
  onDirections: () => void
  onSave: () => void
}) {
  const opening = bar.opening
  const shut = opening ? !opening.open : false
  const what = [
    screensLabel(bar)?.toLowerCase(),
    bar.amenities.includes(2) ? 'som do jogo' : null,
    bar.amenities.includes(4) ? 'área externa' : null
  ].filter(Boolean)
  const list =
    what.length > 1
      ? `${what.slice(0, -1).join(', ')} e ${what.at(-1)}`
      : (what[0] ?? '')
  const text = !opening
    ? `O ${bar.name} ainda não publicou jogos nesta semana. Quando o bar marcar um jogo, ele aparece aqui.`
    : shut
      ? `O ${bar.name} ainda não publicou jogos nesta semana.${list ? ` Quando abrir, tem ${list}.` : ''}`
      : `O ${bar.name} ainda não publicou jogos nesta semana, mas a casa está aberta${list ? `: ${list}` : ''}.`
  return (
    <section
      className={`today empty o-today on-ink${opening ? '' : ' bare'}`}
      aria-labelledby="t-h"
      id="today"
    >
      {opening ? (
        <div className={`now${shut ? ' shut' : ''}`}>
          <span className="dot" aria-hidden="true" />
          <span className="st">{shut ? 'Fechado agora' : 'Aberto agora'}</span>
          <span className="when">
            {shut
              ? opening.opens
                ? `Abre ${opening.opens.day === 'hoje' || opening.opens.day === 'amanhã' ? opening.opens.day : `${opening.opens.day}`} às ${opening.opens.time}`
                : 'Sem horário nos próximos dias'
              : `Até ${opening.closes}`}{' '}
            · {opening.today}
          </span>
        </div>
      ) : null}
      <h2 id="t-h">Sem jogo marcado</h2>
      <p>{text}</p>
      <div className="act" id="cta-anchor" ref={anchorRef}>
        {!shut && directionsUrl ? (
          <a
            className="btn b-acid full-w"
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDirections}
          >
            <Icon name="pin" />
            Como chegar
          </a>
        ) : null}
        <button
          className={`btn ${!shut && directionsUrl ? 'b-ghost sm' : 'b-acid'} full-w`}
          type="button"
          onClick={onSave}
          aria-pressed={saved}
        >
          <Icon name="heart" size={18} />
          {saved ? 'Salvo em Seus bares' : 'Salvar o bar'}
        </button>
      </div>
    </section>
  )
}

function NextGames({
  bar,
  current,
  now,
  attendingIds,
  onPick
}: {
  bar: LiveBar
  current: PublicGame
  now: Date
  attendingIds: string[]
  onPick: (id: string) => void
}) {
  const open = bar.events.filter((game) => gameState(game, now) !== 'ended')
  const rest = open.filter((game) => game.id !== current.id)
  if (!rest.length) return null
  return (
    <section className="sec o-next" aria-labelledby="n-h">
      <div className="sh">
        <h2 id="n-h">Próximos jogos aqui</h2>
        <span className="aside">
          {open.length} {open.length === 1 ? 'jogo' : 'jogos'}
        </span>
      </div>
      <ul className="nextl">
        {rest.map((game) => {
          const live = gameState(game, now) === 'live'
          const going = attendingIds.includes(game.id)
          return (
            <li key={game.id}>
              <button type="button" onClick={() => onPick(game.id)}>
                <span className={`h${live ? ' lv' : ''}`}>
                  {live ? 'AGORA' : clock(game.startsAt)}
                  <small>
                    {live ? 'ao vivo' : dayLabel(game.startsAt, now)}
                  </small>
                </span>
                <span>
                  <b>{game.title}</b>
                  <span className="m">
                    {[
                      game.championship !== game.title
                        ? game.championship
                        : null,
                      game.going !== null ? `${game.going} vão` : null,
                      game.houseOffer ? 'com oferta' : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {going ? (
                  <span className="tg vou">
                    <Icon name="check" size={15} />
                    Vou
                  </span>
                ) : live ? (
                  <span className="tg lv">Ao vivo</span>
                ) : game.onBigScreen ? (
                  <span className="tg">
                    <Icon name="tv" size={15} />
                    Telão
                  </span>
                ) : game.withSound ? (
                  <span className="tg">
                    <Icon name="sound" size={15} />
                    Som ligado
                  </span>
                ) : (
                  <span />
                )}
                <span className="go">
                  <Icon name="next" size={18} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Gallery({ bar }: { bar: LiveBar }) {
  const [category, setCategory] = useState<string | null>(null)
  if (!bar.photos.length && !bar.description) return null
  const categories = [...new Set(bar.photos.map((photo) => photo.category))]
  const shown = bar.photos.filter(
    (photo) => !category || photo.category === category
  )
  return (
    <section className="sec o-gal" aria-labelledby="g-h">
      <div className="sh">
        <h2 id="g-h">O ambiente</h2>
        {bar.photos.length ? (
          <span className="aside">
            {bar.photos.length} {bar.photos.length === 1 ? 'foto' : 'fotos'}
          </span>
        ) : null}
      </div>
      {bar.description ? <p className="desc">{bar.description}</p> : null}
      {categories.length > 1 ? (
        <div className="chips">
          {[null, ...categories].map((id) => (
            <button
              key={id ?? 'todas'}
              className="chip"
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {id ? photoCategoryLabel(id) : 'Todas'}{' '}
              <span className="c">
                {id
                  ? bar.photos.filter((photo) => photo.category === id).length
                  : bar.photos.length}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <div className="gal">
          {shown.map((photo) => (
            <figure key={photo.id}>
              <img
                src={photo.url}
                alt={photo.caption ?? photoCategoryLabel(photo.category)}
                loading="lazy"
              />
              {photo.caption ? (
                <figcaption>
                  <span>{photo.caption}</span>
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function Amenities({ bar }: { bar: LiveBar }) {
  const groups = amenityGroups(bar.amenities)
  if (!groups.length) return null
  return (
    <section className="sec o-amen" aria-labelledby="a-h">
      <div className="sh">
        <h2 id="a-h">O que tem</h2>
      </div>
      <div className="amen">
        {groups.map((group) => (
          <div key={group.label}>
            <h3>{group.label}</h3>
            <ul>
              {group.items.map((item) => {
                const icon = AMENITY_ICON[item.id]
                return (
                  <li key={item.id}>
                    {icon ? (
                      <Icon name={icon} size={19} />
                    ) : (
                      <span className="d" aria-hidden="true" />
                    )}
                    {item.label}
                    {item.id === 1 && bar.screenCount
                      ? ` · ${bar.screenCount}`
                      : ''}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function Rating({ bar }: { bar: LiveBar }) {
  const reasons = bar.ratingReasons
  return (
    <section className="sec o-rate" aria-labelledby="r-h">
      <div className="sh">
        <h2 id="r-h">O que dizem</h2>
      </div>
      {bar.rating ? (
        <>
          <div className="score">
            <span className="big">
              {bar.rating.percentage}
              <small>%</small>
            </span>
            <p>
              <b>voltariam</b>
              de {bar.rating.total} avaliações
            </p>
          </div>
          {reasons && (reasons.positive.length || reasons.negative.length) ? (
            <div className="reasons">
              <h3>O que pesou</h3>
              <ul className="tags">
                {reasons.positive.map((id) => (
                  <li key={`p-${id}`} className="pos">
                    <Icon name="check" size={14} />
                    {reasonLabel(id)}
                  </li>
                ))}
                {reasons.negative.map((id) => (
                  <li key={`n-${id}`} className="neg">
                    {reasonLabel(id)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="verif">
            Avalia quem mostrou que ia ao jogo, depois do apito final.
          </p>
        </>
      ) : (
        <div className="fresh">
          <i>
            <Icon name="star" />
          </i>
          <span>
            <b>As primeiras avaliações estão chegando.</b>
            Depois do jogo, quem assistiu aqui conta se voltaria. A nota aparece
            assim que juntar opiniões suficientes.
          </span>
        </div>
      )}
    </section>
  )
}

function Where({
  bar,
  distance,
  directionsUrl,
  whatsappUrl,
  onDirections,
  onWhatsApp,
  onPhone
}: {
  bar: LiveBar
  distance: string | null
  directionsUrl: string | null
  whatsappUrl: string | null
  onDirections: () => void
  onWhatsApp: () => void
  onPhone: () => void
}) {
  const [client, setClient] = useState(false)
  useEffect(() => setClient(true), [])
  const lat = Number(bar.latitude)
  const lng = Number(bar.longitude)
  const showMap =
    client &&
    Boolean(env.VITE_MAP_TILES_URL) &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  return (
    <section className="box o-where" aria-labelledby="w-h">
      {showMap ? (
        <div className="minimap" aria-hidden="true">
          <Suspense fallback={null}>
            <OnsideMap
              bars={[
                {
                  id: bar.id,
                  name: bar.name,
                  lat,
                  lng,
                  pin: pinDoPlano(bar.plan)
                }
              ]}
              center={{ lat, lng }}
            />
          </Suspense>
        </div>
      ) : null}
      <h3 id="w-h" className="sr">
        Onde fica
      </h3>
      <p className="addr">{bar.address}</p>
      <p>
        {bar.neighborhood}, {bar.city}
        {distance ? (
          <>
            {' · '}
            <span className="mono">{distance}</span> de você
          </>
        ) : null}
      </p>
      <div className="btns">
        {directionsUrl ? (
          <a
            className="btn b-ink sm"
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDirections}
          >
            <Icon name="map" size={18} />
            Como chegar
          </a>
        ) : null}
        {whatsappUrl ? (
          <a
            className="btn b-ghost sm"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhatsApp}
          >
            <Icon name="chat" size={18} />
            WhatsApp
          </a>
        ) : null}
        {bar.phone ? (
          <a
            className="btn b-ghost sm"
            href={`tel:${bar.phone.replace(/[^\d+]/g, '')}`}
            aria-label={`Ligar para ${bar.phone}`}
            onClick={onPhone}
          >
            <Icon name="phone" size={18} />
            Ligar
          </a>
        ) : null}
      </div>
      {bar.phone ? <p className="tel">{bar.phone}</p> : null}
    </section>
  )
}

function Hours({ bar, now }: { bar: LiveBar; now: Date }) {
  const spend = bar.averageSpendCents
  if (!bar.openingHours && spend === null && !bar.menuUrl) return null
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    now.toLocaleDateString('en-US', {
      timeZone: BRASILIA_TIME_ZONE,
      weekday: 'short'
    })
  )
  return (
    <section className="box o-hrs" aria-labelledby="h-h">
      {bar.openingHours ? (
        <>
          <h3 id="h-h">Horário</h3>
          <ul className="hrs">
            {groupOpeningHours(bar.openingHours).map((row) => (
              <li
                key={row.days}
                className={row.dayIndexes.includes(weekday) ? 'td' : undefined}
              >
                <span>{row.days}</span>
                <span>{row.hours?.replace(' – ', '–') ?? 'Fechado'}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <h3 id="h-h">Na mesa</h3>
      )}
      {spend !== null || bar.menuUrl ? (
        <div className="menu">
          {spend !== null ? (
            <div>
              <span>Gasto médio por pessoa</span>
              <b>
                {(spend / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 0
                })}
              </b>
            </div>
          ) : (
            <span />
          )}
          {bar.menuUrl ? (
            <a
              className="btn b-ghost sm"
              href={bar.menuUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Cardápio <Icon name="ext" size={16} />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function NearSection({ nearby, now }: { nearby: Nearby[]; now: Date }) {
  return (
    <section className="sec o-near" aria-labelledby="p-h" id="perto">
      <div className="sh">
        <h2 id="p-h">Com jogo hoje perto daqui</h2>
      </div>
      <div className="near">
        {nearby.map((item) => {
          const live = gameState(item, now) === 'live'
          return (
            <a className="nc" href={item.path} key={item.id}>
              <span className="ph">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt="" loading="lazy" />
                ) : null}
                <span className={`w${live ? ' lv' : ''}`}>
                  {live ? '● AO VIVO' : clock(item.startsAt)}
                </span>
              </span>
              <span className="bd">
                <b>{item.name}</b>
                <span>
                  {item.title}
                  <br />
                  {item.neighborhood}
                </span>
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function CodeModal({
  code,
  game,
  bar,
  now,
  onClose
}: {
  code: string
  game: PublicGame
  bar: LiveBar
  now: Date
  onClose: () => void
}) {
  return (
    <Dialog className="modal ink" label="Mostre no balcão" onClose={onClose}>
      <button
        className="btn b-paper ic x"
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        // biome-ignore lint/a11y/noAutofocus: o diálogo abre com o foco no fechar, como o protótipo.
        autoFocus
      >
        <Icon name="close" size={18} />
      </button>
      <h2>Mostre no balcão</h2>
      <div className="bigcode">
        <QRCode value={codeUrl(code)} size={196} />
      </div>
      <div className="codetxt" aria-hidden="true">
        {code.slice(0, 3)} {code.slice(3)}
      </div>
      <p className="sr">Código {code.split('').join(' ')}</p>
      <p className="sub">
        {game.title} · {bar.name} ·{' '}
        {gameState(game, now) === 'live'
          ? 'ao vivo'
          : `${dayLabel(game.startsAt, now)} ${clock(game.startsAt)}`}
      </p>
      {game.houseOffer ? (
        <div className="offer" style={{ marginTop: 18 }}>
          <i>
            <Icon name="beer" size={18} />
          </i>
          <span>
            Vale: <b>{bare(game.houseOffer)}</b>. O garçom confere pelo QR ou
            pelo código.
          </span>
        </div>
      ) : null}
      <p className="sub" style={{ marginTop: 14 }}>
        Aumente o brilho da tela. O código é só seu e vale para este jogo. Ele
        também fica em Meus jogos.
      </p>
    </Dialog>
  )
}

function ShareModal({
  bar,
  text,
  url,
  onClose
}: {
  bar: LiveBar
  text: string
  url: string
  onClose: () => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado.')
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie.')
    }
  }
  return (
    <Dialog className="modal" label="Mandar pro grupo" onClose={onClose}>
      <button
        className="btn b-ghost ic x"
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        // biome-ignore lint/a11y/noAutofocus: o diálogo abre com o foco no fechar, como o protótipo.
        autoFocus
      >
        <Icon name="close" size={18} />
      </button>
      <h2>Mandar pro grupo</h2>
      <div className="preview">
        <img src={bar.photoUrl ?? '/og-image.jpg'} alt="" />
        <div className="t">
          <b>
            {bar.name} · {bar.neighborhood}
          </b>
          <p>{text}</p>
          <div className="u">onside.sh</div>
        </div>
      </div>
      <div className="linkrow">
        <span>{url.replace(/^https?:\/\//, '')}</span>
        <button className="btn b-ghost sm" type="button" onClick={copy}>
          <Icon name="copy" size={16} />
          Copiar
        </button>
      </div>
      <div className="btns" style={{ marginTop: 12 }}>
        <a
          className="btn b-acid full-w"
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          <Icon name="chat" />
          Mandar no WhatsApp
        </a>
      </div>
    </Dialog>
  )
}
