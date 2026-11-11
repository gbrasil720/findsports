import {
  PLAN_NAMES,
  STARTER_EVENT_LIMIT
} from '@findsports_oficial/api/lib/plan-limits'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { toast } from 'sonner'
import type { AdminEvent } from '@/components/admin/admin-model'
import {
  useMyBar,
  useMyEvents,
  useMySubscription
} from '@/components/admin/admin-queries'
import { Add, Check, Qr, Share, Sparkle } from '@/components/landing/v3/icons'
import {
  mensagemDoJogo,
  useLinkDoBar
} from '@/components/onboarding/torcedor-ve'
import { useSession } from '@/hooks/use-session'
import { PUB_LIVE_PATH } from '@/utils/auth-guards'
import { useTRPC } from '@/utils/trpc'
import { brasiliaTime, eventTitle } from './noite'
import { usePainel } from './painel-shell'
import {
  type PassoDoPasseio,
  type PassosLocais,
  usePassosLocais
} from './primeiros-passos-local'
import { diaDaSugestao } from './sugestoes-de-jogo'

/*
 * Bar novo no painel (WEB-501; protótipo `GUIDE`, `TS`, `tour*`): o card
 * "Primeiros passos" em Hoje e o passeio pelas telas de verdade, com o
 * destaque no que importa em cada uma e os dados do bar. Só para o bar que
 * veio do cadastro novo (`bar.routine`): o bar de antes não vê nada sozinho.
 *
 * Os itens marcam pelo dado real quando ele existe (jogos, capa, horário,
 * plano) e, o resto (passeio, link, código de exemplo), por conta no
 * navegador (`primeiros-passos-local.ts`). Nenhum passo do passeio avança
 * sozinho: só por "Próximo" (ou "Agora não"); a ação do passo muda o texto
 * e o botão, e quem segue é o dono. Esc e "Pular o passeio" pausam; o card
 * continua de onde parou.
 */

/* ─── Os itens do card ─── */

export type ItemDoGuia =
  | 'jogo'
  | 'plano'
  | 'passeio'
  | 'semana'
  | 'foto'
  | 'codigo'
  | 'link'

type Fatos = {
  publicados: number
  planoEscolhido: boolean
  capa: boolean
  horario: boolean
  elite: boolean
}

/** O que está feito, item a item, e a ordem do card (o código só no Elite). */
export function itensDoGuia(
  fatos: Fatos,
  locais: PassosLocais
): { id: ItemDoGuia; feito: boolean }[] {
  const itens: { id: ItemDoGuia; feito: boolean }[] = [
    { id: 'jogo', feito: fatos.publicados > 0 },
    { id: 'plano', feito: fatos.planoEscolhido },
    { id: 'passeio', feito: locais.passeio === true },
    { id: 'semana', feito: fatos.publicados > 1 },
    { id: 'foto', feito: fatos.capa && fatos.horario }
  ]
  if (fatos.elite) itens.push({ id: 'codigo', feito: locais.codigo === true })
  itens.push({ id: 'link', feito: locais.link === true })
  return itens
}

/**
 * As telas do passeio pelo plano: Starter e Pro 5, Elite 6 (Quem vai, com o
 * código de exemplo). O que já está feito sai, menos Hoje, Desempenho e o fim.
 */
export function passosDoPasseio(
  itens: { id: ItemDoGuia; feito: boolean }[],
  elite: boolean
): PassoDoPasseio[] {
  const feito = (id: ItemDoGuia) => itens.some((i) => i.id === id && i.feito)
  const passos: PassoDoPasseio[] = ['hoje']
  if (!feito('semana')) passos.push('jogos')
  if (!feito('foto')) passos.push('espaco')
  if (elite && !feito('codigo')) passos.push('codigo')
  passos.push('desempenho', 'fim')
  return passos
}

/** O próximo jogo publicado do bar, senão o último. */
function jogoDoBar(events: AdminEvent[] | undefined, now = Date.now()) {
  const publicados = (events ?? [])
    .filter((e) => e.publishedAt !== null)
    .sort(
      (a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt))
    )
  return (
    publicados.find((e) => Date.parse(String(e.startsAt)) > now) ??
    publicados.at(-1)
  )
}

function andList(itens: string[]) {
  return itens.length > 1
    ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`
    : (itens[0] ?? '')
}

const fimDoTeste = (end: string | Date | null | undefined) =>
  end
    ? new Date(end).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long'
      })
    : null

/** Tudo o que o card e o passeio leem, das mesmas consultas do painel. */
function useGuia() {
  const trpc = useTRPC()
  const session = useSession()
  const { elite } = usePainel()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const { data: subscription } = useMySubscription()
  const novo = Boolean(bar?.routine)
  const photos = useQuery({
    ...trpc.pub.photos.queryOptions(),
    enabled: novo,
    meta: { errorToast: false }
  })
  const [locais, marcar] = usePassosLocais(session?.user.id)
  const publicados = (events.data ?? []).filter((e) => e.publishedAt !== null)
  const fatos: Fatos = {
    publicados: publicados.length,
    planoEscolhido: bar?.trialPlanChosenAt != null,
    capa:
      Boolean(bar?.photoUrl) ||
      (photos.data ?? []).some(
        (p) => p.coverRequested && p.status !== 'rejected'
      ),
    horario: (bar?.openingHours ?? []).some(Boolean),
    elite
  }
  const itens = itensDoGuia(fatos, locais)
  return {
    bar,
    pronto: Boolean(bar) && events.isSuccess && subscription !== undefined,
    novo,
    elite,
    subscription,
    jogo: jogoDoBar(events.data),
    publicados: publicados.length,
    fatos,
    itens,
    locais,
    marcar
  }
}

/* ─── O passeio ─── */

type PasseioState = {
  ativo: PassoDoPasseio | null
  comecar: (continuar?: boolean) => void
}

const PasseioContext = createContext<PasseioState>({
  ativo: null,
  comecar: () => undefined
})

export const usePasseio = () => useContext(PasseioContext)

const ROTA: Record<PassoDoPasseio, string> = {
  hoje: '/admin',
  jogos: '/admin/jogos',
  espaco: '/admin/meu-espaco',
  codigo: '/admin/quem-vai',
  desempenho: '/admin/desempenho',
  fim: '/admin'
}

type Dica = {
  alvo: string[]
  titulo: string
  texto: ReactNode
  selo?: string
  dica?: string
  proximo?: string
}

function dicaDo(
  passo: PassoDoPasseio,
  inicio: number,
  g: ReturnType<typeof useGuia>
): Dica {
  const { bar, jogo } = g
  const plano = g.subscription?.plan ?? 'starter'
  const fim = fimDoTeste(g.subscription?.currentPeriodEnd)
  const nome = bar?.name ?? 'seu bar'
  const titulo = jogo ? eventTitle(jogo) : null
  const quando = jogo
    ? `${diaDaSugestao(String(jogo.startsAt))} às ${brasiliaTime(jogo.startsAt)}`
    : ''
  const nm = titulo ? <b>{titulo}</b> : null
  const dia = jogo ? diaDaSugestao(String(jogo.startsAt)) : null

  if (passo === 'hoje') {
    return {
      alvo: ['[data-passeio="hoje"]'],
      titulo: jogo ? 'Seu jogo já está no ar' : 'O jogo da casa aparece aqui',
      texto: jogo ? (
        <>
          {nm}, {quando}, é o próximo jogo do {nome}
          {g.elite ? (
            <>
              . Ninguém marcou ainda: cada “Vou assistir aqui” soma em{' '}
              <b>vão assistir</b>, e quem mostrar o código no balcão entra em{' '}
              <b>já chegaram</b>.
            </>
          ) : (
            <>
              . Ninguém abriu a página do bar ainda: cada visita soma em{' '}
              <b>viram o bar</b>, e cada toque em WhatsApp, rota ou telefone, em{' '}
              <b>se interessaram</b>.
            </>
          )}
        </>
      ) : (
        <>
          Bar sem jogo na grade não aparece nas buscas do dia. Com o primeiro
          jogo, ele aparece aqui, com quem viu o {nome} e quem se interessou.
        </>
      )
    } satisfies Dica
  }
  if (passo === 'jogos') {
    const add = g.publicados > inicio
    return {
      alvo: ['[data-passeio="jogos-sugestoes"]', '[data-passeio="jogos"]'],
      titulo: add ? 'Mais um na grade' : 'Ponha mais um jogo',
      texto: add ? (
        <>
          O jogo entrou na grade do {nome} e já aparece para quem procura esse
          jogo perto do bar.
        </>
      ) : (
        <>
          A grade tem {g.publicados} {g.publicados === 1 ? 'jogo' : 'jogos'}
          {nm ? <>, {nm}</> : null}. Estes são jogos desta semana que outros
          bares perto já marcaram e o bar ainda não tem. Cada jogo na grade é
          mais uma busca em que o bar aparece.
          {plano === 'starter'
            ? ` No Starter são ${STARTER_EVENT_LIMIT} por mês; o primeiro não contou.`
            : ''}
        </>
      ),
      dica: add ? undefined : 'Toque num jogo para publicar',
      proximo: add ? 'Próximo' : 'Agora não'
    } satisfies Dica
  }
  if (passo === 'espaco') {
    const both = g.fatos.capa && g.fatos.horario
    return {
      alvo: ['[data-passeio="espaco"]'],
      titulo: 'Foto de capa e horário',
      texto: both ? (
        <>
          Pronto: o card do {nome} já sai com foto e com o horário. A foto
          aparece para o torcedor depois da revisão da Onside.
        </>
      ) : (
        <>
          Hoje o card do {nome} sai na busca
          {g.fatos.capa ? '' : ' sem foto'}
          {!g.fatos.capa && !g.fatos.horario ? ' e' : ''}
          {g.fatos.horario ? '' : ' sem horário'}. Ponha a foto aqui e o horário
          mais abaixo, em Horário: é o que o torcedor olha antes de escolher o
          bar. Dá para fazer agora ou depois.
          {plano === 'starter'
            ? ' No Starter entra a capa; a galeria de fotos é do Pro.'
            : ''}
        </>
      ),
      dica: both ? undefined : 'Toque em Adicionar, na foto',
      proximo: g.fatos.capa || g.fatos.horario ? 'Próximo' : 'Fazer depois'
    } satisfies Dica
  }
  if (passo === 'codigo') {
    const feito = g.locais.codigo === true
    return {
      alvo: ['[data-passeio="codigo"]'],
      selo: 'SÓ NO ELITE',
      titulo: 'O código do balcão',
      texto: feito ? (
        <>
          É isso: no balcão, digitou, validou, liberou a oferta. A visita conta
          para o {nome} e entra em Desempenho. Este, de exemplo, não conta.
        </>
      ) : (
        <>
          Quem marca “Vou assistir aqui”{nm ? <> em {nm}</> : null} recebe um
          código de 6 letras. No balcão, você digita em <b>Validar código</b>,
          libera a oferta da casa e a visita conta para o bar. Teste com o
          código de exemplo.
        </>
      ),
      dica: feito ? undefined : 'Toque em Validar o código de exemplo',
      proximo: feito ? 'Próximo' : 'Agora não'
    } satisfies Dica
  }
  if (passo === 'desempenho') {
    const depois = dia ? `Depois do jogo de ${dia}` : 'Depois do primeiro jogo'
    if (plano === 'starter') {
      return {
        alvo: ['[data-passeio="numeros"]'],
        titulo: 'Onde o jogo vira número',
        texto: `${depois}, aparece aqui quantas pessoas viram o ${nome}, quantas se interessaram e a taxa, nos últimos 30 dias. Hoje está tudo em zero: nada aqui é estimativa.`
      } satisfies Dica
    }
    if (plano === 'pro') {
      return {
        alvo: ['[data-passeio="canais"]', '[data-passeio="numeros"]'],
        selo: 'NO PRO',
        titulo: 'Por onde te procuraram',
        texto: `${depois}, o Pro mostra por onde o torcedor chamou o ${nome}: WhatsApp, rota ou telefone. É assim que você vê se a grade está trazendo gente.`
      } satisfies Dica
    }
    return {
      alvo: ['[data-passeio="quemfoi"]', '[data-passeio="numeros"]'],
      selo: 'NO ELITE',
      titulo: 'Quem foi de verdade',
      texto: `${depois}, aparece aqui quem marcou que ia e quem validou o código no balcão${g.locais.codigo ? ' (o de exemplo não entra)' : ''}. É a visita verificada, o número que mostra o retorno do Elite.`
    } satisfies Dica
  }
  // O fim conta o passeio como feito: o card já mostra assim.
  const itens = g.itens.map((i) =>
    i.id === 'passeio' ? { ...i, feito: true } : i
  )
  const feitos = itens.filter((i) => i.feito).length
  const faltam = itens.filter((i) => !i.feito).map((i) => FALTA[i.id])
  return {
    alvo: ['[data-passeio="fim"]', '[data-passeio="hoje"]'],
    titulo: 'Passeio feito',
    texto: (
      <>
        O que você fez agora já está marcado em Primeiros passos:{' '}
        <b>
          {feitos} de {itens.length}
        </b>
        . {faltam.length ? `Falta ${andList(faltam)}.` : 'Está tudo feito.'} Seu
        teste no {PLAN_NAMES[plano]} vai{fim ? ` até ${fim}` : ''}; trocar de
        plano em Plano e cobrança não muda essa data.
      </>
    )
  } satisfies Dica
}

const FALTA: Record<ItemDoGuia, string> = {
  jogo: 'publicar o primeiro jogo',
  plano: 'escolher o plano',
  passeio: 'conhecer o painel',
  semana: 'pôr mais um jogo na grade',
  foto: 'a foto de capa e o horário',
  codigo: 'validar um código de teste',
  link: 'mandar o link para os clientes'
}

const celular = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 860px)').matches

/**
 * Monta o passeio no layout do painel: o estado atravessa a troca de rota.
 * `?passeio=1` em Hoje (a volta do plano do teste) começa sozinho, uma vez.
 */
export function PasseioProvider({ children }: { children: ReactNode }) {
  const g = useGuia()
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const [lista, setLista] = useState<PassoDoPasseio[] | null>(null)
  const [indice, setIndice] = useState(0)
  const ativo = lista?.[indice] ?? null

  const comecar = useCallback(
    (continuar = false) => {
      const todos = passosDoPasseio(g.itens, g.elite)
      const resto = todos.filter((p) => !g.locais.vistos?.includes(p))
      setLista(continuar && resto.length ? resto : todos)
      setIndice(0)
    },
    [g.itens, g.elite, g.locais.vistos]
  )

  const pedido = (location.search as { passeio?: number }).passeio === 1
  const pedidoAtendido = useRef(false)
  useEffect(() => {
    if (!pedido || !g.pronto || pedidoAtendido.current) return
    pedidoAtendido.current = true
    // Sem `resetScroll`: quem põe o destaque à vista é o passeio.
    void navigate({
      to: '/admin',
      search: {},
      replace: true,
      resetScroll: false
    }).then(() => {
      if (g.novo) comecar()
    })
  }, [pedido, g.pronto, g.novo, comecar, navigate])

  // Cada passo marca a tela como vista; o fim marca o passeio.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na troca de passo.
  useEffect(() => {
    if (!ativo) return
    const vistos = [...new Set([...(g.locais.vistos ?? []), ativo])]
    g.marcar(ativo === 'fim' ? { vistos, passeio: true } : { vistos })
    if (location.pathname.replace(/\/$/, '') !== ROTA[ativo]) {
      void navigate({ to: ROTA[ativo], resetScroll: false })
    }
  }, [ativo])

  const parar = (feito: boolean) => {
    setLista(null)
    if (feito) {
      toast.success('Bom jogo. O painel é seu.')
      document
        .querySelector('[data-passeio="fim"]')
        ?.scrollIntoView({ block: 'center' })
    } else {
      toast('Passeio pausado. Continue pelo Primeiros passos, em Hoje.')
    }
  }

  return (
    <PasseioContext.Provider value={{ ativo, comecar }}>
      {children}
      {ativo && lista ? (
        // Fora da casca: o `.pn3` daqui só traz os tokens do painel.
        <div className="pn3 pn-tour-host">
          <Destaque
            key={ativo}
            passo={ativo}
            indice={indice}
            total={lista.length}
            rotaCerta={location.pathname.replace(/\/$/, '') === ROTA[ativo]}
            onVoltar={() => setIndice((i) => Math.max(0, i - 1))}
            onProximo={() =>
              indice >= lista.length - 1 ? parar(true) : setIndice((i) => i + 1)
            }
            onPausar={() => parar(false)}
          />
        </div>
      ) : null}
    </PasseioContext.Provider>
  )
}

type Caixa = { left: number; top: number; width: number; height: number }

function Destaque({
  passo,
  indice,
  total,
  rotaCerta,
  onVoltar,
  onProximo,
  onPausar
}: {
  passo: PassoDoPasseio
  indice: number
  total: number
  rotaCerta: boolean
  onVoltar: () => void
  onProximo: () => void
  onPausar: () => void
}) {
  const g = useGuia()
  // Quantos jogos havia quando o passo abriu: publicar um muda o texto.
  const [inicio] = useState(g.publicados)
  const dica = dicaDo(passo, inicio, g)
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null)
  // Sem alvo achado (a rota nova ainda não chegou ou os dados ainda vêm), a
  // dica fica escondida: mostrar no canto e pular para o destaque era o salto
  // a cada passo. Só aparece no canto se o alvo não chegar (`desistiu`).
  const [desistiu, setDesistiu] = useState(false)
  const pronta = caixa !== null || desistiu
  const tipRef = useRef<HTMLDivElement>(null)
  const proximoRef = useRef<HTMLButtonElement>(null)
  const alvo = useRef<Element | null>(null)
  const ultimo = indice === total - 1
  const seletores = dica.alvo.join('|')

  // Acha o alvo na tela nova (ele pode chegar depois dos dados) e o põe à
  // vista uma vez; depois só acompanha rolagem e tamanho. Procurar o alvo não
  // é avançar: sem ele, a dica fica no canto, sem destaque.
  useLayoutEffect(() => {
    if (!rotaCerta) return
    let quadro = 0
    let tentativas = 0
    let observer: ResizeObserver | null = null
    const medir = () => {
      const el = alvo.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const pad = 8
      setCaixa({
        left: r.left - pad,
        top: r.top - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2
      })
    }
    const achar = () => {
      const el = seletores
        .split('|')
        .map((s) => document.querySelector(s))
        .find(Boolean)
      if (!el) {
        if (tentativas++ < 240) quadro = requestAnimationFrame(achar)
        else setDesistiu(true)
        return
      }
      alvo.current = el
      const topo = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, topo - (celular() ? 78 : 96)) })
      observer = new ResizeObserver(medir)
      observer.observe(el)
      medir()
    }
    achar()
    const onScroll = () => medir()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(quadro)
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [rotaCerta, seletores])

  // A dica ao lado do destaque, senão embaixo, senão em cima; no celular é
  // uma folha embaixo (CSS).
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || celular()) return setTip(null)
    const tw = el.offsetWidth
    const th = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!caixa) return setTip({ left: vw - tw - 24, top: vh - th - 24 })
    const { left: L, top: T, width: W, height: H } = caixa
    if (vw - (L + W) > tw + 28) {
      setTip({ left: L + W + 16, top: Math.max(16, Math.min(vh - th - 16, T)) })
    } else if (vh - (T + H) > th + 28) {
      setTip({ left: Math.min(Math.max(16, L), vw - tw - 16), top: T + H + 16 })
    } else if (T > th + 28) {
      setTip({
        left: Math.min(Math.max(16, L), vw - tw - 16),
        top: T - th - 16
      })
    } else {
      setTip({ left: vw - tw - 24, top: Math.max(16, vh - th - 88) })
    }
  }, [caixa])

  useEffect(() => {
    if (pronta) proximoRef.current?.focus({ preventScroll: true })
  }, [pronta])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPausar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onPausar])

  // O furo deixa tocar no que está em destaque; o resto da tela fica parado.
  const furo = caixa
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${caixa.left}px ${caixa.top}px, ${caixa.left + caixa.width}px ${caixa.top}px, ${caixa.left + caixa.width}px ${caixa.top + caixa.height}px, ${caixa.left}px ${caixa.top + caixa.height}px, ${caixa.left}px ${caixa.top}px)`
    : undefined

  return (
    <div className="pn-tour">
      <div className="pn-tour-blk" style={{ clipPath: furo }} />
      {caixa ? <div className="pn-tour-spot" style={caixa} /> : null}
      <div
        ref={tipRef}
        className={pronta ? 'pn-tour-tip is-on' : 'pn-tour-tip'}
        role="dialog"
        aria-modal="false"
        aria-labelledby="pn-tour-t"
        style={tip ?? undefined}
      >
        <div className="pn-tour-k">
          <span className="mono">
            {indice + 1} DE {total}
            {dica.selo ? ` · ${dica.selo}` : ''}
          </span>
          <button type="button" className="pn-lnk-b" onClick={onPausar}>
            Pular o passeio
          </button>
        </div>
        <h3 id="pn-tour-t" className="pn-disp">
          {dica.titulo}
        </h3>
        <p aria-live="polite">{dica.texto}</p>
        {dica.dica ? (
          <p className="pn-tour-hint">
            <Sparkle size={16} />
            {dica.dica}
          </p>
        ) : null}
        <div className="pn-tour-a">
          {indice ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={onVoltar}
            >
              Voltar
            </button>
          ) : (
            <span />
          )}
          <button
            ref={proximoRef}
            type="button"
            className="pn-btn pn-acid pn-sm"
            onClick={onProximo}
          >
            {ultimo ? 'Começar a usar' : (dica.proximo ?? 'Próximo')}
          </button>
        </div>
        <div className="pn-tour-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: os pontos são só a posição.
            <i key={i} className={i === indice ? 'on' : undefined} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── O card em Hoje ─── */

export function PrimeirosPassos() {
  const g = useGuia()
  const { ativo, comecar } = usePasseio()
  const { bar, jogo, subscription, itens, locais, marcar } = g
  const link = useLinkDoBar(
    bar ?? ({ id: '', name: '', neighborhood: '' } as never)
  )
  if (!bar || !g.novo || !g.pronto) return null
  const feitos = itens.filter((i) => i.feito).length
  // Escondido ou completo, some; durante o passeio fica, porque o fim aponta
  // para ele.
  if (!ativo && (locais.oculto || feitos === itens.length)) return null

  const plano = PLAN_NAMES[subscription?.plan ?? 'starter']
  const fim = fimDoTeste(subscription?.currentPeriodEnd)
  const vistos = locais.vistos ?? []
  const pausado = vistos.length > 0 && !locais.passeio
  const resto = passosDoPasseio(itens, g.elite).filter(
    (p) => !vistos.includes(p)
  ).length
  const proximo = itens.find((i) => !i.feito)?.id
  const publicadosAlem = Math.max(0, g.publicados - 1)
  const mensagem = mensagemDoJogo(bar, jogo, link.url)
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success(texto)
      marcar({ link: true })
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie à mão.')
    }
  }

  const linha: Record<
    ItemDoGuia,
    { titulo: string; texto: string; acao: ReactNode }
  > = {
    jogo: {
      titulo: 'Publicar o primeiro jogo',
      texto: jogo
        ? `${eventTitle(jogo)}, ${diaDaSugestao(String(jogo.startsAt))} ${brasiliaTime(jogo.startsAt)} · por conta da Onside, fora do limite do plano`
        : 'Por conta da Onside: o primeiro jogo não conta no limite do plano.',
      acao: (
        <Link to={PUB_LIVE_PATH} className="pn-btn pn-ink pn-sm">
          <Add size={16} />
          Publicar
        </Link>
      )
    },
    plano: {
      titulo: 'Escolher o plano do teste',
      texto: `${plano} grátis${fim ? ` até ${fim}` : ''}, sem cartão. Troque quando quiser; o fim do teste não muda.`,
      acao: (
        <Link
          to={PUB_LIVE_PATH}
          search={{ passo: 'plano' }}
          className="pn-btn pn-ghost pn-sm"
        >
          Escolher
        </Link>
      )
    },
    passeio: {
      titulo: 'Conhecer o painel',
      texto: locais.passeio
        ? `Passeio feito: Hoje, Jogos, Meu espaço${g.elite ? ', Quem vai' : ''} e Desempenho.`
        : pausado
          ? `Você parou no meio. Falta${resto > 1 ? `m ${resto} telas` : ' 1 tela'}, com os dados do ${bar.name}.`
          : `Um passeio pelas telas que você vai usar, com o seu jogo e os números do ${bar.name}.`,
      acao: (
        <button
          type="button"
          className="pn-btn pn-ink pn-sm"
          onClick={() => comecar(pausado)}
        >
          <Sparkle size={16} />
          {pausado ? 'Continuar o passeio' : 'Fazer o passeio'}
        </button>
      )
    },
    semana: {
      titulo: 'Pôr mais um jogo na grade',
      texto: publicadosAlem
        ? `${publicadosAlem} ${publicadosAlem === 1 ? 'jogo a mais' : 'jogos a mais'} na grade`
        : 'Cada jogo na grade é mais uma busca em que o bar aparece.',
      acao: (
        <Link to="/admin/jogos" className="pn-btn pn-ghost pn-sm">
          <Add size={16} />
          Ver sugestões
        </Link>
      )
    },
    foto: {
      titulo: 'Foto de capa e horário',
      texto:
        g.fatos.capa && g.fatos.horario
          ? 'Capa e horário no card do bar.'
          : 'Com foto e horário, o card do bar sai completo na busca. A foto passa pela revisão da Onside.',
      acao: (
        <Link to="/admin/meu-espaco" className="pn-btn pn-ghost pn-sm">
          Abrir Meu espaço
        </Link>
      )
    },
    codigo: {
      titulo: 'Validar um código de teste',
      texto: locais.codigo
        ? 'Código de exemplo validado. O próximo é de um torcedor de verdade.'
        : 'Treine o balcão com um código de exemplo antes do primeiro torcedor chegar.',
      acao: (
        <Link to="/admin/quem-vai" className="pn-btn pn-ghost pn-sm">
          <Qr size={16} />
          Treinar
        </Link>
      )
    },
    link: {
      titulo: 'Mandar o link do bar para os clientes',
      texto: 'No grupo do WhatsApp, na bio do Instagram ou o QR no balcão.',
      acao: (
        <span className="pn-guia-sh">
          <a
            className="pn-btn pn-ghost pn-sm"
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => marcar({ link: true })}
          >
            <Share size={16} />
            WhatsApp
          </a>
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            onClick={() =>
              void copiar('Link copiado. Cole na bio do Instagram.')
            }
          >
            Instagram
          </button>
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            onClick={() => void copiar(`Link copiado: ${link.curto}`)}
          >
            Copiar link
          </button>
        </span>
      )
    }
  }

  return (
    <section
      className="pn-card pn-guia"
      aria-labelledby="pn-guia-t"
      data-passeio="fim"
    >
      <div className="pn-guia-h">
        <span>
          <span className="pn-k">
            {feitos} de {itens.length} feitos
          </span>
          <h3 id="pn-guia-t">Primeiros passos do {bar.name}</h3>
        </span>
        <button
          type="button"
          className="pn-lnk-b"
          onClick={() => {
            marcar({ oculto: true })
            toast('Primeiros passos escondido. Os itens seguem valendo.')
          }}
        >
          Esconder
        </button>
      </div>
      <div
        className="pn-prog"
        role="progressbar"
        aria-label="Primeiros passos"
        aria-valuemin={0}
        aria-valuemax={itens.length}
        aria-valuenow={feitos}
      >
        <i style={{ width: `${Math.round((feitos / itens.length) * 100)}%` }} />
      </div>
      <ol className="pn-todo pn-guia-l">
        {itens.map((item) => {
          const l = linha[item.id]
          return (
            <li
              key={item.id}
              className={[
                item.feito ? 'is-dn' : '',
                item.id === proximo ? 'is-nx' : '',
                item.id === 'link' && !item.feito ? 'is-sh' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={`pn-c${item.feito ? '' : ' is-no'}`}
                aria-hidden="true"
              >
                {item.feito ? <Check size={16} /> : null}
              </span>
              <span>
                <b>
                  {l.titulo}
                  <span className="sr-only">
                    {item.feito ? ' · feito' : ' · falta'}
                  </span>
                </b>
                <span>{l.texto}</span>
              </span>
              {item.feito ? (
                <span className="pn-ok">
                  <Check size={14} />
                  Feito
                </span>
              ) : (
                l.acao
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ─── O código de exemplo em Quem vai ─── */

const EXEMPLO = 'GRTGVX'

/**
 * "Treine o balcão": o código de exemplo validado só na tela. Nada vai ao
 * servidor nem conta visita; a marca fica no navegador ("Validar um código
 * de teste" do card). Para o bar do cadastro novo, enquanto o card vale.
 */
export function TreineOBalcao() {
  const g = useGuia()
  const { ativo } = usePasseio()
  const [letras, setLetras] = useState(0)
  const feito = g.locais.codigo === true
  const reduzido =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!letras || letras >= EXEMPLO.length) return
    const t = setTimeout(() => setLetras((n) => n + 1), reduzido ? 0 : 110)
    return () => clearTimeout(t)
  }, [letras, reduzido])
  useEffect(() => {
    if (letras === EXEMPLO.length && !feito) g.marcar({ codigo: true })
  }, [letras, feito, g.marcar])

  if (!g.novo || !g.elite) return null
  if (!ativo && g.locais.oculto) return null
  const titulo = g.jogo ? eventTitle(g.jogo) : 'o próximo jogo'
  const mostrar = feito ? EXEMPLO.length : letras

  return (
    <section
      className="pn-card pn-treino"
      aria-labelledby="pn-treino-t"
      data-passeio="codigo"
    >
      <div className="pn-chd">
        <h3 id="pn-treino-t">Treine o balcão</h3>
        <small>exemplo · não conta nas visitas</small>
      </div>
      <div className="pn-treino-g">
        <div className="pn-tkt">
          <span className="mono">CÓDIGO DO BALCÃO</span>
          <b>GRT-GVX</b>
          <span>Torcedor de exemplo · {titulo}</span>
        </div>
        <div>
          <p className="pn-treino-p">
            É o que o torcedor mostra no celular. No balcão, você digita as 6
            letras.
          </p>
          <div className="pn-treino-box" aria-hidden="true">
            {EXEMPLO.split('').map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as caixas são fixas.
              <span key={i}>{i < mostrar ? c : ''}</span>
            ))}
          </div>
          {feito ? (
            <div className="pn-treino-ok" role="status">
              <b>Código validado</b>
              <p>
                Exemplo · {titulo}. Num código de verdade, aqui você libera a
                oferta da casa.
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="pn-btn pn-acid"
              disabled={letras > 0}
              onClick={() => setLetras(1)}
            >
              <Qr size={18} />
              Validar o código de exemplo
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
