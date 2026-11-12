import {
  AMENITIES,
  AMENITY_GROUPS,
  HOUSE_OFFER_AMENITY_ID,
  MAX_SCREEN_COUNT,
  motivoTelasInvalido
} from '@findsports_oficial/api/lib/amenities'
import {
  mensagemEnderecoIndisponivel,
  mensagemEnderecoNaoEncontrado,
  motivoTelefoneInvalido
} from '@findsports_oficial/api/lib/bar-profile-validation'
import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  formatAverageSpend,
  menuUrlHost
} from '@findsports_oficial/db/bar-menu'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import type { AdminBar } from '@/components/admin/admin-model'
import {
  useEventsState,
  useMyBar,
  useMySubscription
} from '@/components/admin/admin-queries'
import { buildReadiness } from '@/components/admin/conversion-readiness'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Arrow,
  Beer,
  Calendar,
  Check,
  Doc,
  Pin,
  Tv
} from '@/components/landing/v3/icons'
import { conciliarUfComCidade, UfSelect } from '@/components/uf-select'
import { getTeamMessage } from '@/domain/code-confirmation'
import { getEventTemporalState } from '@/domain/events'
import { type EnderecoDoCep, useCep } from '@/lib/cep'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import { getPlan, PLAN_TIER_ORDER } from '@/lib/plan-catalog'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { formatPhone } from '@/utils/format-phone'
import { useTRPC } from '@/utils/trpc'
import { ListaDeAvaliacoes } from './avaliacao'
import {
  FotosDoBar,
  type GaleriaBloqueada,
  useEnvioDeFoto
} from './espaco-fotos'
import { EspacoPrevia } from './espaco-previa'
import {
  avisoDaDescricao,
  cardapio,
  DIA_PADRAO,
  doBar,
  entradaDoPerfil,
  horario,
  oferta,
  PARTES,
  type Parte,
  type Perfil,
  perfilMudou,
  type Rascunho
} from './espaco-rascunho'
import { Interruptor } from './painel-shell'
import { TimesDaCasa } from './times-da-casa'

/*
 * "Meu espaço" do painel novo (WEB-501, fase 4; protótipo `espaco`, `dirty`
 * e a barra de salvar). Um formulário só, com rascunho até "Salvar
 * alterações", que manda cada parte à sua mutation só se ela mudou: perfil e
 * características (`updateMe`), horário (`updateOpeningHours`, WEB-397),
 * oferta (`updateHouseOffer`, Elite) e cardápio (`updateMenuInfo`, Pro). Fotos
 * (WEB-462), WhatsApp e "como o código é conferido" gravam na hora. A
 * descrição e as fotos passam pela revisão da Onside antes do torcedor ver. Recurso pago só entra com o plano em dia; o
 * servidor confere de novo.
 */

type Plano =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      plan: SubscriptionPlan
      standing: SubscriptionStanding | null
    }

const ITENS = AMENITIES.filter(({ id }) => id !== HOUSE_OFFER_AMENITY_ID)

const SUGESTOES = [
  'Chopp em dobro',
  '10% no primeiro pedido',
  'Porção de batata grátis',
  'Caipirinha pela metade'
]

const DESCRICAO_MAX = 500

/** Segunda primeiro, como se lê a semana de um bar; o índice é o do servidor. */
const SEMANA = [
  [1, 'Seg', 'Segunda'],
  [2, 'Ter', 'Terça'],
  [3, 'Qua', 'Quarta'],
  [4, 'Qui', 'Quinta'],
  [5, 'Sex', 'Sexta'],
  [6, 'Sáb', 'Sábado'],
  [0, 'Dom', 'Domingo']
] as const

function alcanca(plano: Plano, tier: 'pro' | 'elite') {
  return (
    plano.status === 'ready' &&
    PLAN_TIER_ORDER[plano.plan] >= PLAN_TIER_ORDER[tier]
  )
}

function liberado(plano: Plano, tier: 'pro' | 'elite') {
  return (
    alcanca(plano, tier) &&
    plano.status === 'ready' &&
    plano.standing === 'current'
  )
}

export function MeuEspacoPage() {
  const { data: bar } = useMyBar()
  // O layout só monta a tela com o bar carregado.
  if (!bar) return null
  return <Espaco bar={bar} />
}

function Espaco({ bar }: { bar: AdminBar }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const now = useMinuteNow()
  const eventsState = useEventsState()
  const sub = useMySubscription()

  // Plano vigente, com status — não `bar.plan`. Dado em cache vence erro de
  // refetch: trocar o formulário pelo aviso apagaria o que o dono digitou.
  const plano: Plano =
    sub.data !== undefined
      ? {
          status: 'ready',
          plan: sub.data?.plan ?? 'starter',
          standing: sub.data?.standing ?? null
        }
      : sub.isError
        ? { status: 'error' }
        : { status: 'loading' }
  const proOk = liberado(plano, 'pro')
  const eliteOk = liberado(plano, 'elite')
  const galeriaBloqueada: GaleriaBloqueada = proOk
    ? null
    : plano.status !== 'ready'
      ? 'carregando'
      : alcanca(plano, 'pro') && isLapsed(plano.standing)
        ? 'pagamento'
        : 'plano'
  const envio = useEnvioDeFoto()

  /* ─── Rascunho ─── */
  const [rascunho, setRascunho] = useState<Rascunho>(() => doBar(bar))
  const [base, setBase] = useState(bar)
  const [cepFill, setCepFill] = useState<EnderecoDoCep | null>(null)
  // Troca a chave do telefone ao descartar: o campo guarda os dígitos.
  const [versao, setVersao] = useState(0)
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<Partial<Record<Parte, string>>>({})
  // Recusa ou falha do servidor (não a conferência antes de mandar): o botão
  // vira "Tentar de novo".
  const [falhou, setFalhou] = useState(false)

  const {
    cep,
    status: cepStatus,
    mudar: mudarCep,
    definir: definirCep
  } = useCep((achado) => {
    setCepFill(achado)
    setRascunho((r) => ({
      ...r,
      perfil: {
        ...r.perfil,
        rua: achado.rua || r.perfil.rua,
        neighborhood: achado.bairro || r.perfil.neighborhood,
        city: achado.cidade,
        uf: achado.uf || r.perfil.uf
      }
    }))
  })

  const gravado = doBar(base)
  const sujo: Record<Parte, boolean> = {
    perfil: perfilMudou(rascunho.perfil, gravado.perfil, cep),
    horario: horario(rascunho.horario, base.openingHours).mudou,
    oferta: eliteOk && oferta(rascunho.oferta, base.houseOffer).mudou,
    cardapio: proOk && cardapio(rascunho.cardapio, base).mudou
  }

  // O bar relido em segundo plano entra só nas partes que o dono não mexeu.
  // Na renderização, não em efeito: um efeito aqui apagaria o que foi digitado.
  if (bar !== base) {
    const novo = doBar(bar)
    setRascunho((r) => ({
      perfil: sujo.perfil ? r.perfil : novo.perfil,
      horario: sujo.horario ? r.horario : novo.horario,
      oferta: sujo.oferta ? r.oferta : novo.oferta,
      cardapio: sujo.cardapio ? r.cardapio : novo.cardapio
    }))
    setBase(bar)
  }

  const setPerfil = (patch: Partial<Perfil>) =>
    setRascunho((r) => ({ ...r, perfil: { ...r.perfil, ...patch } }))

  const invalidateBar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.pubs.getById.pathKey() })
    ])

  /* ─── Mutations ─── */
  const updateMe = useMutation(trpc.pub.updateMe.mutationOptions())
  const updateOffer = useMutation(trpc.pub.updateHouseOffer.mutationOptions())
  const updateMenu = useMutation(trpc.pub.updateMenuInfo.mutationOptions())
  const updateHours = useMutation(trpc.pub.updateOpeningHours.mutationOptions())
  // WhatsApp grava na hora, com a sua mutation: a falha dele não vira erro
  // do formulário (WEB-212).
  const whatsapp = useMutation(
    trpc.pub.updateMe.mutationOptions({ onSuccess: () => void invalidateBar() })
  )
  const codigo = useMutation(
    trpc.pub.updateCodeConfirmation.mutationOptions({
      onSuccess: invalidateBar
    })
  )

  const descartar = () => {
    setRascunho(doBar(bar))
    setBase(bar)
    definirCep('')
    setCepFill(null)
    setErros({})
    setFalhou(false)
    setTentou(false)
    setVersao((v) => v + 1)
  }

  const erroPerfil = (err: unknown, input: { city?: string; uf?: string }) => {
    const code = (err as { data?: { code?: string } })?.data?.code
    // O telefone já foi conferido antes; sobra a recusa do endereço (WEB-115)
    // ou o geocoding fora do ar (WEB-191).
    return code === 'UNPROCESSABLE_CONTENT'
      ? mensagemEnderecoNaoEncontrado(
          input.city ?? bar.city ?? '',
          (input.uf ?? bar.uf ?? undefined) as Parameters<
            typeof mensagemEnderecoNaoEncontrado
          >[1]
        )
      : code === 'SERVICE_UNAVAILABLE'
        ? mensagemEnderecoIndisponivel
        : getUserFacingMessage(
            err,
            'Não foi possível salvar o perfil. Tente novamente.'
          )
  }

  const salvar = async () => {
    if (salvando) return
    setTentou(true)
    const p = rascunho.perfil
    const motivo = sujo.perfil
      ? (motivoTelefoneInvalido(p.phone, base.phone) ??
        motivoTelasInvalido(p.screenCount))
      : null
    const of = oferta(rascunho.oferta, base.houseOffer)
    const cd = cardapio(rascunho.cardapio, base)
    const hr = horario(rascunho.horario, base.openingHours)
    const bloqueio: Partial<Record<Parte, string>> = {}
    if (motivo) bloqueio.perfil = motivo
    if (sujo.horario && hr.erro) bloqueio.horario = hr.erro
    if (sujo.oferta && of.erro) bloqueio.oferta = of.erro
    if (sujo.cardapio && (cd.erroUrl || cd.erroGasto))
      bloqueio.cardapio = 'Confira o link e o preço médio.'
    if (Object.keys(bloqueio).length) {
      setErros(bloqueio)
      return
    }

    setSalvando(true)
    setErros({})
    const entrada = entradaDoPerfil(p, gravado.perfil, cep)
    const tarefas: [Parte, Promise<unknown>][] = []
    if (sujo.perfil) tarefas.push(['perfil', updateMe.mutateAsync(entrada)])
    if (sujo.horario)
      tarefas.push([
        'horario',
        updateHours.mutateAsync({ openingHours: hr.valor })
      ])
    if (sujo.oferta)
      tarefas.push([
        'oferta',
        updateOffer.mutateAsync({ houseOffer: of.valor })
      ])
    if (sujo.cardapio)
      tarefas.push(['cardapio', updateMenu.mutateAsync(cd.mudancas)])

    const feitos = await Promise.allSettled(tarefas.map(([, t]) => t))
    const falhas: Partial<Record<Parte, string>> = {}
    feitos.forEach((r, i) => {
      const parte = tarefas[i]?.[0] as Parte
      if (r.status === 'fulfilled') return
      const err = r.reason as { data?: { code?: string } }
      // Recusa por plano: a assinatura mudou com o painel aberto; reler o
      // plano troca o card pelo aviso.
      if (err?.data?.code === 'FORBIDDEN')
        void queryClient.invalidateQueries({
          queryKey: trpc.pub.getMySubscription.queryKey()
        })
      falhas[parte] =
        parte === 'perfil'
          ? erroPerfil(err, entrada)
          : parte === 'horario'
            ? getUserFacingMessage(
                err,
                'Não foi possível salvar o horário. Tente novamente.'
              )
            : parte === 'oferta'
              ? getUserFacingMessage(
                  err,
                  'Não foi possível salvar a oferta. Tente novamente.'
                )
              : getUserFacingMessage(
                  err,
                  'Não foi possível salvar o cardápio e o preço médio. Tente novamente.'
                )
    })

    await invalidateBar()
    const fresco =
      queryClient.getQueryData(trpc.pub.getMe.queryKey()) ?? (bar as AdminBar)
    const novo = doBar(fresco)
    const salvas = tarefas.map(([parte]) => parte).filter((k) => !falhas[k])
    setRascunho((r) => ({
      perfil: salvas.includes('perfil') ? novo.perfil : r.perfil,
      horario: salvas.includes('horario') ? novo.horario : r.horario,
      oferta: salvas.includes('oferta') ? novo.oferta : r.oferta,
      cardapio: salvas.includes('cardapio') ? novo.cardapio : r.cardapio
    }))
    setBase(fresco)
    if (salvas.includes('perfil')) {
      definirCep('')
      setCepFill(null)
      setVersao((v) => v + 1)
    }
    setErros(falhas)
    setFalhou(Object.keys(falhas).length > 0)
    setSalvando(false)
    if (Object.keys(falhas).length === 0) {
      setTentou(false)
      toast.success('Alterações salvas.')
    }
  }

  /* ─── Perfil 4 de 6 ─── */
  const events = eventsState.status === 'ready' ? eventsState.events : []
  const temProximo = events.some(
    (e) => getEventTemporalState(e.startsAt, e.endsAt, now) === 'upcoming'
  )
  const prontidao = buildReadiness(bar, temProximo)
  const faltam = prontidao.total - prontidao.score
  const ir = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }
  const confirmarWhatsApp = () => {
    if (!bar.phone) return
    whatsapp.mutate({ phone: bar.phone, phoneAcceptsWhatsapp: true })
  }

  const algoSujo = PARTES.some((k) => sujo[k])
  const p = rascunho.perfil
  const telasErro = motivoTelasInvalido(p.screenCount)
  const of = oferta(rascunho.oferta, base.houseOffer)
  const cd = cardapio(rascunho.cardapio, base)
  const horarioErro = tentou
    ? horario(rascunho.horario, base.openingHours).erro
    : null
  const fromCep = (value: string, found: string | undefined) =>
    cepStatus === 'achou' && Boolean(found) && value.trim() === found
  const telefoneMudou = p.phone !== gravado.perfil.phone
  // O aviso é do que está gravado: some ao editar só depois de salvar.
  const descricao = avisoDaDescricao(bar)

  return (
    <>
      <div className="pn-head">
        <div>
          <p className="pn-k">Tudo o que o torcedor vê no app e no site</p>
          <h1 className="pn-disp">Meu espaço</h1>
        </div>
        <div className="pn-acts">
          <Link
            to="/pub/$pubId"
            params={{ pubId: bar.id }}
            target="_blank"
            className="pn-btn pn-ghost pn-sm"
          >
            Ver como torcedor
          </Link>
        </div>
      </div>

      {plano.status === 'error' ? (
        <div className="pn-err" role="alert">
          <p>Não foi possível conferir o seu plano.</p>
          {isRetryableError(sub.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void sub.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pn-esp">
        <div>
          {/* ─── Perfil N de 7 ─── */}
          <section
            className="pn-card pn-sec2"
            aria-labelledby="esp-pf"
            data-passeio="espaco"
          >
            <div className="pn-chd">
              <h3 id="esp-pf">
                Perfil {prontidao.score} de {prontidao.total}
              </h3>
              <small>
                {faltam === 0
                  ? 'completo'
                  : faltam === 1
                    ? 'falta 1'
                    : `faltam ${faltam}`}
              </small>
            </div>
            <div
              className="pn-prog"
              role="progressbar"
              aria-label="Perfil do bar"
              aria-valuemin={0}
              aria-valuemax={prontidao.total}
              aria-valuenow={prontidao.score}
            >
              <i
                style={{
                  width: `${Math.round((prontidao.score / prontidao.total) * 100)}%`
                }}
              />
            </div>
            <ul className="pn-todo">
              {prontidao.checks.map((c) => (
                <li key={c.key}>
                  <span className={`pn-c${c.done ? '' : ' is-no'}`}>
                    {c.done ? <Check size={16} /> : null}
                  </span>
                  <span>
                    <b>{c.label}</b>
                    {c.done ? null : <span>{c.description}</span>}
                  </span>
                  {c.done ? (
                    <span />
                  ) : c.key === 'upcoming_event' ? (
                    <Link to="/admin/jogos" className="pn-btn pn-ghost pn-sm">
                      Cadastrar jogo
                    </Link>
                  ) : c.key === 'whatsapp' ? (
                    (bar.phone?.length ?? 0) >= 10 ? (
                      <button
                        type="button"
                        className="pn-btn pn-ghost pn-sm"
                        disabled={whatsapp.isPending}
                        onClick={confirmarWhatsApp}
                      >
                        {whatsapp.isPending ? 'Confirmando…' : 'Confirmar'}
                      </button>
                    ) : (
                      <span />
                    )
                  ) : (
                    <button
                      type="button"
                      className="pn-btn pn-ghost pn-sm"
                      onClick={() =>
                        c.key === 'photo'
                          ? envio.escolher({ capa: true })
                          : ir(
                              c.key === 'name'
                                ? 'esp-nome'
                                : c.key === 'address'
                                  ? 'esp-rua'
                                  : c.key === 'phone'
                                    ? 'esp-tel'
                                    : 'esp-car'
                            )
                      }
                    >
                      {c.key === 'amenities'
                        ? 'Marcar'
                        : c.key === 'photo' || c.key === 'phone'
                          ? 'Adicionar'
                          : 'Completar'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {whatsapp.isError ? (
              <p className="pn-ferr" role="alert">
                {getUserFacingMessage(
                  whatsapp.error,
                  'Não foi possível confirmar o WhatsApp. Tente novamente.'
                )}
              </p>
            ) : null}
          </section>

          {/* ─── Fotos ─── */}
          <FotosDoBar
            nome={bar.name}
            capaUrl={bar.photoUrl ?? null}
            bloqueio={galeriaBloqueada}
            envio={envio}
            onMudou={invalidateBar}
          />

          {/* ─── Informações ─── */}
          <section className="pn-card pn-sec2" aria-labelledby="esp-inf">
            <div className="pn-chd">
              <h3 id="esp-inf">
                <Pin size={20} />
                Informações
              </h3>
            </div>
            <div className="pn-form2">
              <Campo id="esp-nome" label="Nome do bar" span="c3">
                <input
                  id="esp-nome"
                  className="pn-inp"
                  value={p.name}
                  maxLength={100}
                  autoComplete="organization"
                  onChange={(e) => setPerfil({ name: e.target.value })}
                />
              </Campo>
              <Campo id="esp-tel" label="Telefone" span="c3">
                <CampoTelefone
                  key={versao}
                  id="esp-tel"
                  value={p.phone}
                  invalid={Boolean(erros.perfil && telefoneMudou)}
                  onChange={(phone) => setPerfil({ phone })}
                />
              </Campo>
              <div className="pn-c6 pn-wpp">
                {bar.phoneAcceptsWhatsapp && !telefoneMudou ? (
                  <span className="pn-badge is-pub">WHATSAPP CONFIRMADO</span>
                ) : (bar.phone?.length ?? 0) >= 10 && !telefoneMudou ? (
                  <>
                    <span>
                      O botão de WhatsApp só aparece no perfil depois da
                      confirmação.
                    </span>
                    <button
                      type="button"
                      className="pn-btn pn-ghost pn-sm"
                      disabled={whatsapp.isPending}
                      onClick={confirmarWhatsApp}
                    >
                      {whatsapp.isPending
                        ? 'Confirmando…'
                        : 'Este número é WhatsApp'}
                    </button>
                  </>
                ) : telefoneMudou && bar.phoneAcceptsWhatsapp ? (
                  <span>
                    Telefone novo: depois de salvar, confirme de novo que ele é
                    WhatsApp.
                  </span>
                ) : null}
              </div>

              <Campo
                id="esp-cep"
                label="CEP"
                span="c2"
                extra={
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Não sei o CEP
                  </a>
                }
              >
                <input
                  id="esp-cep"
                  className="pn-inp"
                  value={cep}
                  onChange={(e) => void mudarCep(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  aria-describedby="esp-cep-status"
                />
              </Campo>
              <p
                id="esp-cep-status"
                className="pn-c4 pn-cepst"
                aria-live="polite"
              >
                {cepStatus === 'buscando'
                  ? 'Buscando o CEP…'
                  : cepStatus === 'achou'
                    ? 'CEP encontrado. Confira o endereço e o número.'
                    : cepStatus === 'nao'
                      ? 'Não achamos esse CEP. Preencha o endereço abaixo.'
                      : 'O CEP preenche rua, bairro, cidade e estado, e acerta o pino no mapa.'}
              </p>

              <Campo
                id="esp-rua"
                label="Rua"
                span="c4"
                auto={fromCep(p.rua, cepFill?.rua)}
              >
                <input
                  id="esp-rua"
                  className="pn-inp"
                  value={p.rua}
                  maxLength={180}
                  autoComplete="address-line1"
                  onChange={(e) => setPerfil({ rua: e.target.value })}
                />
              </Campo>
              <Campo id="esp-num" label="Número" span="c2">
                <input
                  id="esp-num"
                  className="pn-inp"
                  value={p.numero}
                  maxLength={20}
                  autoComplete="off"
                  onChange={(e) => setPerfil({ numero: e.target.value })}
                />
              </Campo>
              <Campo
                id="esp-bairro"
                label="Bairro"
                span="c2"
                auto={fromCep(p.neighborhood, cepFill?.bairro)}
              >
                <input
                  id="esp-bairro"
                  className="pn-inp"
                  value={p.neighborhood}
                  maxLength={100}
                  autoComplete="address-level3"
                  onChange={(e) => setPerfil({ neighborhood: e.target.value })}
                />
              </Campo>
              <Campo
                id="esp-cidade"
                label="Cidade"
                span="c2"
                auto={fromCep(p.city, cepFill?.cidade)}
              >
                <input
                  id="esp-cidade"
                  className="pn-inp"
                  value={p.city}
                  maxLength={100}
                  autoComplete="address-level2"
                  onChange={(e) => setPerfil({ city: e.target.value })}
                  onBlur={() =>
                    conciliarUfComCidade(p.city, (proxima) =>
                      setRascunho((r) => ({
                        ...r,
                        perfil: { ...r.perfil, uf: proxima(r.perfil.uf) }
                      }))
                    )
                  }
                />
              </Campo>
              <Campo
                id="esp-uf"
                label="Estado (UF)"
                span="c2"
                auto={fromCep(p.uf, cepFill?.uf)}
              >
                <UfSelect
                  id="esp-uf"
                  value={p.uf}
                  onChange={(uf) => setPerfil({ uf })}
                  className="pn-inp"
                />
              </Campo>
              <Campo
                id="esp-desc"
                label="Descrição"
                span="c6"
                extra={
                  <>
                    {descricao.selo ? (
                      <span
                        className={`pn-badge${descricao.selo === 'recusada' ? ' is-live' : ''}`}
                      >
                        {descricao.selo === 'recusada'
                          ? 'RECUSADA'
                          : 'EM REVISÃO'}
                      </span>
                    ) : null}
                    <span aria-hidden="true">
                      {p.description.length} de {DESCRICAO_MAX}
                    </span>
                  </>
                }
              >
                <textarea
                  id="esp-desc"
                  className="pn-inp"
                  value={p.description}
                  maxLength={DESCRICAO_MAX}
                  rows={3}
                  placeholder="Ex: mesa de sinuca no fundo e happy hour até as 20h nos dias de jogo"
                  aria-describedby="esp-desc-rev"
                  onChange={(e) => setPerfil({ description: e.target.value })}
                />
                <span
                  id="esp-desc-rev"
                  className={
                    descricao.selo === 'recusada' ? 'pn-ferr' : 'pn-hint'
                  }
                >
                  {descricao.texto}
                </span>
              </Campo>
            </div>
            {erros.perfil ? (
              <p className="pn-ferr" role="alert">
                {erros.perfil}
              </p>
            ) : null}
          </section>

          {/* ─── Horário ─── */}
          <section className="pn-card pn-sec2" aria-labelledby="esp-hor">
            <div className="pn-chd">
              <h3 id="esp-hor">
                <Calendar size={20} />
                Horário
              </h3>
            </div>
            <p className="pn-note">
              O torcedor vê se o bar está aberto antes de sair de casa. Fechar
              antes de abrir vira a meia-noite: 17:00 – 02:00 vai até as 2h.
            </p>
            <ul className="pn-hrs">
              {SEMANA.map(([dia, curto, nome]) => {
                const faixa = rascunho.horario[dia] ?? null
                const mudar = (nova: typeof faixa) =>
                  setRascunho((r) => ({
                    ...r,
                    horario: r.horario.map((d, i) => (i === dia ? nova : d))
                  }))
                return (
                  <li key={dia} className={faixa ? undefined : 'is-off'}>
                    <span className="pn-hr-d" title={nome}>
                      {curto}
                    </span>
                    {faixa ? (
                      <span className="pn-hr-t">
                        <input
                          type="time"
                          className="pn-inp"
                          value={faixa.opens}
                          aria-label={`${nome} abre`}
                          onChange={(e) =>
                            mudar({ ...faixa, opens: e.target.value })
                          }
                        />
                        –
                        <input
                          type="time"
                          className="pn-inp"
                          value={faixa.closes}
                          aria-label={`${nome} fecha`}
                          onChange={(e) =>
                            mudar({ ...faixa, closes: e.target.value })
                          }
                        />
                      </span>
                    ) : (
                      <span className="pn-hr-t">Fechado</span>
                    )}
                    <Interruptor
                      ligado={Boolean(faixa)}
                      onChange={(ligado) =>
                        // Religado, volta à faixa do dia anterior aberto.
                        mudar(
                          ligado
                            ? (rascunho.horario.find(Boolean) ?? DIA_PADRAO)
                            : null
                        )
                      }
                      rotulo={`Aberto ${nome.toLowerCase()}`}
                    />
                  </li>
                )
              })}
            </ul>
            {horarioErro || erros.horario ? (
              <p className="pn-ferr" role="alert">
                {horarioErro ?? erros.horario}
              </p>
            ) : null}
          </section>

          {/* ─── Características ─── */}
          <section
            className="pn-card pn-sec2 pn-cg"
            aria-labelledby="esp-car-t"
          >
            <div className="pn-chd">
              <h3 id="esp-car-t">
                <Tv size={20} />
                Características
              </h3>
              <small>o torcedor usa para filtrar</small>
            </div>
            <div className="pn-sw pn-sw-0">
              <label htmlFor="esp-car">Quantas telas?</label>
              <span className="pn-step">
                <button
                  type="button"
                  aria-label="Uma tela a menos"
                  disabled={(p.screenCount ?? 0) <= 0}
                  onClick={() =>
                    setPerfil({ screenCount: (p.screenCount ?? 0) - 1 })
                  }
                >
                  −
                </button>
                <input
                  id="esp-car"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_SCREEN_COUNT}
                  value={p.screenCount ?? ''}
                  placeholder="—"
                  // O número vai como foi digitado: quem diz o que corrigir é a
                  // mensagem abaixo, e salvar barra com a mesma regra (WEB-280).
                  onChange={(e) =>
                    setPerfil({
                      screenCount:
                        e.target.value === '' ? null : Number(e.target.value)
                    })
                  }
                  aria-invalid={telasErro ? true : undefined}
                  aria-describedby={telasErro ? 'esp-car-err' : undefined}
                />
                <button
                  type="button"
                  aria-label="Uma tela a mais"
                  disabled={(p.screenCount ?? 0) >= MAX_SCREEN_COUNT}
                  onClick={() =>
                    setPerfil({ screenCount: (p.screenCount ?? 0) + 1 })
                  }
                >
                  +
                </button>
              </span>
            </div>
            {telasErro ? (
              <p id="esp-car-err" className="pn-ferr" role="alert">
                {telasErro}
              </p>
            ) : null}
            {AMENITY_GROUPS.map((group) => (
              <fieldset key={group.key} className="pn-cgf">
                <legend>{group.label}</legend>
                <div className="pn-tchips">
                  {ITENS.filter((a) => a.group === group.key).map((a) => {
                    const on = p.amenities.includes(a.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="pn-tchip"
                        aria-pressed={on}
                        onClick={() =>
                          setPerfil({
                            amenities: on
                              ? p.amenities.filter((id) => id !== a.id)
                              : [...p.amenities, a.id]
                          })
                        }
                      >
                        {on ? <Check size={15} /> : null}
                        {a.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <p className="pn-note">
              Você declara que seu bar oferece o que marcar aqui. A Onside não
              verifica essas informações: elas aparecem no seu perfil como
              declaradas por você.
            </p>
          </section>

          {/* ─── Times da casa (WEB-433) ─── */}
          <TimesDaCasa />

          {/* ─── Oferta da casa (Elite) ─── */}
          <section className="pn-card pn-sec2" aria-labelledby="esp-of">
            <div className="pn-chd">
              <h3 id="esp-of">
                <Beer size={20} />
                Oferta da casa{' '}
                <span className="pn-elite" aria-hidden="true">
                  ELITE
                </span>
              </h3>
              {eliteOk ? (
                <small aria-hidden="true" className={of.erro ? 'is-over' : ''}>
                  {of.tamanho} de {HOUSE_OFFER_MAX_LENGTH}
                </small>
              ) : null}
            </div>
            <p className="pn-note">
              O que você oferece a quem chega pela Onside. Quem marca “Vou
              assistir aqui” ganha ao mostrar o código no balcão. A promessa é
              sua com o cliente: a Onside não define nem confere o conteúdo.
            </p>
            {eliteOk ? (
              <>
                {of.valor ? (
                  <div className="pn-offerprev">
                    <span className="pn-ib">
                      <Beer size={22} />
                    </span>
                    <span>
                      <small>PRÉVIA · O QUE O TORCEDOR VÊ</small>
                      <b>{of.valor}</b>
                    </span>
                  </div>
                ) : null}
                <label className="pn-fl" htmlFor="esp-oferta">
                  <span className="pn-fl-l">A oferta</span>
                  <textarea
                    id="esp-oferta"
                    className="pn-inp"
                    rows={3}
                    value={rascunho.oferta}
                    aria-invalid={of.erro ? true : undefined}
                    aria-describedby="esp-oferta-dica"
                    onChange={(e) =>
                      setRascunho((r) => ({ ...r, oferta: e.target.value }))
                    }
                  />
                </label>
                <p id="esp-oferta-dica" className="pn-hint">
                  Deixe em branco para não exibir oferta. Quem já marcou que vai
                  mantém o texto que valia quando marcou.
                </p>
                <div className="pn-sugg">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="pn-tchip"
                      onClick={() => setRascunho((r) => ({ ...r, oferta: s }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {of.erro || erros.oferta ? (
                  <p className="pn-ferr" role="alert">
                    {of.erro ?? erros.oferta}
                  </p>
                ) : null}
                <ComoConfere
                  later={
                    codigo.isPending
                      ? codigo.variables.later
                      : bar.confirmsCodesLater
                  }
                  offer={bar.houseOffer}
                  saving={codigo.isPending}
                  error={
                    codigo.error
                      ? getUserFacingMessage(
                          codigo.error,
                          'Não foi possível salvar. Tente novamente.'
                        )
                      : null
                  }
                  onChange={(later) => codigo.mutate({ later })}
                />
              </>
            ) : (
              <Bloqueio
                plano={plano}
                tier="elite"
                guardado={
                  bar.houseOffer
                    ? `Sua oferta continua guardada — “${bar.houseOffer}” — mas não aparece no perfil enquanto o plano Elite não estiver ativo.`
                    : 'Com o Elite, você escreve o que oferece a quem chega pela Onside e o texto aparece no perfil do bar.'
                }
              />
            )}
          </section>

          {/* ─── Cardápio e preço (Pro) ─── */}
          <section className="pn-card pn-sec2" aria-labelledby="esp-cdp">
            <div className="pn-chd">
              <h3 id="esp-cdp">
                <Doc size={20} />
                Cardápio e preço médio{' '}
                <span className="pn-elite" aria-hidden="true">
                  PRO
                </span>
              </h3>
            </div>
            {proOk ? (
              <div className="pn-form2">
                <Campo id="esp-menu" label="Link do cardápio" span="c4">
                  <input
                    id="esp-menu"
                    className="pn-inp"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://"
                    value={rascunho.cardapio.url}
                    aria-invalid={tentou && cd.erroUrl ? true : undefined}
                    onChange={(e) =>
                      setRascunho((r) => ({
                        ...r,
                        cardapio: { ...r.cardapio, url: e.target.value }
                      }))
                    }
                  />
                  {tentou && cd.erroUrl ? (
                    <span className="pn-ferr" role="alert">
                      {cd.erroUrl}
                    </span>
                  ) : null}
                </Campo>
                <Campo
                  id="esp-gasto"
                  label="Gasto médio por pessoa (R$)"
                  span="c2"
                >
                  <input
                    id="esp-gasto"
                    className="pn-inp"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={rascunho.cardapio.gasto}
                    aria-invalid={tentou && cd.erroGasto ? true : undefined}
                    onChange={(e) =>
                      setRascunho((r) => ({
                        ...r,
                        cardapio: { ...r.cardapio, gasto: e.target.value }
                      }))
                    }
                  />
                  {tentou && cd.erroGasto ? (
                    <span className="pn-ferr" role="alert">
                      {cd.erroGasto}
                    </span>
                  ) : null}
                </Campo>
                <p className="pn-c6 pn-hint">
                  Site, PDF ou perfil em rede social, e a sua estimativa do que
                  uma pessoa gasta com comida e bebida, sem taxa de serviço.
                  Aparecem no perfil como informados pelo bar. Em branco, saem
                  do perfil.
                </p>
                {erros.cardapio ? (
                  <p className="pn-c6 pn-ferr" role="alert">
                    {erros.cardapio}
                  </p>
                ) : null}
              </div>
            ) : (
              <Bloqueio
                plano={plano}
                tier="pro"
                guardado={guardadoCardapio(bar)}
              />
            )}
          </section>

          <Avaliacoes />
        </div>

        <EspacoPrevia
          bar={bar}
          perfil={p}
          plano={
            plano.status === 'ready' && plano.standing === 'current'
              ? plano.plan
              : 'starter'
          }
          oferta={eliteOk ? of.valor : null}
          menu={proOk ? { url: cd.url ?? null, gasto: cd.gasto ?? null } : null}
          eventsState={eventsState}
        />
      </div>

      {algoSujo ? (
        <div className="pn-savebar" role="status">
          <span>
            {falhou && !salvando
              ? 'Algumas alterações não foram salvas. Confira os avisos.'
              : 'Alterações não salvas no seu espaço'}
          </span>
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            disabled={salvando}
            onClick={descartar}
          >
            Descartar
          </button>
          <button
            type="button"
            className="pn-btn pn-acid pn-sm"
            disabled={salvando}
            onClick={() => void salvar()}
          >
            {salvando
              ? 'Salvando…'
              : falhou
                ? 'Tentar de novo'
                : 'Salvar alterações'}
          </button>
        </div>
      ) : null}
    </>
  )
}

function guardadoCardapio(bar: AdminBar) {
  const guardados = [
    bar.menuUrl ? `o link do cardápio (${menuUrlHost(bar.menuUrl)})` : null,
    bar.averageSpendCents
      ? `o preço médio de ${formatAverageSpend(bar.averageSpendCents)}`
      : null
  ].filter(Boolean)
  return guardados.length === 2
    ? `Continuam guardados ${guardados.join(' e ')}, mas não aparecem no perfil enquanto o plano Pro ou Elite não estiver ativo. Ao voltar para um deles, reaparecem sem precisar preencher de novo.`
    : guardados.length === 1
      ? `Continua guardado ${guardados[0]}, mas não aparece no perfil enquanto o plano Pro ou Elite não estiver ativo. Ao voltar para um deles, reaparece sem precisar preencher de novo.`
      : 'Com o Pro ou o Elite, você informa o link do cardápio e o preço médio por pessoa, e os dois aparecem no perfil do bar.'
}

function Campo({
  id,
  label,
  span,
  auto,
  extra,
  children
}: {
  id: string
  label: string
  span: 'c2' | 'c3' | 'c4' | 'c6'
  /** Preenchido pelo CEP; editado à mão, perde a marca. */
  auto?: boolean
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`pn-fl pn-${span}${auto ? ' is-auto' : ''}`}>
      <span className="pn-fl-h">
        <label htmlFor={id} className="pn-fl-l">
          {label}
        </label>
        {auto ? <em> · pelo CEP</em> : null}
        {extra}
      </span>
      {children}
    </div>
  )
}

/** Telefone só do Brasil (WEB-115): os dígitos, gravados com +55. */
function CampoTelefone({
  id,
  value,
  invalid,
  onChange
}: {
  id: string
  value: string
  invalid: boolean
  onChange: (phone: string) => void
}) {
  const [digits, setDigits] = useState(() =>
    value.replace(/^\+55/, '').replace(/\D/g, '').slice(0, 11)
  )
  return (
    <span className="pn-tel" data-invalid={invalid || undefined}>
      <span aria-hidden="true">+55</span>
      <input
        id={id}
        className="pn-inp"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(11) 9 1234-5678"
        value={formatPhone(digits, 'BR')}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '').slice(0, 11)
          setDigits(d)
          onChange(d ? `+55${d}` : '')
        }}
      />
    </span>
  )
}

/** Recurso pago sem o plano: o que falta e para onde ir. */
function Bloqueio({
  plano,
  tier,
  guardado
}: {
  plano: Plano
  tier: 'pro' | 'elite'
  guardado: string
}) {
  if (plano.status === 'loading')
    return (
      <p className="pn-note" role="status">
        Conferindo o seu plano…
      </p>
    )
  if (plano.status === 'error')
    return <p className="pn-note">Indisponível até conferirmos o seu plano.</p>
  // Plano que daria acesso, parado por pagamento: o caminho é regularizar,
  // não contratar de novo (WEB-141).
  if (alcanca(plano, tier) && isLapsed(plano.standing))
    return (
      <div className="pn-lock">
        <span>
          <b>{LAPSED_COPY[plano.standing].title(getPlan(plano.plan).name)}</b>
          Volta a funcionar assim que a assinatura for regularizada, sem
          precisar preencher nada de novo.
        </span>
        <Link to="/admin/billing" className="pn-btn pn-ink pn-sm">
          Regularizar assinatura
        </Link>
      </div>
    )
  return (
    <div className="pn-lock">
      <span>
        <b>
          {tier === 'elite'
            ? 'Disponível no plano Elite'
            : 'Disponível nos planos Pro e Elite'}
        </b>
        {guardado}
      </span>
      <Link
        to="/plan"
        search={{ origin: 'admin' }}
        className="pn-btn pn-ink pn-sm"
      >
        Ver planos
      </Link>
    </div>
  )
}

const OPCOES = [
  {
    later: false,
    title: 'Na hora',
    hint: 'Quem atende digita o código em Validar código.'
  },
  {
    later: true,
    title: 'Depois do jogo, pela comanda',
    hint: 'O garçom anota o código e você lança até 48 h depois. Para bar sem celular no balcão.'
  }
] as const

/**
 * Como o bar confere o código (WEB-412), junto da oferta: é o código que dá a
 * oferta. Trocar grava na hora, sem a barra de salvar.
 */
function ComoConfere({
  later,
  offer,
  saving,
  error,
  onChange
}: {
  later: boolean
  offer: string | null
  saving: boolean
  error: string | null
  onChange: (later: boolean) => void
}) {
  const recado = getTeamMessage(offer)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(recado)
      toast.success('Recado copiado. Cole no grupo da equipe.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie.')
    }
  }
  return (
    <div className="pn-confere">
      <p className="pn-fl-l" id="esp-confere">
        Como o código é conferido
      </p>
      <fieldset className="pn-radio" aria-labelledby="esp-confere">
        {OPCOES.map((o) => (
          <label key={o.title}>
            <input
              type="radio"
              name="esp-confere"
              className="sr-only"
              checked={later === o.later}
              disabled={saving}
              onChange={() => {
                onChange(o.later)
                toast.success(
                  o.later
                    ? 'Códigos lançados depois do jogo, pela comanda, em Quem vai.'
                    : 'Código conferido na hora, em Validar código.'
                )
              }}
            />
            <b>{o.title}</b>
            <span>{o.hint}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className="pn-ferr" role="alert">
          {error}
        </p>
      ) : null}
      {later ? (
        <div className="pn-recado">
          <p className="pn-fl-l">Recado para a equipe</p>
          <p className="pn-recado-t">{recado}</p>
          <div className="pn-acts">
            <button
              type="button"
              className="pn-btn pn-ink pn-sm"
              onClick={() => void copiar()}
            >
              Copiar recado
            </button>
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => imprimirRecado(recado)}
            >
              Imprimir meia folha
            </button>
            <Link to="/admin/quem-vai" hash="comanda" className="pn-go">
              Lançar códigos da comanda <Arrow size={14} />
            </Link>
          </div>
          <p className="pn-hint">
            A Onside não confere se o cliente estava no bar: o código anotado
            vale como visita, e o combinado com a equipe é seu.
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Meia folha para colar no balcão. Janela própria, montada com `textContent`
 * (a oferta é texto do dono), para imprimir só o recado.
 */
function imprimirRecado(recado: string) {
  const folha = window.open('', '_blank', 'width=640,height=820')
  if (!folha) {
    toast.error(
      'O navegador bloqueou a janela. Libere pop-ups e tente de novo.'
    )
    return
  }
  const doc = folha.document
  doc.title = 'Recado para a equipe — Onside'
  const style = doc.createElement('style')
  style.textContent =
    '@page{size:A5;margin:14mm}body{font-family:system-ui,sans-serif;color:#111}h1{font-size:28px;margin:0 0 16px}p{font-size:20px;line-height:1.4;margin:0 0 12px}small{font-size:12px;color:#555}'
  doc.head.append(style)
  const title = doc.createElement('h1')
  title.textContent = 'Código da Onside? Anote na comanda.'
  doc.body.append(title)
  for (const line of recado.split('\n')) {
    const p = doc.createElement('p')
    p.textContent = line
    doc.body.append(p)
  }
  const footer = doc.createElement('small')
  footer.textContent = 'onside.sh'
  doc.body.append(footer)
  folha.focus()
  folha.print()
}

/**
 * O que os torcedores responderam (o dono vê tudo desde a primeira resposta,
 * antes de a nota ficar pública). O número é a nota pública, só com as
 * verificadas (WEB-408); a lista traz também as outras, com o selo. Nome só
 * de quem quis aparecer, e comentário só depois da revisão da Onside
 * (WEB-451).
 */
const AVALIACOES_VISIVEIS = 5

function Avaliacoes() {
  const trpc = useTRPC()
  const q = useQuery({
    ...trpc.pub.getMyRatings.queryOptions(),
    meta: { errorToast: false }
  })
  const r = q.data
  const [todas, setTodas] = useState(false)
  return (
    <section className="pn-card pn-sec2" aria-labelledby="esp-av">
      <div className="pn-chd">
        <h3 id="esp-av">Voltariam pra ver jogo aqui?</h3>
        {r && r.total > 0 ? (
          <small>
            {r.positive} sim · {r.total - r.positive} não
          </small>
        ) : null}
      </div>
      {q.isError ? (
        <div className="pn-err" role="alert">
          <p>Não foi possível carregar as avaliações.</p>
          {isRetryableError(q.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void q.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : !r ? (
        <p className="pn-note" role="status">
          Carregando avaliações…
        </p>
      ) : r.recent.length === 0 ? (
        <p className="pn-note">
          Ninguém avaliou ainda. A pergunta aparece para quem marcou que ia, no
          dia seguinte ao jogo: quanto mais jogos na sua grade, mais gente
          responde.
        </p>
      ) : (
        <>
          {r.total > 0 ? (
            <p className="pn-av-n">
              <b className="pn-disp">{r.percentage}%</b> voltariam
              {r.stars != null ? (
                <span>· {r.stars.toLocaleString('pt-BR')} de 5 estrelas</span>
              ) : null}
            </p>
          ) : null}
          {r.isPublic ? null : (
            <p className="pn-note">
              Ainda não aparece para o torcedor. A nota fica pública a partir de{' '}
              {r.floor} avaliações verificadas —{' '}
              {r.floor - r.total === 1
                ? 'falta 1'
                : `faltam ${r.floor - r.total}`}
              .
            </p>
          )}
          {r.unverified > 0 ? (
            <p className="pn-note">
              {r.unverified === 1
                ? '1 avaliação não verificada fica'
                : `${r.unverified} avaliações não verificadas ficam`}{' '}
              fora da nota: só conta quem teve o código validado no balcão ou
              fez check-in no bar durante o jogo.
            </p>
          ) : null}
          <ListaDeAvaliacoes
            items={todas ? r.recent : r.recent.slice(0, AVALIACOES_VISIVEIS)}
          />
          {r.recent.length > AVALIACOES_VISIVEIS ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm pn-av-mais"
              aria-expanded={todas}
              onClick={() => setTodas((v) => !v)}
            >
              {todas ? 'Mostrar menos' : `Ver todas (${r.recent.length})`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
