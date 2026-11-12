import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { Check, Sparkle } from '@/components/landing/v3/icons'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { brasiliaDay, brasiliaTime, shiftDay } from './noite'
import type { SugestaoDeJogo } from './sugestoes-de-jogo'

/*
 * Jogos da semana pra você (WEB-433; canvas "Jogos da semana pra você",
 * pranchas WJ, WH, WP e C-estados): o jogo que mais combina com o bar no
 * card Placar escuro, com os torcedores dos dois times na cidade, os bares
 * do bairro que já passam e onde passa; os outros da semana em linhas. Um
 * toque publica com o telão e o som do bar (o servidor herda, WEB-399).
 *
 * Só aparece com o catálogo (`featured` numa sugestão): sem a rotina dos
 * jogos da semana, quem chama mostra a lista de sempre (`SugestoesDeJogo`).
 * O jogo publicado sai da lista do servidor; aqui ele fica, no estado "No
 * ar" (card) ou "Na grade" (linha), até a tela fechar.
 */

export type SemanaVariant = 'jogos' | 'hoje' | 'primeiro'

type Bar = { name: string; city: string; neighborhood: string }
type Publicado = { sugestao: SugestaoDeJogo; eventId: string }

/**
 * O máximo do servidor (`GAME_SUGGESTION_MAX`; o módulo dele puxa o banco e
 * não entra no navegador). A lista antiga lê a mesma chave: uma ida só.
 */
const SUGESTOES = 10

export function useSugestoesDaSemana(enabled = true) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.pub.gameSuggestions.queryOptions({ limit: SUGESTOES }),
    enabled,
    meta: { errorToast: false }
  })
}

export const temCatalogo = (lista: readonly SugestaoDeJogo[] | undefined) =>
  Boolean(lista?.some((s) => s.featured))

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
]
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function partes(day: string) {
  const d = new Date(`${day}T12:00:00.000Z`)
  return {
    dia: d.getUTCDate(),
    mes: MESES[d.getUTCMonth()] ?? '',
    semana: DIAS[d.getUTCDay()] ?? ''
  }
}

/** "sáb 14 · 18:00" (ou "sáb 14 nov · 18:00" com o mês). */
export function quandoCurto(startsAt: string, mes = false): string {
  const p = partes(brasiliaDay(startsAt))
  return `${p.semana} ${p.dia}${mes ? ` ${p.mes}` : ''} · ${brasiliaTime(startsAt)}`
}

/** "Amanhã", "Hoje" ou "Sex 13", para a caixa da linha. */
function diaDaLinha(startsAt: string, now = Date.now()): string {
  const day = brasiliaDay(startsAt)
  const today = brasiliaDay(now)
  if (day === today) return 'Hoje'
  if (day === shiftDay(today, 1)) return 'Amanhã'
  const p = partes(day)
  return `${p.semana.charAt(0).toUpperCase()}${p.semana.slice(1)} ${p.dia}`
}

/** "9 a 15 nov": hoje e os seis dias seguintes, a janela do catálogo. */
export function janelaDaSemana(now = Date.now()): string {
  const first = partes(brasiliaDay(now))
  const last = partes(shiftDay(brasiliaDay(now), 6))
  return first.mes === last.mes
    ? `${first.dia} a ${last.dia} ${last.mes}`
    : `${first.dia} ${first.mes} a ${last.dia} ${last.mes}`
}

const numero = (n: number) => n.toLocaleString('pt-BR')

/** "Palmeiras × São Paulo" com o × em acid. */
function Confronto({ title }: { title: string }) {
  const lados = title.split(' × ')
  if (lados.length !== 2) return <>{title}</>
  return (
    <>
      {lados[0]} <span className="sem-x">×</span> {lados[1]}
    </>
  )
}

/** Onde passa, para a linha: "Premiere", "ESPN · Disney+" ou nada. */
function canais(s: SugestaoDeJogo): string | null {
  if (!s.channels?.length) return null
  return s.channels.slice(0, 2).join(' · ')
}

/** "1.240 torcedores na cidade · 0 no bairro · Premiere". */
function LinhaMeta({ s }: { s: SugestaoDeJogo }) {
  if (!s.catalogId) return <>{s.championship} · bares perto já marcaram</>
  return (
    <>
      {s.fansInCity != null ? (
        <>
          <b>{numero(s.fansInCity)}</b> torcedores na cidade ·{' '}
        </>
      ) : null}
      <b>{numero(s.barsInNeighborhood ?? 0)}</b> no bairro ·{' '}
      {canais(s) ?? 'canal a confirmar'}
    </>
  )
}

export function AtribuicaoFootballData() {
  return (
    <p className="sem-attr">
      Dados de jogos:{' '}
      <a
        href="https://www.football-data.org"
        target="_blank"
        rel="noreferrer noopener"
      >
        football-data.org
      </a>
    </p>
  )
}

function Placar({
  s,
  variant,
  bar,
  publicado,
  busy,
  onPublicar,
  onDispensar,
  onEditar,
  onDesfazer,
  desfazendo
}: {
  s: SugestaoDeJogo
  variant: SemanaVariant
  bar: Bar
  publicado: boolean
  busy: boolean
  onPublicar: () => void
  onDispensar?: () => void
  onEditar?: () => void
  onDesfazer?: () => void
  desfazendo: boolean
}) {
  const kicker =
    variant === 'primeiro'
      ? quandoCurto(s.startsAt, true)
      : `O jogo da semana${variant === 'jogos' ? ` pro ${bar.name}` : ''} · ${quandoCurto(s.startsAt)}`
  const bares = s.barsInNeighborhood ?? 0
  const seuTime =
    s.houseTeam || s.classic ? (
      <span className="sem-tags">
        {s.houseTeam ? <span className="sem-tag is-team">Seu time</span> : null}
        {s.classic ? (
          <span className="sem-tag is-classic">Clássico</span>
        ) : null}
      </span>
    ) : null

  if (publicado) {
    return (
      <article className="sem-card is-on" aria-live="polite">
        <div className="sem-top">
          <span className="sem-k sem-acid">
            {quandoCurto(s.startsAt, true)}
          </span>
          <span className="sem-tag is-on">
            <Check size={12} />
            No ar
          </span>
        </div>
        <h3 className="sem-disp">
          <Confronto title={s.title} />
        </h3>
        <p className="sem-why">
          Já aparece para quem procura esse jogo perto do {bar.name}, com telão
          e som.{' '}
          {bares === 0 ? (
            <b>Primeiro bar {deBairro(bar.neighborhood)} com ele.</b>
          ) : null}
        </p>
        <div className="sem-acts is-start">
          {onEditar ? (
            <button
              type="button"
              className="sem-pill is-line"
              onClick={onEditar}
            >
              Editar o jogo
            </button>
          ) : null}
          {onDesfazer ? (
            <button
              type="button"
              className="sem-txt"
              disabled={desfazendo}
              aria-busy={desfazendo}
              onClick={onDesfazer}
            >
              {desfazendo ? 'Desfazendo…' : 'Desfazer'}
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  const celulas = (
    <div className="sem-cells">
      <div className="sem-cell">
        <span className="sem-n sem-acid">
          {s.fansInCity != null ? numero(s.fansInCity) : '—'}
        </span>
        <span className="sem-k">
          {variant === 'hoje'
            ? 'torcedores dos dois times na cidade'
            : `torcedores dos dois times usam a Onside em ${bar.city}`}
        </span>
      </div>
      <div className="sem-cell">
        <span className="sem-n">{numero(bares)}</span>
        <span className="sem-k">
          {bares === 1 ? 'bar' : 'bares'} {deBairro(bar.neighborhood)}{' '}
          {bares === 1 ? 'passa' : 'passam'}
        </span>
      </div>
      {s.channels?.length ? (
        <div className="sem-cell">
          <span className="sem-n is-tv">{s.channels[0]}</span>
          <span className="sem-k">
            {s.channelConfirmed === false
              ? 'onde costuma passar'
              : 'onde passa'}
          </span>
        </div>
      ) : (
        <div className="sem-cell is-tbc">
          <span className="sem-n is-tv">A confirmar</span>
          <span className="sem-k">a TV define até quinta</span>
        </div>
      )}
    </div>
  )
  const publicar = (
    <button
      type="button"
      className="sem-pill is-acid"
      disabled={busy}
      aria-busy={busy}
      onClick={onPublicar}
    >
      {busy ? (
        <Loader size={18} className="animate-spin" aria-hidden="true" />
      ) : null}
      {busy
        ? 'Publicando…'
        : variant === 'primeiro'
          ? 'Publicar este'
          : 'Publicar com telão e som'}
    </button>
  )
  const dispensar = onDispensar ? (
    <button
      type="button"
      className="sem-txt"
      disabled={busy}
      onClick={onDispensar}
    >
      Não passo esse
    </button>
  ) : null

  if (variant === 'hoje') {
    return (
      <article className="sem-card is-wide">
        <div className="sem-col">
          <div className="sem-top">
            <span className="sem-k sem-acid">{kicker}</span>
            {seuTime}
          </div>
          <div>
            <span className="sem-k">{s.championship}</span>
            <h3 className="sem-disp">
              <Confronto title={s.title} />
            </h3>
          </div>
          {s.reason ? <p className="sem-why is-end">{s.reason}.</p> : null}
        </div>
        <div className="sem-col">
          {celulas}
          <div className="sem-acts">
            {dispensar}
            {publicar}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="sem-card">
      <div className="sem-top">
        <span className="sem-k sem-acid">{kicker}</span>
        {seuTime}
      </div>
      <div>
        <span className="sem-k">{s.championship}</span>
        <h3 className="sem-disp">
          <Confronto title={s.title} />
        </h3>
      </div>
      {celulas}
      <div className="sem-acts">
        {s.reason ? <p className="sem-why">{s.reason}.</p> : <span />}
        {dispensar}
        {publicar}
      </div>
    </article>
  )
}

/** "da Consolação", "do Centro": sem saber o gênero, "do bairro" seria pior. */
function deBairro(neighborhood: string) {
  return neighborhood ? `de ${neighborhood}` : 'do bairro'
}

function Linhas({
  itens,
  publicados,
  criando,
  onPublicar
}: {
  itens: SugestaoDeJogo[]
  publicados: Publicado[]
  criando: string | null
  onPublicar: (s: SugestaoDeJogo) => void
}) {
  return (
    <ul className="sem-rows">
      {itens.map((s) => (
        <li key={s.key} className="sem-row">
          <span className="sem-when">
            <span className="sem-k">{diaDaLinha(s.startsAt)}</span>
            <b>{brasiliaTime(s.startsAt)}</b>
          </span>
          <span className="sem-row-m">
            <b>{s.title}</b>
            <span>
              <LinhaMeta s={s} />
            </span>
          </span>
          <button
            type="button"
            className="sem-pill is-ink is-sm"
            disabled={criando !== null}
            aria-busy={criando === s.key}
            aria-label={`Publicar ${s.title}`}
            onClick={() => onPublicar(s)}
          >
            {criando === s.key ? (
              <Loader size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            Publicar
          </button>
        </li>
      ))}
      {publicados.map(({ sugestao: s }) => (
        <li key={s.key} className="sem-row">
          <span className="sem-when">
            <span className="sem-k">{diaDaLinha(s.startsAt)}</span>
            <b>{brasiliaTime(s.startsAt)}</b>
          </span>
          <span className="sem-row-m">
            <b>{s.title}</b>
            <span>No ar · já aparece para quem procura esse jogo</span>
          </span>
          <span className="sem-tag is-grid">Na grade</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A seção inteira. Sem catálogo devolve `fallback` (a lista de sempre), e
 * sem poder criar jogo (`disabled`, limite do Starter), nada.
 */
export function SemanaPraVoce({
  variant,
  bar,
  disabled,
  fallback = null,
  onCreated,
  onEditar,
  limitNote,
  foco
}: {
  variant: SemanaVariant
  bar: Bar
  disabled?: boolean
  fallback?: ReactNode
  onCreated?: (s: SugestaoDeJogo, eventId: string) => void
  /** "Editar o jogo" do card publicado; sem ele, o botão não aparece. */
  onEditar?: (eventId: string) => void
  /** O texto sob a lista (Jogos: o limite do Starter). */
  limitNote?: string
  /** Id do catálogo que vai ao card no lugar do destaque (`?publicar=`). */
  foco?: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const sugestoes = useSugestoesDaSemana(!disabled)
  const [criando, setCriando] = useState<string | null>(null)
  const [publicados, setPublicados] = useState<Publicado[]>([])
  const [destaque, setDestaque] = useState<Publicado | null>(null)
  const [todos, setTodos] = useState(false)
  const create = useMutation(
    trpc.pub.createEvent.mutationOptions({ meta: { errorToast: false } })
  )
  const dismiss = useMutation(
    trpc.pub.dismissGameSuggestion.mutationOptions({
      meta: { errorToast: false }
    })
  )
  const del = useMutation(
    trpc.pub.deleteEvent.mutationOptions({ meta: { errorToast: false } })
  )

  const lista = sugestoes.data ?? []
  // O link do e-mail (`?publicar=`): a tela abre no card, com o jogo nele.
  const secao = useRef<HTMLElement>(null)
  const achou = Boolean(foco && lista.some((s) => s.catalogId === foco))
  useEffect(() => {
    if (achou) secao.current?.scrollIntoView({ block: 'center' })
  }, [achou])
  if (disabled) return null
  if (!temCatalogo(lista) && !destaque)
    return sugestoes.isPending ? null : fallback

  const refresh = () =>
    Promise.all(
      [
        trpc.pub.getMyEvents.queryKey(),
        trpc.pub.getMyEventCreationPolicy.queryKey(),
        trpc.pub.gameSuggestions.queryKey(),
        trpc.pub.getMyEventNumbers.queryKey(),
        trpc.pub.getMe.queryKey()
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    )

  const card =
    destaque?.sugestao ??
    (foco ? lista.find((s) => s.catalogId === foco) : undefined) ??
    lista.find((s) => s.featured) ??
    lista[0]
  const resto = lista.filter(
    (s) =>
      s.key !== card?.key && !publicados.some((p) => p.sugestao.key === s.key)
  )
  const linhas = variant === 'jogos' && !todos ? resto.slice(0, 3) : resto
  const total = lista.length + publicados.length + (destaque ? 1 : 0)

  const publicar = async (s: SugestaoDeJogo, noCard: boolean) => {
    setCriando(s.key)
    try {
      const { eventId } = await create.mutateAsync({
        sportId: s.sportId,
        championship: s.championship,
        startsAt: s.startsAt,
        ...(s.participantIds.length
          ? { participantIds: s.participantIds }
          : {}),
        ...(s.participantFreeText
          ? { participantFreeText: s.participantFreeText }
          : {})
      })
      if (noCard && variant !== 'primeiro')
        setDestaque({ sugestao: s, eventId })
      else if (variant !== 'primeiro')
        setPublicados((prev) => [...prev, { sugestao: s, eventId }])
      await refresh()
      if (!noCard || variant === 'primeiro')
        toast.success(
          `${s.title} publicado. Já aparece para quem procura esse jogo perto do bar.`
        )
      onCreated?.(s, eventId)
    } catch (error) {
      toast.error(
        getUserFacingMessage(
          error,
          'Não deu para publicar este jogo agora. Tente de novo.'
        )
      )
    } finally {
      setCriando(null)
    }
  }

  const dispensar = async (s: SugestaoDeJogo) => {
    if (!s.catalogId) return
    try {
      await dismiss.mutateAsync({ catalogId: s.catalogId })
      await queryClient.invalidateQueries({
        queryKey: trpc.pub.gameSuggestions.queryKey()
      })
      toast.success(`${s.title} saiu da sua lista.`)
    } catch (error) {
      toast.error(
        getUserFacingMessage(
          error,
          'Não deu para tirar este jogo. Tente de novo.'
        )
      )
    }
  }

  const desfazer = async () => {
    if (!destaque) return
    try {
      await del.mutateAsync({ eventId: destaque.eventId })
      setDestaque(null)
      await refresh()
    } catch (error) {
      toast.error(
        getUserFacingMessage(error, 'Não deu para desfazer. Tente de novo.')
      )
    }
  }

  const placar = card ? (
    <Placar
      s={card}
      variant={variant}
      bar={bar}
      publicado={destaque !== null}
      busy={criando === card.key}
      onPublicar={() => void publicar(card, true)}
      onDispensar={
        variant !== 'primeiro' && card.catalogId
          ? () => void dispensar(card)
          : undefined
      }
      onEditar={
        destaque && onEditar ? () => onEditar(destaque.eventId) : undefined
      }
      onDesfazer={() => void desfazer()}
      desfazendo={del.isPending}
    />
  ) : null

  if (variant === 'hoje') {
    return (
      <section className="sem" aria-labelledby="sem-t">
        <div className="sem-head">
          <Sparkle size={20} />
          <h2 id="sem-t">Esta semana pra você</h2>
          <span className="sem-mono">
            {janelaDaSemana()} · {total} {total === 1 ? 'jogo' : 'jogos'}
          </span>
          <Link to="/admin/jogos" className="sem-more">
            Ver os {total} em Jogos ›
          </Link>
        </div>
        {placar}
        <AtribuicaoFootballData />
      </section>
    )
  }

  if (variant === 'primeiro') {
    return (
      <section className="sem" aria-label="Jogos desta semana pra você">
        <span className="sem-lab">O mais indicado pro seu primeiro jogo</span>
        {placar}
        {resto.length ? (
          <>
            <span className="sem-lab">Outros desta semana</span>
            <div className="sem-list">
              <Linhas
                itens={resto.slice(0, 3)}
                publicados={[]}
                criando={criando}
                onPublicar={(s) => void publicar(s, false)}
              />
            </div>
          </>
        ) : null}
        <p className="sem-monday">
          <Sparkle size={16} />
          <span>
            <b>Toda segunda, uma lista nova</b>, em Hoje e em Jogos.
          </span>
        </p>
        <AtribuicaoFootballData />
      </section>
    )
  }

  return (
    <section
      ref={secao}
      className="sem"
      aria-labelledby="sem-t"
      data-passeio="jogos-sugestoes"
    >
      <div className="sem-head">
        <Sparkle size={20} />
        <h2 id="sem-t">Jogos desta semana pra você</h2>
        <span className="sem-mono">{janelaDaSemana()}</span>
      </div>
      {placar}
      {linhas.length || publicados.length ? (
        <div className="sem-list">
          <Linhas
            itens={linhas}
            publicados={publicados}
            criando={criando}
            onPublicar={(s) => void publicar(s, false)}
          />
          <div className="sem-foot">
            <span>
              {limitNote ??
                'Um toque publica, com o telão e o som do bar. Dá para editar depois.'}
            </span>
            {!todos && resto.length > linhas.length ? (
              <button
                type="button"
                className="sem-more"
                onClick={() => setTodos(true)}
              >
                Ver os {total} ›
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <AtribuicaoFootballData />
    </section>
  )
}
