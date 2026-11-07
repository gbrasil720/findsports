import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useMinuteNow } from '@/components/app/minute-tick'
import { OnsideMap } from '@/components/app/onside-map'
import { brasiliaTime } from '@/components/painel/noite'
import { CartaoBar } from '@/components/torcedor/explorar/cartao-bar'
import { Carrossel, Dias, Regua } from '@/components/torcedor/explorar/regua'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell, useTorcedor } from '@/components/torcedor/shell'
import { normalizeRadiusKm, SAO_PAULO_CITY } from '@/domain/discovery'
import {
  type BarDoJogo,
  baresDoJogo,
  diasDaRegua,
  distancia,
  eliteNoClassico,
  estadoDoJogo,
  type JogoDaRegua,
  jogoInicial,
  jogosDaBusca,
  type Ordem
} from '@/domain/explorar'
import { canRecordCommercialEvents } from '@/domain/viewer'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Busca = { dia?: string; jogo?: string; raio?: number }

/** Os raios da busca (o protótipo vai de 0,5 a 5 km; os bares estão mais espalhados). */
const RAIOS = [1, 3, 5, 10, 25]

export const Route = createFileRoute('/(dashboard)/dashboard')({
  head: () => ({
    meta: [
      { title: 'Bares com jogo hoje — Onside' },
      {
        name: 'description',
        content:
          'Escolha o jogo e veja os bares perto de você que vão passar, com telão, som e quem vai.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  validateSearch: (search: Record<string, unknown>): Busca => ({
    ...(typeof search.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.dia)
      ? { dia: search.dia }
      : {}),
    ...(typeof search.jogo === 'string' ? { jogo: search.jogo } : {}),
    ...(typeof search.raio === 'number' && RAIOS.includes(search.raio)
      ? { raio: search.raio }
      : {})
  }),
  component: Explorar
})

/** Os filtros do protótipo, nas características do bar (`lib/amenities`). */
const FILTROS: [string, string, number | null][] = [
  ['screen', 'Telão', 1],
  ['sound', 'Som ligado', 2],
  ['out', 'Área externa', 4],
  ['metro', 'Perto do metrô', 22],
  ['offer', 'Oferta da casa', null],
  ['late', 'Cozinha até tarde', 11]
]

function useCelular() {
  const [celular, setCelular] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const mudar = () => setCelular(mq.matches)
    mudar()
    mq.addEventListener('change', mudar)
    return () => mq.removeEventListener('change', mudar)
  }, [])
  return celular
}

function Explorar() {
  // A busca mora no cabeçalho da casca; o Explorar a lê.
  const [busca, setBusca] = useState('')
  return (
    <TorcedorShell aba="explorar" busca={{ valor: busca, onMudar: setBusca }}>
      <ExplorarConteudo busca={busca} />
    </TorcedorShell>
  )
}

function ExplorarConteudo({ busca }: { busca: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const session = useSession()
  const { fan, agir, avisar } = useTorcedor()
  const search = Route.useSearch()
  const now = useMinuteNow()
  const celular = useCelular()
  const hoje = brasiliaDay(now)
  const dias = diasDaRegua(hoje)
  const dia =
    search.dia && dias.some((d) => d.day === search.dia) ? search.dia : hoje
  const rotuloDoDia = dias.find((d) => d.day === dia)?.rotulo ?? 'Hoje'
  const raio =
    search.raio ??
    RAIOS.find((r) => r >= normalizeRadiusKm(session?.user.searchRadiusKm)) ??
    5
  const [ligados, setLigados] = useState<string[]>([])
  const [ordem, setOrdem] = useState<Ordem>('perto')
  const [quente, setQuente] = useState<string | null>(null)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [tocado, setTocado] = useState<string | null>(null)

  // Centro: o aparelho, senão a cidade do perfil, senão São Paulo.
  const [aparelho, setAparelho] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const pedirLocal = useCallback(
    (avisarErro = false) => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        (p) => setAparelho({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {
          if (avisarErro) avisar('O navegador não liberou sua localização.')
        },
        { timeout: 10_000, maximumAge: 5 * 60_000 }
      )
    },
    [avisar]
  )
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'granted') pedirLocal()
      })
      .catch(() => {})
  }, [pedirLocal])
  const cidadeQuery = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    enabled: fan,
    meta: { errorToast: false }
  })
  const cidade = cidadeQuery.data ?? SAO_PAULO_CITY
  const centro = aparelho ?? { lat: cidade.lat, lng: cidade.lng }
  const ondeRotulo = aparelho ? 'Perto de você' : `${cidade.name}, ${cidade.uf}`
  const esperandoCidade = fan && cidadeQuery.isPending && !aparelho

  const quadro = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({
      lat: centro.lat,
      lng: centro.lng,
      radiusKm: raio,
      day: dia
    }),
    enabled: !esperandoCidade,
    placeholderData: (anterior) => anterior,
    meta: { errorToast: false }
  })
  const config = useQuery(trpc.appConfig.getPublic.queryOptions())
  const notaPublica = config.data?.['rating.public_display'] === true

  const favoritos = useQuery({
    ...trpc.pubs.getFavorites.queryOptions(),
    enabled: fan,
    meta: { errorToast: false }
  })
  const salvos = useMemo(
    () => new Set((favoritos.data ?? []).map((f) => f.barId)),
    [favoritos.data]
  )
  const meus = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    enabled: fan,
    meta: { errorToast: false }
  })
  const vou = useMemo(
    () => new Set((meus.data ?? []).map((m) => m.eventId)),
    [meus.data]
  )
  const tirar = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getFavorites.queryKey()
        })
    })
  )

  const todos: JogoDaRegua[] = quadro.data?.games ?? []
  const jogos = jogosDaBusca(todos, busca)
  const jogo = jogoInicial(jogos, search.jogo, now)
  const estado = jogo ? estadoDoJogo(jogo, now) : 'next'
  const amenities = FILTROS.flatMap(([id, , valor]) =>
    ligados.includes(id) && valor !== null ? [valor] : []
  )
  const lista = baresDoJogo(jogo, {
    amenities,
    oferta: ligados.includes('offer'),
    busca,
    ordem
  })
  const total = jogo?.bars.length ?? 0

  /*
   * "Entrega nos clássicos" (WEB-130), com as regras da busca antiga: só
   * torcedor de verdade (sem impersonação), só na ordem padrão (onde o Elite
   * do clássico vai na frente) e só com a régua assentada. A exposição sai
   * uma vez por jogo nesta tela; o clique, a cada abertura.
   */
  const entregaGarantida =
    canRecordCommercialEvents(
      session?.user.role,
      session?.session.impersonatedBy
    ) &&
    ordem === 'perto' &&
    quadro.isSuccess &&
    !quadro.isPlaceholderData
  const expostos = useRef(new Set<string>())
  useEffect(() => {
    if (!entregaGarantida) return
    for (const bar of lista) {
      if (!eliteNoClassico(bar) || expostos.current.has(bar.eventId)) continue
      expostos.current.add(bar.eventId)
      trackCommercialEvent({
        pubId: bar.barId,
        type: 'classic_exposure',
        sourceEventId: bar.eventId
      })
    }
  }, [entregaGarantida, lista])
  const medirClique = (bar: BarDoJogo | undefined) => {
    if (!bar || !entregaGarantida || !eliteNoClassico(bar)) return
    trackCommercialEvent({
      pubId: bar.barId,
      type: 'classic_click',
      sourceEventId: bar.eventId
    })
  }

  const irPara = (mudar: Busca) =>
    navigate({
      to: '/dashboard',
      search: (atual: Busca) => ({ ...atual, ...mudar }),
      replace: true
    })

  const salvar = (bar: BarDoJogo) => {
    if (salvos.has(bar.barId)) {
      tirar.mutate(
        { barId: bar.barId },
        {
          onSuccess: () => avisar(`${bar.name} saiu de Seus bares.`),
          onError: (e) =>
            avisar(
              getUserFacingMessage(e, 'Não deu para tirar. Tente de novo.')
            )
        }
      )
      return
    }
    analytics.barIntent({ bar_id: bar.barId, action: 'favorite' })
    agir({
      tipo: 'fav',
      acao: { tipo: 'fav', id: bar.barId },
      contexto: {
        foto: bar.photoUrl,
        titulo: bar.name,
        sub: `${bar.neighborhood} · ${distancia(bar.distanceKm)}`
      }
    })
  }
  const marcar = (bar: BarDoJogo) => {
    if (!jogo) return
    agir({
      tipo: 'vou',
      acao: { tipo: 'vou', id: bar.eventId },
      contexto: {
        foto: bar.photoUrl,
        titulo: bar.name,
        sub: `${jogo.title} · ${rotuloDoDia.toLowerCase()} ${brasiliaTime(jogo.startsAt)}`
      }
    })
  }
  const lembrar = () => {
    const primeiro = jogo?.bars[0]
    if (!jogo || !primeiro) return
    agir({
      tipo: 'lembrar',
      acao: { tipo: 'lembrar', id: primeiro.eventId },
      contexto: {
        hora: brasiliaTime(jogo.startsAt),
        titulo: jogo.title,
        sub: `${jogo.championship} · ${rotuloDoDia.toLowerCase()}`
      }
    })
  }
  const mandar = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({
          title: jogo ? `${jogo.title}: onde passa` : 'Bares com jogo',
          url
        })
      } else {
        await navigator.clipboard.writeText(url)
        avisar('Link copiado. É só colar no grupo.')
      }
    } catch {
      // Compartilhar cancelado.
    }
  }

  const titulo = jogo ? <TituloDoJogo titulo={jogo.title} /> : 'Sem jogo perto'
  const hora = jogo
    ? estado === 'live'
      ? 'Rolando agora'
      : brasiliaTime(jogo.startsAt)
    : ''

  const chips = (id: string) => (
    <fieldset className="chips" aria-label="Filtros">
      <label className="chip rad" htmlFor={id}>
        <Ic n="pin" s={16} />
        <span className="sr">Raio</span>
        <select
          id={id}
          value={raio}
          onChange={(e) => void irPara({ raio: Number(e.target.value) })}
        >
          {RAIOS.map((r) => (
            <option key={r} value={r}>
              Até {r} km
            </option>
          ))}
        </select>
      </label>
      {FILTROS.map(([chave, rotulo]) => {
        const on = ligados.includes(chave)
        return (
          <button
            key={chave}
            type="button"
            className={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() =>
              setLigados((atual) =>
                on ? atual.filter((x) => x !== chave) : [...atual, chave]
              )
            }
          >
            {rotulo}
          </button>
        )
      })}
      {/* No celular o protótipo não tem ordem; aqui ela vai no fim da fileira. */}
      <label className="sort">
        <span>Ordenar</span>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
        >
          <option value="perto">Mais perto</option>
          <option value="gente">Mais gente indo</option>
          {notaPublica ? <option value="nota">Melhor nota</option> : null}
        </select>
      </label>
    </fieldset>
  )

  const cartoes = (curto: boolean) =>
    jogo
      ? lista.map((bar, i) => (
          <CartaoBar
            key={bar.barId}
            bar={bar}
            jogo={jogo}
            estado={estado}
            rotuloDoDia={rotuloDoDia}
            salvo={salvos.has(bar.barId)}
            vou={vou.has(bar.eventId)}
            quente={quente === bar.barId}
            atraso={curto ? 0 : i * 45}
            curto={curto}
            onSalvar={() => salvar(bar)}
            onVou={() => marcar(bar)}
            onQuente={celular ? undefined : setQuente}
            onAbrir={() => medirClique(bar)}
          />
        ))
      : null

  const proximoRaio = RAIOS[RAIOS.indexOf(raio) + 1]
  const vazio = quadro.isError ? (
    <div className="empty" role="alert">
      <b>Não carregou</b>
      <p>
        {getUserFacingMessage(
          quadro.error,
          'Não deu para buscar os jogos agora.'
        )}
      </p>
      {isRetryableError(quadro.error) ? (
        <button
          className="btn b-ink sm"
          type="button"
          onClick={() => void quadro.refetch()}
        >
          Tentar de novo
        </button>
      ) : null}
    </div>
  ) : quadro.isPending ? (
    <div className="empty" role="status" aria-busy="true">
      <b>Procurando jogos</b>
      <p>Os bares perto de você que vão passar.</p>
    </div>
  ) : !jogo ? (
    <div className="empty">
      <b>Nenhum jogo perto</b>
      <p>
        {busca
          ? 'Nada com essa busca neste dia. Tente outro time, bar ou bairro.'
          : `Nenhum bar até ${raio} km publicou jogo para ${rotuloDoDia.toLowerCase()}.`}
      </p>
      {proximoRaio ? (
        <button
          className="btn b-ink sm"
          type="button"
          onClick={() => void irPara({ raio: proximoRaio })}
        >
          Ver até {proximoRaio} km
        </button>
      ) : null}
    </div>
  ) : !lista.length ? (
    <div className="empty">
      <b>Nenhum bar com tudo isso</b>
      <p>
        {total} {total === 1 ? 'bar passa' : 'bares passam'} este jogo. Aumente
        o raio ou tire um filtro.
      </p>
      <button
        className="btn b-ink sm"
        type="button"
        onClick={() => setLigados([])}
      >
        Limpar filtros
      </button>
    </div>
  ) : null

  const pinos = lista.map((bar) => ({
    id: bar.barId,
    name: bar.name,
    lat: bar.latitude,
    lng: bar.longitude,
    pin:
      estado === 'live'
        ? bar.elite
          ? ('elite-live' as const)
          : ('live' as const)
        : bar.elite
          ? ('elite' as const)
          : ('starter' as const)
  }))
  const abrirBar = (id: string) => {
    const bar = lista.find((b) => b.barId === id)
    medirClique(bar)
    analytics.barOpened({
      bar_id: id,
      source: 'map',
      bar_plan: bar?.elite ? 'elite' : undefined
    })
    void navigate({
      to: '/pub/$pubId',
      params: { pubId: id },
      search: bar ? { eventId: bar.eventId } : undefined
    })
  }
  const mapa = (
    <OnsideMap
      bars={pinos}
      center={centro}
      showUserLocation={Boolean(aparelho)}
      radiusKm={raio}
      hoveredId={celular ? tocado : quente}
      onHover={celular ? undefined : setQuente}
      onSelect={celular ? setTocado : abrirBar}
    />
  )

  if (celular) {
    const escolhido = lista.find((b) => b.barId === tocado)
    return (
      <Celular
        topo={
          <>
            <Dias
              dias={dias}
              dia={dia}
              onDia={(d) => void irPara({ dia: d, jogo: undefined })}
            />
            <Carrossel
              jogos={jogos}
              escolhido={jogo?.key}
              onJogo={(key) => {
                setTocado(null)
                void irPara({ jogo: key })
              }}
              now={now}
            />
          </>
        }
        mapa={mapa}
        escolhido={escolhido}
        onSoltar={() => setTocado(null)}
        onAbrir={() => medirClique(escolhido)}
        cabeca={
          <>
            <h1 className="disp">{titulo}</h1>
            <p>
              {jogo
                ? `${hora} · ${lista.length} ${lista.length === 1 ? 'bar' : 'bares'} até ${raio} km · ${total} no total`
                : `${ondeRotulo} · até ${raio} km`}
            </p>
          </>
        }
        chips={chips('rad-m')}
      >
        <div className="mcards">
          {vazio ?? cartoes(true)}
          {jogo ? (
            <button
              className="btn b-ghost"
              type="button"
              style={{ marginTop: 6 }}
              onClick={() => void mandar()}
            >
              Mandar este jogo pro grupo
            </button>
          ) : null}
        </div>
      </Celular>
    )
  }

  return (
    <>
      <Regua
        dias={dias}
        dia={dia}
        onDia={(d) => void irPara({ dia: d, jogo: undefined })}
        jogos={jogos}
        escolhido={jogo?.key}
        onJogo={(key) => void irPara({ jogo: key })}
        now={now}
      />
      <div className={`main${mapaAberto ? ' showmap' : ''}`}>
        <section className="list" aria-labelledby="lt">
          <div className="lh">
            <div>
              <h1 id="lt" className="disp">
                {titulo}
              </h1>
              <p>
                {jogo
                  ? `${hora} · ${jogo.championship} · ${total} ${total === 1 ? 'bar passa' : 'bares passam'} · ${lista.length} até ${raio} km de você`
                  : `${ondeRotulo} · até ${raio} km`}
              </p>
            </div>
            {jogo && estado === 'next' ? (
              <div className="acts">
                <button
                  className="btn b-ghost sm"
                  type="button"
                  onClick={lembrar}
                >
                  <Ic n="bell" s={19} />
                  Me lembrar
                </button>
                <button
                  className="btn b-ghost sm"
                  type="button"
                  onClick={() => void mandar()}
                >
                  <Ic n="share" s={19} />
                  Mandar pro grupo
                </button>
              </div>
            ) : null}
          </div>
          {chips('rad-d')}
          <div className="cards">{vazio ?? cartoes(false)}</div>
        </section>
        <div className="mapcol">
          <div className="map">
            {mapa}
            <div className="mapbar">
              <span className="chip" style={{ cursor: 'default' }}>
                {lista.length} no mapa · até {raio} km
              </span>
              {aparelho ? null : (
                <button
                  className="chip"
                  type="button"
                  onClick={() => pedirLocal(true)}
                >
                  <Ic n="pin" s={16} />
                  Usar minha localização
                </button>
              )}
            </div>
            <div className="legend">
              <span>
                <i style={{ background: '#12120f' }} />
                com jogo
              </span>
              <span>
                <i
                  style={{
                    background: '#c9f135',
                    boxShadow: 'inset 0 0 0 1.5px #12120f'
                  }}
                />
                Elite
              </span>
              <span>
                <i style={{ background: '#e8320c' }} />
                ao vivo
              </span>
            </div>
          </div>
        </div>
      </div>
      <button
        className="btn b-ink mapbtn"
        type="button"
        onClick={() => setMapaAberto((aberto) => !aberto)}
      >
        {mapaAberto ? 'Ver lista' : 'Ver mapa'}
      </button>
    </>
  )
}

function TituloDoJogo({ titulo }: { titulo: string }) {
  const [a, b] = titulo.split(' × ')
  if (b === undefined) return <>{titulo}</>
  return (
    <>
      {a} <span className="hl">×</span> {b}
    </>
  )
}

type Snap = 'full' | 'half' | 'peek'

/**
 * O celular do protótipo (`.mx`): o mapa inteiro, os jogos em cima e a folha
 * de bares, que se arrasta em três alturas. Bar tocado no mapa ganha o cartão
 * curto (`.mpick`) e a folha desce.
 */
function Celular({
  topo,
  mapa,
  escolhido,
  onSoltar,
  onAbrir,
  cabeca,
  chips,
  children
}: {
  topo: ReactNode
  mapa: ReactNode
  escolhido: BarDoJogo | undefined
  onSoltar: () => void
  onAbrir: () => void
  cabeca: ReactNode
  chips: ReactNode
  children: ReactNode
}) {
  const mx = useRef<HTMLDivElement>(null)
  const mtop = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snap>('half')
  const [y, setY] = useState<number | null>(null)
  const [, setMedida] = useState(0)
  const arraste = useRef<{ y0: number; t0: number; moveu: number } | null>(null)
  const alturas = () => {
    const H = mx.current?.clientHeight ?? 700
    const t = mtop.current?.offsetHeight ?? 120
    return { full: t - 14, half: Math.round(H * 0.46), peek: H - 150 }
  }
  useEffect(() => {
    const medir = () => setMedida((n) => n + 1)
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  useEffect(() => {
    if (escolhido) setSnap('peek')
  }, [escolhido])

  const posicao = y ?? alturas()[snap]
  const baixo = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    arraste.current = { y0: e.clientY, t0: posicao, moveu: 0 }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    const a = arraste.current
    if (!a) return
    const d = e.clientY - a.y0
    a.moveu = Math.max(a.moveu, Math.abs(d))
    const s = alturas()
    setY(Math.min(s.peek + 20, Math.max(s.full - 10, a.t0 + d)))
  }
  const soltar = () => {
    const a = arraste.current
    if (!a) return
    arraste.current = null
    const s = alturas()
    if (a.moveu < 6) {
      setSnap((atual) =>
        atual === 'peek' ? 'half' : atual === 'half' ? 'full' : 'peek'
      )
    } else {
      const atual = y ?? s[snap]
      setSnap(
        (['full', 'half', 'peek'] as const).reduce((m, k) =>
          Math.abs(s[k] - atual) < Math.abs(s[m] - atual) ? k : m
        )
      )
    }
    setY(null)
  }
  const alca = {
    onPointerDown: baixo,
    onPointerMove: mover,
    onPointerUp: soltar,
    onPointerCancel: soltar
  }
  const H = mx.current?.clientHeight ?? 0

  return (
    <div className="mx" ref={mx}>
      <div className="map">{mapa}</div>
      <div className="mtop" ref={mtop}>
        {topo}
      </div>
      {escolhido ? (
        <div className="mpick" style={{ bottom: H - posicao + 12 }}>
          <Link
            to="/pub/$pubId"
            params={{ pubId: escolhido.barId }}
            search={{ eventId: escolhido.eventId }}
            onClick={onAbrir}
            className="mpick-a"
          >
            {escolhido.photoUrl ? (
              <img src={escolhido.photoUrl} alt="" width={72} height={72} />
            ) : (
              <span className="ph-vazio" />
            )}
            <span>
              <b>{escolhido.name}</b>
              <span>
                {distancia(escolhido.distanceKm)}
                {escolhido.going ? ` · ${escolhido.going.count} vão` : ''}
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="btn b-ghost ic x"
            aria-label="Fechar"
            onClick={onSoltar}
          >
            <Ic n="close" s={16} />
          </button>
        </div>
      ) : null}
      <section
        className={`msheet${y !== null ? ' drag' : ''}`}
        aria-label="Bares"
        style={{ transform: `translateY(${posicao}px)` }}
      >
        <div className="grab" {...alca}>
          <span />
        </div>
        <div className="mhd" {...alca}>
          {cabeca}
        </div>
        {chips}
        <div className="msc">{children}</div>
      </section>
    </div>
  )
}
