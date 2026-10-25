import { resolveEventScreen } from '@findsports_oficial/api/lib/event-screen'
import { actionPhase } from '@findsports_oficial/api/lib/transient-error'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type {
  AdminEvent,
  EventCreationPolicy,
  PolicyState
} from '@/components/admin/admin-model'
import {
  useEventsState,
  useMyAnalyticsEntitlements,
  useMyBar,
  useMyEventCreationPolicy,
  useMySubscription,
  useShowsGoing
} from '@/components/admin/admin-queries'
import {
  getAnalyticsRange,
  getAvailableAnalyticsPeriods
} from '@/components/admin/analytics-period'
import { AvisoDoPainel, CardDoPlano, NoPro } from '@/components/admin/avisos'
import { usePeriodoDesempenho } from '@/components/admin/desempenho-contas'
import { EventDeleteDialog } from '@/components/admin/event-delete-dialog'
import {
  type EventForm,
  EventFormComponent,
  type PreviaDoJogo
} from '@/components/admin/event-form'
import { getEventTemporalState } from '@/domain/events'
import {
  casaBusca,
  ehRascunho,
  type FiltroJogos,
  filtrarJogos,
  inicioDaSemana,
  montarSemana,
  rotuloSemana,
  somarDias
} from '@/domain/painel-jogos'
import { analytics } from '@/lib/analytics'
import { getLapsedPaidPlan } from '@/lib/lapsed-plan'
import { getPlan } from '@/lib/plan-catalog'
import { countLabel } from '@/lib/plural'
import { BAR_RESERVATIONS_QUERY, CATALOG_QUERY } from '@/lib/query-cache'
import {
  getErrorCode,
  getUserFacingMessage,
  isRetryableError
} from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  Botao,
  BotaoIcone,
  CabecalhoPagina,
  Campo,
  Card,
  Chip,
  EmBreve,
  Icone,
  Seg
} from '../painel'
import { ComoCadaJogoFoi } from './como-cada-jogo-foi'
import { JogoAberto, type JogoQuemVai } from './jogo-aberto'
import { ListaJogos, SemanaJogos } from './lista'

/**
 * `lapsedPlan` é o título do plano parado (`getLapsedPaidPlan`): Pro ou Elite
 * que caiu no limite do Starter lê por que parou, não "limite do plano"
 * (WEB-331).
 */
export function getCreateBlockReason(
  policyState: PolicyState,
  lapsedPlan?: string | null
): string | null {
  if (policyState.status === 'loading') return 'Verificando disponibilidade…'
  if (policyState.status === 'error') {
    return 'Não foi possível verificar a disponibilidade.'
  }
  if (policyState.policy.status === 'inactive') {
    return 'Ative um plano para adicionar eventos.'
  }
  if (!policyState.policy.canCreate) {
    return lapsedPlan
      ? `${lapsedPlan}: limite de jogos atingido.`
      : 'Limite do plano atingido.'
  }
  return null
}

export function getDeleteErrorMessage(error: unknown): string {
  // Chegou código ou avaliação depois que a grade carregou.
  if (getErrorCode(error) === 'PRECONDITION_FAILED') {
    return 'Este jogo já tem código de quem vai ou avaliação e não pode mais ser excluído.'
  }
  return getUserFacingMessage(
    error,
    'Não foi possível excluir o jogo. Tente novamente.'
  )
}

/** "Elite · jogos ilimitados", "Starter · 5 jogos por ciclo" (1ab). */
export function getPlanLine(
  policy: EventCreationPolicy,
  lapsed: boolean
): string | null {
  if (policy.status === 'unlimited') {
    return `${getPlan(policy.plan).name} · jogos ilimitados`
  }
  if (policy.status === 'limited') {
    return `${lapsed ? 'Pagamento pendente' : getPlan('starter').name} · ${countLabel(
      policy.limit,
      'jogo',
      'jogos'
    )} por ciclo`
  }
  return null
}

function toISOWithTimezone(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString()
}

function toDatetimeLocal(date: string | Date): string {
  const d = new Date(date)
  const offsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

/** Lista e jogo aberto lado a lado só a partir daqui; abaixo, o jogo abre na folha. */
const LARGA = '(min-width: 1100px)'
function useTelaLarga() {
  return useSyncExternalStore(
    (avisar) => {
      const media = window.matchMedia(LARGA)
      media.addEventListener('change', avisar)
      return () => media.removeEventListener('change', avisar)
    },
    () => window.matchMedia(LARGA).matches,
    () => true
  )
}

type Folha =
  | {
      tipo: 'novo'
      inicial?: Partial<EventForm>
      times?: AdminEvent['participants']
    }
  | { tipo: 'editar'; id: string }
  | { tipo: 'jogo'; id: string }

type Vista = 'lista' | 'semana'

/**
 * Jogos do painel do bar (telas 1n–1q): a grade em lista por dia ou em
 * semana, o jogo aberto à direita e o formulário na folha lateral. Rascunho
 * (WEB-436) só aparece aqui e no Hoje, e vai ao ar pelo "Publicar". O que o
 * design mostra e o servidor não tem (sugestões e importação da rodada,
 * oferta por jogo) aparece com "em breve".
 */
export function JogosPage({
  jogoInicial,
  novo,
  onNovoAberto,
  passados
}: {
  jogoInicial?: string
  /** `?novo=1` (Hoje, fim do onboarding): abre o "Novo jogo" quando pode. */
  novo?: boolean
  /** Tira o `?novo=1` da URL, para recarregar não abrir de novo. */
  onNovoAberto?: () => void
  /** `?passados=1` (o "Ver os jogos" do Desempenho): abre em Passados. */
  passados?: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const larga = useTelaLarga()

  const eventsState = useEventsState()
  const events = eventsState.status === 'ready' ? eventsState.events : []
  const { data: bar } = useMyBar()
  const { data: subscription } = useMySubscription()
  const showsGoing = useShowsGoing() === true
  const { data: entitlements } = useMyAnalyticsEntitlements()
  const policyQuery = useMyEventCreationPolicy()
  const policyState: PolicyState = policyQuery.isLoading
    ? { status: 'loading' }
    : policyQuery.isError || !policyQuery.data
      ? {
          status: 'error',
          retryable: isRetryableError(policyQuery.error),
          retry: () => {
            void policyQuery.refetch()
          }
        }
      : { status: 'ready', policy: policyQuery.data }

  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    meta: { errorToast: false }
  })
  const goingById = new Map<string, JogoQuemVai>(
    (going.data ?? []).map((game) => [game.id, game])
  )
  // Sinal relativo, nunca contagem (WEB-127). Falhou, a grade segue sem ele.
  const { data: interest } = useQuery({
    ...trpc.pub.getMyInterest.queryOptions(),
    meta: { errorToast: false }
  })
  const interestByEvent = new Map(
    interest?.status === 'ready'
      ? interest.events.map((item) => [item.eventId, item.ratio])
      : []
  )
  const {
    data: sports = [],
    isLoading: loadingSports,
    error: sportsError,
    refetch: refetchSports
  } = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })

  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroJogos>(
    passados ? 'passados' : 'proximos'
  )
  // Passados mostra "Como cada jogo foi" no período do Desempenho.
  const [periodo, escolherPeriodo] = usePeriodoDesempenho()
  const [vista, setVista] = useState<Vista>('lista')
  // A semana vai de domingo a sábado (decisão do dono), com hoje marcado; as
  // setas andam sete dias.
  const [semana, setSemana] = useState(() =>
    inicioDaSemana(brasiliaDay(Date.now()))
  )
  // `undefined`: o primeiro da lista; `null`: o dono fechou.
  const [aberto, setAberto] = useState<string | null | undefined>(jogoInicial)
  const [folha, setFolha] = useState<Folha | null>(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  // O jogo como está no formulário, para a semana mostrar "Editando" (1p).
  const [previa, setPrevia] = useState<PreviaDoJogo | null>(null)

  const lapsedPlan = getLapsedPaidPlan(subscription)
  const policyBlockReason = getCreateBlockReason(policyState, lapsedPlan?.title)
  const sportsErrorMessage = sportsError
    ? getUserFacingMessage(
        sportsError,
        'Não foi possível carregar os esportes. Tente novamente.'
      )
    : null
  const sportsErrorVisible =
    policyBlockReason === null && !loadingSports && sportsErrorMessage !== null
  const blockReason =
    policyBlockReason ??
    (loadingSports ? 'Carregando esportes…' : sportsErrorMessage)
  const createBlocked = blockReason !== null
  // Plano sem criação (limite, fora do ar): o motivo é o aviso do painel, e o
  // "Novo jogo" ganha o cadeado (1ab). Carregando ou com erro, segue a frase.
  const travadoPeloPlano =
    policyState.status === 'ready' && !policyState.policy.canCreate
  // Starter no limite: à direita, o card do plano e o que o Pro libera.
  const limiteStarter =
    travadoPeloPlano && !lapsedPlan && policyState.policy.status === 'limited'

  const invalidateMyEvents = () =>
    queryClient.invalidateQueries({ queryKey: trpc.pub.getMyEvents.queryKey() })
  // A prévia do perfil em "Meu espaço" lê a agenda por `pubs.getById`.
  const invalidateEvents = () =>
    Promise.all([
      invalidateMyEvents(),
      queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.pubs.getById.pathKey() }),
      // Desligar a lista de quem vai tira o jogo de Quem vai (WEB-437).
      queryClient.invalidateQueries({
        queryKey: trpc.barReservations.going.queryKey()
      })
    ])
  const invalidateEventsAndPolicy = () =>
    Promise.all([
      invalidateEvents(),
      queryClient.invalidateQueries({
        queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
      })
    ])

  const deleteMutation = useMutation(
    trpc.pub.deleteEvent.mutationOptions({
      onSuccess: (_, { eventId }) => {
        setExcluindo(null)
        if (aberto === eventId) setAberto(undefined)
        setFolha((atual) =>
          atual && 'id' in atual && atual.id === eventId ? null : atual
        )
        return invalidateEventsAndPolicy()
      },
      // Recusa quer dizer que a grade está velha: recarregada, o diálogo
      // passa a explicar o bloqueio (ou fecha, se o jogo já não existe).
      onError: () => invalidateMyEvents()
    })
  )
  const createMutation = useMutation(
    trpc.pub.createEvent.mutationOptions({
      onSuccess: () => {
        void invalidateEventsAndPolicy()
        setFolha(null)
      }
    })
  )
  const updateMutation = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSuccess: () => {
        // Publicar o rascunho gasta o limite do Starter.
        void invalidateEventsAndPolicy()
        setFolha(null)
      }
    })
  )
  // O "Publicar" da linha e do jogo aberto, sem abrir o formulário.
  const publishMutation = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSuccess: () => invalidateEventsAndPolicy(),
      onError: (error) =>
        toast.error(
          getUserFacingMessage(
            error,
            'Não foi possível publicar o jogo. Tente novamente.'
          )
        )
    })
  )
  const publicar = (eventId: string) =>
    publishMutation.mutate({ eventId, publish: true })
  const publicando = publishMutation.isPending
    ? (publishMutation.variables?.eventId ?? null)
    : null

  const handleSave = (form: EventForm, publicarJogo: boolean) => {
    const startsAt = toISOWithTimezone(form.startsAt)
    const endsAt = form.endsAt ? toISOWithTimezone(form.endsAt) : undefined
    const participantIds = form.participantIds
    if (folha?.tipo === 'novo') {
      createMutation.mutate(
        {
          sportId: form.sportId,
          championship: form.championship,
          startsAt,
          endsAt,
          participantIds,
          participantFreeText: form.participantFreeText || undefined,
          onBigScreen: form.onBigScreen,
          withSound: form.withSound,
          attendanceEnabled: form.attendanceEnabled,
          ...(publicarJogo ? {} : { draft: true })
        },
        {
          onSuccess: () => {
            const sport = sports.find((item) => item.id === form.sportId)
            analytics.eventCreated({
              championship: form.championship,
              sport: sport?.name ?? form.sportId,
              has_teams: participantIds.length > 0
            })
          }
        }
      )
    } else if (folha?.tipo === 'editar') {
      updateMutation.mutate({
        eventId: folha.id,
        sportId: form.sportId,
        championship: form.championship,
        startsAt,
        endsAt: endsAt ?? null,
        participantIds,
        participantFreeText: form.participantFreeText,
        onBigScreen: form.onBigScreen,
        withSound: form.withSound,
        attendanceEnabled: form.attendanceEnabled,
        ...(publicarJogo && eventoFolha && ehRascunho(eventoFolha)
          ? { publish: true as const }
          : {})
      })
    }
  }

  // Espera saber se a criação está aberta: travada, o motivo aparece na tela.
  const decidido = policyState.status !== 'loading' && !loadingSports
  useEffect(() => {
    if (!novo || !decidido) return
    if (!createBlocked) setFolha({ tipo: 'novo' })
    onNovoAberto?.()
  }, [novo, decidido, createBlocked, onNovoAberto])

  const abrirFolha = (proxima: Folha) => {
    createMutation.reset()
    updateMutation.reset()
    setPrevia(null)
    setFolha(proxima)
  }
  const novoJogo = (inicial?: Partial<EventForm>) => {
    if (!createBlocked) abrirFolha({ tipo: 'novo', inicial })
  }
  // Duplicar abre o formulário com o mesmo jogo uma semana depois: o dono
  // confere a data antes de publicar.
  const duplicar = (evento: AdminEvent) => {
    if (createBlocked) return
    const maisUmaSemana = (data: string | Date) =>
      toDatetimeLocal(new Date(new Date(data).getTime() + SEMANA_MS))
    abrirFolha({
      tipo: 'novo',
      inicial: {
        ...formDoEvento(evento),
        startsAt: maisUmaSemana(evento.startsAt),
        endsAt: evento.endsAt ? maisUmaSemana(evento.endsAt) : ''
      },
      times: evento.participants
    })
  }
  const pedirExclusao = (id: string) => {
    deleteMutation.reset()
    // Da folha (celular, semana), a confirmação fica sozinha: diálogo sobre
    // diálogo não volta bem ao foco.
    setFolha(null)
    setExcluindo(id)
    // As contagens do diálogo vêm da grade: pedido que chegou ou foi recusado
    // desde a carga entra agora.
    void invalidateMyEvents()
  }

  const amenities = bar?.amenities ?? []
  function formDoEvento(evento: AdminEvent): EventForm {
    return {
      sportId: evento.sportId,
      championship: evento.championship,
      startsAt: toDatetimeLocal(evento.startsAt),
      endsAt: evento.endsAt ? toDatetimeLocal(evento.endsAt) : '',
      participantIds: evento.participants?.map((item) => item.team.id) ?? [],
      participantFreeText: evento.participantFreeText ?? '',
      attendanceEnabled: evento.attendanceEnabled,
      ...resolveEventScreen(evento, amenities)
    }
  }
  const formVazio: EventForm = {
    sportId: '',
    championship: '',
    startsAt: '',
    endsAt: '',
    participantIds: [],
    participantFreeText: '',
    attendanceEnabled: true,
    ...resolveEventScreen({ onBigScreen: null, withSound: null }, amenities)
  }

  const now = Date.now()
  const textos = (evento: AdminEvent) => [
    gameTitle(evento),
    evento.championship,
    evento.sport?.name ?? ''
  ]
  // Grade que não carregou não tem "0 jogos": o traço fica no lugar (WEB-471).
  const quantos = (filtro: FiltroJogos) =>
    eventsState.status === 'ready'
      ? filtrarJogos(events, filtro, now).length
      : '—'
  const visiveis = events.filter((evento) => casaBusca(busca, textos(evento)))
  const naLista = filtrarJogos(visiveis, filtro, now)
  const abertoId =
    !larga || vista === 'semana' || filtro === 'passados'
      ? null
      : aberto === undefined
        ? limiteStarter
          ? null
          : (naLista[0]?.id ?? null)
        : aberto
  const eventoAberto = events.find((evento) => evento.id === abertoId)
  const eventoFolha =
    folha && folha.tipo !== 'novo'
      ? events.find((evento) => evento.id === folha.id)
      : undefined
  const eventoExcluindo = events.find((evento) => evento.id === excluindo)
  // O jogo que aparece no detalhe: o aberto na lista ou o da folha.
  const detalhe = folha?.tipo === 'jogo' ? eventoFolha : eventoAberto

  const breakdown = entitlements && entitlements.eventBreakdown !== 'none'
  const diaDetalhe = detalhe ? brasiliaDay(detalhe.startsAt) : ''
  const eventAnalytics = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: diaDetalhe,
      to: diaDetalhe
    }),
    enabled: !!detalhe && !!breakdown,
    meta: { errorToast: false }
  })
  const viramOJogo = !breakdown
    ? undefined
    : eventAnalytics.isSuccess
      ? (eventAnalytics.data.events.find((row) => row.eventId === detalhe?.id)
          ?.uniqueVisitors ?? 0)
      : null

  const apoio = (evento: AdminEvent) => {
    if (ehRascunho(evento)) return `${evento.championship} · rascunho`
    const partes = [evento.championship]
    const passado =
      getEventTemporalState(evento.startsAt, evento.endsAt, now) === 'past'
    const ratio = interestByEvent.get(evento.id)
    if (showsGoing && going.isSuccess && !passado && evento.attendanceEnabled) {
      const pessoas = goingById.get(evento.id)?.people.length ?? 0
      partes.push(
        pessoas
          ? `${countLabel(pessoas, 'vai', 'vão')} assistir`
          : 'ninguém marcou ainda'
      )
    } else if (ratio !== undefined) {
      partes.push(
        `Interesse: ${ratio.toLocaleString('pt-BR')}x a média deste bar`
      )
    }
    return partes.join(' · ')
  }

  const abrirJogo = (id: string) => {
    if (larga && vista === 'lista') setAberto(id)
    else abrirFolha({ tipo: 'jogo', id })
  }

  const detalheProps = (evento: AdminEvent) => ({
    evento,
    barId: bar?.id ?? '',
    oferta: bar?.houseOffer ?? null,
    // Lista desligada no jogo (WEB-437): como o bar que não vê quem vai.
    quemVai:
      showsGoing && evento.attendanceEnabled
        ? (goingById.get(evento.id) ?? null)
        : undefined,
    viramOJogo,
    onEditar: () => abrirFolha({ tipo: 'editar', id: evento.id }),
    onDuplicar: () => duplicar(evento),
    duplicarBloqueado: blockReason,
    onExcluir: () => pedirExclusao(evento.id),
    onPublicar: () => publicar(evento.id),
    fasePublicar:
      publishMutation.variables?.eventId === evento.id
        ? actionPhase([publishMutation])
        : 'idle'
  })

  const planLine =
    policyState.status === 'ready'
      ? getPlanLine(policyState.policy, !!lapsedPlan)
      : null

  const tituloFolha =
    folha?.tipo === 'novo'
      ? 'Novo jogo'
      : folha?.tipo === 'editar'
        ? 'Editar jogo'
        : eventoFolha
          ? gameTitle(eventoFolha)
          : 'Jogo'

  return (
    <>
      <CabecalhoPagina
        titulo="Jogos"
        acoes={
          <>
            <Campo
              aria-label="Buscar jogo ou time"
              placeholder="Buscar jogo ou time"
              type="text"
              inputMode="search"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              altura={42}
              className="w-60 max-w-full"
              inicio={
                <Icone
                  nome="search"
                  tamanho={18}
                  acento="var(--painel-muted)"
                  className="painel-muted"
                />
              }
            />
            <Botao
              icone="spark"
              disabled
              title="Em breve"
              className="jogos-importar"
            >
              Importar da rodada <EmBreve />
            </Botao>
            {travadoPeloPlano ? (
              <Botao
                icone="lock"
                disabled
                title={blockReason ?? undefined}
                className="jogos-novo-travado"
              >
                Novo jogo
              </Botao>
            ) : (
              <Botao
                variante="acid"
                icone="plus"
                onClick={() => novoJogo()}
                disabled={createBlocked}
                title={blockReason ?? undefined}
              >
                Novo jogo
              </Botao>
            )}
          </>
        }
      />

      <AvisoDoPainel tela="jogos" />

      {blockReason && !travadoPeloPlano ? (
        <p
          className="jogos-bloqueio ml-auto"
          role={
            policyState.status === 'error' || sportsErrorVisible
              ? 'alert'
              : undefined
          }
        >
          {blockReason}{' '}
          {policyState.status === 'error' && policyState.retryable ? (
            <button type="button" onClick={policyState.retry}>
              Tentar novamente
            </button>
          ) : null}
          {sportsErrorVisible && isRetryableError(sportsError) ? (
            <button type="button" onClick={() => void refetchSports()}>
              Tentar novamente
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="jogos-barra">
        <fieldset className="painel-seg">
          <legend className="sr-only">Quais jogos</legend>
          <Chip
            check={false}
            ativo={filtro === 'proximos'}
            onClick={() => {
              setFiltro('proximos')
              setAberto(undefined)
            }}
          >
            Próximos · {quantos('proximos')}
          </Chip>
          <Chip
            check={false}
            ativo={filtro === 'rascunhos'}
            onClick={() => {
              setFiltro('rascunhos')
              setVista('lista')
              setAberto(undefined)
            }}
          >
            Rascunhos · {quantos('rascunhos')}
          </Chip>
          <Chip
            check={false}
            ativo={filtro === 'passados'}
            onClick={() => {
              setFiltro('passados')
              setVista('lista')
              setAberto(undefined)
            }}
          >
            Passados · {quantos('passados')}
          </Chip>
        </fieldset>
        {filtro === 'passados' ? (
          <div className="passados-periodo">
            Mesmo período do Desempenho
            {entitlements ? (
              <Seg
                rotulo="Período"
                valor={periodo.preset}
                onChange={(preset) => {
                  if (preset !== 'custom') {
                    escolherPeriodo({
                      preset,
                      range: getAnalyticsRange(
                        preset,
                        new Date(),
                        bar ? new Date(bar.createdAt) : undefined
                      )
                    })
                  }
                }}
                itens={getAvailableAnalyticsPeriods(
                  entitlements.maxDaysRetention
                ).map((op) => ({ valor: op.id, rotulo: op.label }))}
              />
            ) : null}
          </div>
        ) : (
          <div className="jogos-barra-dir">
            {vista === 'semana' ? (
              <div className="jogos-semana-nav">
                <BotaoIcone
                  icone="back"
                  rotulo="Semana anterior"
                  quadrado
                  tamanho={34}
                  onClick={() => setSemana((s) => somarDias(s, -7))}
                />
                <span aria-live="polite">{rotuloSemana(semana)}</span>
                <BotaoIcone
                  icone="right"
                  rotulo="Próxima semana"
                  quadrado
                  tamanho={34}
                  onClick={() => setSemana((s) => somarDias(s, 7))}
                />
              </div>
            ) : null}
            {planLine ? <span className="jogos-plano">{planLine}</span> : null}
            <Seg
              rotulo="Ver como"
              valor={vista}
              onChange={(v) => {
                setVista(v)
                if (v === 'semana') setFiltro('proximos')
              }}
              itens={[
                { valor: 'lista', rotulo: 'Lista' },
                { valor: 'semana', rotulo: 'Semana' }
              ]}
            />
          </div>
        )}
      </div>

      {/* Nos passados, e no limite do plano, não há o que adicionar (1ab). */}
      {filtro === 'passados' || travadoPeloPlano ? null : (
        <section className="jogos-sug" aria-label="Sugestões da rodada">
          <div className="jogos-sug-texto">
            <span>
              <Icone nome="spark" tamanho={20} acento="var(--painel-acid)" />
              Sugestões da rodada <EmBreve />
            </span>
            <span>
              Jogos que os torcedores perto do bar seguem e não estão na grade.
            </span>
          </div>
          <Botao variante="acid" icone="plus" disabled title="Em breve">
            Adicionar como rascunho
          </Botao>
        </section>
      )}

      {eventsState.status === 'loading' ? (
        <div role="status" aria-busy="true" className="jogos-lista">
          <span className="sr-only">Carregando sua grade…</span>
          {[1, 2, 3].map((item) => (
            <Skeleton
              key={item}
              className="h-[74px] w-full rounded-[7px] bg-[var(--painel-sub)]"
            />
          ))}
        </div>
      ) : eventsState.status === 'error' ? (
        <Card role="alert">
          <p className="m-0 text-sm">Não foi possível carregar a grade.</p>
          {eventsState.retryable ? (
            <Botao className="mt-3" onClick={eventsState.retry}>
              Tentar novamente
            </Botao>
          ) : null}
        </Card>
      ) : events.length === 0 ? (
        <Card className="jogos-vazio">
          <Icone nome="cal" tamanho={32} />
          <h2
            className="painel-disp"
            style={{ ['--painel-disp-size' as string]: '28px' }}
          >
            Nenhum jogo cadastrado
          </h2>
          <p>
            {createBlocked
              ? 'Assim que a criação for liberada, os jogos cadastrados aqui aparecem nas buscas dos torcedores.'
              : 'Adicione jogos para começar a aparecer nas buscas dos torcedores.'}
          </p>
          <Botao
            variante="acid"
            icone="plus"
            onClick={() => novoJogo()}
            disabled={createBlocked}
          >
            Adicionar primeiro jogo
          </Botao>
        </Card>
      ) : filtro === 'passados' ? (
        <ComoCadaJogoFoi
          range={periodo.range}
          encerrados={
            new Set(filtrarJogos(events, 'passados', now).map((j) => j.id))
          }
        />
      ) : vista === 'semana' ? (
        <SemanaJogos
          dias={montarSemana(semana, visiveis, now)}
          editando={
            folha && folha.tipo !== 'jogo' && previa
              ? {
                  ...previa,
                  id: folha.tipo === 'editar' ? folha.id : undefined
                }
              : null
          }
          onAbrir={abrirJogo}
          onAdicionar={
            createBlocked
              ? undefined
              : (dia) => novoJogo({ startsAt: `${dia}T` })
          }
        />
      ) : (
        <div
          className="jogos-grade"
          data-aberto={eventoAberto || limiteStarter ? true : undefined}
          data-plano={!eventoAberto && limiteStarter ? true : undefined}
        >
          <div className="jogos-lista">
            {interest?.status === 'gathering' ? (
              <p className="jogos-dica">
                Estamos reunindo dados sobre o interesse no seu bar. O sinal
                aparece depois dos primeiros jogos.
              </p>
            ) : null}
            {naLista.length ? (
              <ListaJogos
                eventos={visiveis}
                filtro={filtro}
                aberto={abertoId}
                apoio={apoio}
                onAbrir={abrirJogo}
                onPublicar={publicar}
                publicando={publicando}
              />
            ) : (
              <p className="jogos-dica">
                {busca.trim()
                  ? `Nada com “${busca.trim()}”.`
                  : filtro === 'rascunhos'
                    ? 'Nenhum rascunho.'
                    : 'Nenhum jogo daqui para frente.'}
              </p>
            )}
          </div>
          {eventoAberto ? (
            <JogoAberto
              {...detalheProps(eventoAberto)}
              onFechar={() => setAberto(null)}
            />
          ) : limiteStarter ? (
            <div className="jogos-plano-col">
              <CardDoPlano />
              <NoPro />
            </div>
          ) : null}
        </div>
      )}

      <Dialog
        open={!!folha && (folha.tipo === 'novo' || !!eventoFolha)}
        onOpenChange={(open) => {
          if (!open) setFolha(null)
        }}
      >
        <DialogContent className="jogos-folha">
          <div className="jogos-folha-cab">
            <DialogTitle
              className={folha?.tipo === 'jogo' ? 'sr-only' : 'painel-disp'}
              style={{ ['--painel-disp-size' as string]: '34px' }}
            >
              {tituloFolha}
            </DialogTitle>
            <BotaoIcone
              icone="x"
              rotulo="Fechar"
              className="ml-auto"
              onClick={() => setFolha(null)}
            />
          </div>
          {folha?.tipo === 'jogo' && eventoFolha ? (
            <div className="jogos-folha-corpo">
              <JogoAberto
                {...detalheProps(eventoFolha)}
                onFechar={() => setFolha(null)}
                semMoldura
              />
            </div>
          ) : folha ? (
            <EventFormComponent
              key={JSON.stringify(folha)}
              editing={folha.tipo === 'editar'}
              draft={!!eventoFolha && ehRascunho(eventoFolha)}
              onPrevia={setPrevia}
              initial={
                folha.tipo === 'editar' && eventoFolha
                  ? formDoEvento(eventoFolha)
                  : {
                      ...formVazio,
                      ...(folha.tipo === 'novo' ? folha.inicial : {})
                    }
              }
              initialParticipants={(folha.tipo === 'editar'
                ? eventoFolha?.participants
                : folha.tipo === 'novo'
                  ? folha.times
                  : undefined
              )?.map((item) => item.team)}
              sports={sports}
              loadingSports={loadingSports}
              onSave={handleSave}
              isSaving={createMutation.isPending || updateMutation.isPending}
              barName={bar?.name}
              houseOffer={bar?.houseOffer ?? null}
              showsGoing={showsGoing}
              goingCount={
                eventoFolha
                  ? (goingById.get(eventoFolha.id)?.people.length ?? 0)
                  : 0
              }
              error={
                createMutation.error
                  ? getUserFacingMessage(
                      createMutation.error,
                      'Não foi possível criar o jogo. Verifique os dados e tente novamente.'
                    )
                  : updateMutation.error
                    ? getUserFacingMessage(
                        updateMutation.error,
                        'Não foi possível atualizar o jogo. Verifique os dados e tente novamente.'
                      )
                    : undefined
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {eventoExcluindo ? (
        <EventDeleteDialog
          event={eventoExcluindo}
          isDeleting={deleteMutation.isPending}
          error={
            deleteMutation.error
              ? getDeleteErrorMessage(deleteMutation.error)
              : undefined
          }
          onConfirm={() =>
            deleteMutation.mutate({ eventId: eventoExcluindo.id })
          }
          onCancel={() => setExcluindo(null)}
        />
      ) : null}
    </>
  )
}
