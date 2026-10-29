import {
  AMENITIES,
  AMENITY_GROUPS,
  HOUSE_OFFER_AMENITY_ID,
  MAX_SCREEN_COUNT
} from '@findsports_oficial/api/lib/amenities'
import { byCategoryThenPosition } from '@findsports_oficial/api/lib/bar-gallery'
import {
  mensagemEnderecoIndisponivel,
  mensagemEnderecoNaoEncontrado,
  UFS
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import { actionPhase } from '@findsports_oficial/api/lib/transient-error'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Badge,
  Botao,
  BotaoAcao,
  CabecalhoPagina,
  Campo,
  CampoTexto,
  Card,
  type CardKind,
  Chip,
  Icone,
  type IconeNome,
  Progresso,
  propsBotao,
  useFeito
} from '@/components/painel'
import { conciliarUfComCidade } from '@/components/uf-select'
import { getEventTemporalState } from '@/domain/events'
import { ehRascunho } from '@/domain/painel-jogos'
import { formatDayLabel } from '@/domain/pub-profile'
import { useCep } from '@/lib/cep'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { formatPhone } from '@/utils/format-phone'
import { useTRPC } from '@/utils/trpc'
import type { PlanState } from './admin-model'
import { useMyBar, useMyEvents, useMySubscription } from './admin-queries'
import { Estrelas, iniciais, nomeDeQuemAvaliou } from './avaliacao-pecas'
import { CodeConfirmationMode } from './code-confirmation-mode'
import { Erro, Horario, OfertaDaCasa } from './espaco-campos'
import { FotosDoBar, useEnvioDeFoto } from './espaco-fotos'
import {
  alteracoes,
  avisoDaDescricao,
  avisoDosJogos,
  checklistDoPerfil,
  DESCRICAO_MAX,
  type Erros,
  gastoDoRascunho,
  horarioDoRascunho,
  type ItemPerfil,
  NOME_E_LUGAR_MAX,
  type Rascunho,
  type RecursoPago,
  rascunhoDoBar,
  recursoPago,
  temAlteracao
} from './espaco-model'
import { EspacoPrevia } from './espaco-previa'

type Ratings = inferRouterOutputs<AppRouter>['pub']['getMyRatings']

/*
 * "Meu espaço" (telas 2c/2d): tudo o que o torcedor vê no app, num
 * formulário só. O rascunho vive aqui até "Salvar alterações"; a prévia ao
 * lado o mostra enquanto o dono edita. Foto e "como o código é conferido"
 * gravam na hora, como antes.
 */

/** Ids das seções, para o checklist levar até elas. */
const SECAO = {
  fotos: 'espaco-fotos',
  info: 'espaco-informacoes',
  caracteristicas: 'espaco-caracteristicas'
} as const

const irPara = (id: string, foco?: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  if (foco) document.getElementById(foco)?.focus({ preventScroll: true })
}

export function MeuEspaco() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = useMinuteNow()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const subscription = useMySubscription()
  const profile = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: bar?.id ?? '' }),
    enabled: Boolean(bar),
    meta: { errorToast: false }
  })
  const ratings = useQuery({
    ...trpc.pub.getMyRatings.queryOptions(),
    meta: { errorToast: false }
  })
  // "N vão" da prévia: a contagem por jogo, que só o Elite em dia recebe
  // (a mesma regra da oferta, `recursoPago(plan, 'elite')`).
  const presencas = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    enabled:
      subscription.data?.plan === 'elite' &&
      subscription.data.standing === 'current',
    meta: { errorToast: false }
  })

  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<{
    texto: string
    /** Só falha passageira: o botão vira "Tentar de novo". */
    passageira: boolean
  } | null>(null)
  const [salvo, marcarSalvo] = useFeito()

  const invalidateBar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.pubs.getById.pathKey() })
    ])

  const updateMe = useMutation(trpc.pub.updateMe.mutationOptions())
  const updateMenu = useMutation(trpc.pub.updateMenuInfo.mutationOptions())
  const updateOffer = useMutation(trpc.pub.updateHouseOffer.mutationOptions())
  const updateHours = useMutation(trpc.pub.updateOpeningHours.mutationOptions())
  const confirmWhatsApp = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => void invalidateBar(),
      onError: (err) =>
        toast.error(
          getUserFacingMessage(
            err,
            'Não foi possível confirmar o WhatsApp. Tente novamente.'
          )
        )
    })
  )
  const updateCodeConfirmation = useMutation(
    trpc.pub.updateCodeConfirmation.mutationOptions({
      onSuccess: invalidateBar
    })
  )
  // Fotos (WEB-462): o envio abre também pelo checklist ("foto de capa").
  const envio = useEnvioDeFoto()
  const fotos = useQuery({
    ...trpc.pub.photos.queryOptions(),
    meta: { errorToast: false }
  })
  // O CEP só preenche o rascunho, como no cadastro: não vai ao servidor.
  const cep = useCep((achado) =>
    setRascunho((prev) => {
      const atual = prev ?? (bar ? rascunhoDoBar(bar) : null)
      if (!atual) return prev
      return {
        ...atual,
        ...(achado.rua && { rua: achado.rua }),
        ...(achado.bairro && { neighborhood: achado.bairro }),
        city: achado.cidade,
        ...(achado.uf && { uf: achado.uf })
      }
    })
  )

  // O layout só monta a rota com o bar carregado.
  if (!bar) return null

  // Plano vigente, com status — não `bar.plan`. Dado em cache vence erro de
  // refetch em segundo plano.
  const plan: PlanState =
    subscription.data !== undefined
      ? {
          status: 'ready',
          plan: subscription.data?.plan ?? 'starter',
          standing: subscription.data?.standing ?? null
        }
      : subscription.isError
        ? { status: 'error' }
        : { status: 'loading' }
  const cardapio = recursoPago(plan, 'pro')
  const oferta = recursoPago(plan, 'elite')
  // A galeria é do Pro, como o cardápio. A prévia mostra o que o torcedor
  // vê: só as aprovadas, na ordem da página.
  const galeria = cardapio
  const fotosNoAr = byCategoryThenPosition(
    (fotos.data ?? []).filter((f) => f.status === 'approved')
  ).map((f) => f.url)

  const base = rascunhoDoBar(bar)
  const r = rascunho ?? base
  const mudar = (patch: Partial<Rascunho>) =>
    setRascunho((prev) => ({ ...(prev ?? base), ...patch }))

  const pendente = alteracoes(bar, r, {
    podeCardapio: cardapio.status === 'liberado',
    podeOferta: oferta.status === 'liberado'
  })
  // Campo mexido com erro também conta: é o "Salvar" que mostra o erro.
  const sujo = temAlteracao(pendente) || Object.keys(pendente.erros).length > 0
  const erros: Erros = tentou ? pendente.erros : {}

  // Rascunho (WEB-436) não está no app: nem no checklist nem na prévia.
  const eventList = (events.data ?? []).filter((e) => !ehRascunho(e))
  const temProximoJogo = eventList.some(
    (e) => getEventTemporalState(e.startsAt, e.endsAt, now) === 'upcoming'
  )
  const checklist = checklistDoPerfil(bar, temProximoJogo)

  const descartar = () => {
    setRascunho(null)
    setTentou(false)
    setErroSalvar(null)
  }

  const salvar = async () => {
    setTentou(true)
    if (Object.keys(pendente.erros).length > 0 || salvando) return
    setSalvando(true)
    setErroSalvar(null)
    const falhas: string[] = []
    let passageira = false
    const tentar = async (fn: () => Promise<unknown>, falha: string) => {
      try {
        await fn()
      } catch (err) {
        falhas.push(falha === '' ? String(err) : falha)
        // `pub.updateMe` joga a frase pronta e já anotou a causa.
        if (typeof err !== 'string') passageira ||= isRetryableError(err)
      }
    }
    if (pendente.perfil) {
      const perfil = pendente.perfil
      await tentar(async () => {
        try {
          await updateMe.mutateAsync(perfil)
        } catch (err) {
          const code = (err as { data?: { code?: string } }).data?.code
          passageira ||= isRetryableError(err)
          // Recusa do endereço (WEB-115) ou geocoding fora do ar (WEB-191).
          throw code === 'UNPROCESSABLE_CONTENT'
            ? mensagemEnderecoNaoEncontrado(
                perfil.city ?? bar.city ?? '',
                perfil.uf ?? bar.uf
              )
            : code === 'SERVICE_UNAVAILABLE'
              ? mensagemEnderecoIndisponivel
              : getUserFacingMessage(
                  err,
                  'Não foi possível salvar o perfil. Tente novamente.'
                )
        }
      }, '')
    }
    if (pendente.cardapio) {
      const changes = pendente.cardapio
      await tentar(
        () => updateMenu.mutateAsync(changes),
        'Não foi possível salvar o cardápio e o preço médio.'
      )
    }
    if (pendente.oferta !== undefined) {
      const houseOffer = pendente.oferta
      await tentar(
        () => updateOffer.mutateAsync({ houseOffer }),
        'Não foi possível salvar a oferta.'
      )
    }
    if (pendente.horario !== undefined) {
      const openingHours = pendente.horario
      await tentar(
        () => updateHours.mutateAsync({ openingHours }),
        'Não foi possível salvar o horário.'
      )
    }
    // Plano mudou com a tela aberta: reler a assinatura troca o card pelo
    // aviso. O que gravou deixa de aparecer como pendente.
    await Promise.all([
      invalidateBar(),
      queryClient.invalidateQueries({
        queryKey: trpc.pub.getMySubscription.queryKey()
      })
    ])
    setSalvando(false)
    if (falhas.length) {
      setErroSalvar({ texto: falhas.join(' '), passageira })
      return
    }
    descartar()
    marcarSalvo()
  }

  const acaoDoItem = (item: ItemPerfil): ReactNode => {
    const botao = (
      rotulo: string,
      onClick: () => void,
      variante: 'ink' | 'sec' = 'sec'
    ) => (
      <Botao variante={variante} altura={36} onClick={onClick}>
        {rotulo}
      </Botao>
    )
    switch (item.key) {
      case 'jogo':
        return botao(
          'Adicionar',
          () => void navigate({ to: '/admin/jogos', search: { novo: 1 } })
        )
      case 'foto':
        return botao('Adicionar', () => envio.escolher({ capa: true }))
      case 'caracteristicas':
        return botao('Marcar', () => irPara(SECAO.caracteristicas))
      case 'telefone':
        return botao('Adicionar', () => irPara(SECAO.info, 'espaco-telefone'))
      case 'whatsapp':
        return checklist.find((i) => i.key === 'telefone')?.done ? (
          <Botao
            variante="ink"
            altura={36}
            disabled={confirmWhatsApp.isPending}
            onClick={() =>
              confirmWhatsApp.mutate({
                phone: bar.phone ?? '',
                phoneAcceptsWhatsapp: true
              })
            }
          >
            {confirmWhatsApp.isPending ? 'Confirmando…' : 'Confirmar'}
          </Botao>
        ) : null
      default:
        return botao('Completar', () => irPara(SECAO.info))
    }
  }

  const feitos = checklist.filter((item) => item.done).length

  return (
    <>
      <CabecalhoPagina
        kicker="Tudo o que o torcedor vê no app"
        titulo="Meu espaço"
        acoes={
          <>
            <Botao
              disabled={!sujo || salvando}
              onClick={() => {
                descartar()
                cep.definir('')
              }}
            >
              Descartar
            </Botao>
            <BotaoAcao
              variante="acid"
              disabled={!sujo}
              fase={actionPhase(
                [updateMe, updateMenu, updateOffer, updateHours],
                {
                  busy: salvando,
                  done: salvo,
                  failed: erroSalvar?.passageira ?? false
                }
              )}
              rotulos={{
                idle: 'Salvar alterações',
                sending: 'Salvando…',
                done: 'Salvo'
              }}
              onClick={() => void salvar()}
            />
          </>
        }
      />
      {erroSalvar ? (
        <p
          role="alert"
          className="rounded-[7px] px-4 py-3 text-[14px] text-[var(--painel-live)] shadow-[inset_0_0_0_1.5px_rgb(201_43_12/45%)]"
        >
          {erroSalvar.texto}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-7 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Secao
            titulo={`Perfil ${feitos} de ${checklist.length}`}
            kind="hero"
            aside={
              feitos < checklist.length ? (
                <span className="text-[13px] text-[var(--painel-muted)]">
                  {checklist.length - feitos === 1
                    ? 'Falta 1'
                    : `Faltam ${checklist.length - feitos}`}
                </span>
              ) : (
                <Badge tipo="acid">Completo</Badge>
              )
            }
          >
            <Progresso
              valor={feitos}
              max={checklist.length}
              altura={8}
              rotulo="Perfil completo"
            />
            <ul className="mt-2.5">
              {checklist.map((item) => (
                <ItemChecklist
                  key={item.key}
                  item={item}
                  acao={item.done ? null : acaoDoItem(item)}
                />
              ))}
            </ul>
          </Secao>

          <Secao id={SECAO.fotos} titulo="Fotos" icone="photo">
            <FotosDoBar
              nome={bar.name}
              capaUrl={bar.photoUrl}
              recurso={galeria}
              envio={envio}
              onMudou={invalidateBar}
            />
          </Secao>

          <Secao id={SECAO.info} titulo="Informações" icone="pin">
            <Informacoes
              r={r}
              mudar={mudar}
              setRascunho={setRascunho}
              base={base}
              erros={erros}
              cep={cep}
              descricao={avisoDaDescricao(bar)}
              whatsapp={
                Boolean(bar.phoneAcceptsWhatsapp) &&
                r.phone === base.phone &&
                Boolean(base.phone)
              }
            />
          </Secao>

          <Secao titulo="Horário de funcionamento" icone="cal">
            <Horario
              hours={r.hours}
              erro={erros.hours}
              mudar={(hours) => mudar({ hours })}
              agora={now}
              aviso={avisoDosJogos(
                eventList,
                bar.openingHours,
                horarioDoRascunho(r.hours),
                new Date(now)
              )}
            />
          </Secao>

          <Secao
            id={SECAO.caracteristicas}
            titulo="Características"
            icone="tv"
            aside={
              <span className="text-[13px] text-[var(--painel-muted)]">
                O torcedor usa para filtrar a busca
              </span>
            }
          >
            <Caracteristicas r={r} mudar={mudar} erro={erros.screenCount} />
          </Secao>

          <div className="grid gap-5 lg:grid-cols-2">
            <Secao
              titulo="Cardápio e preço"
              selo={<Badge tipo="ink">Pro</Badge>}
            >
              <PorPlano
                recurso={cardapio}
                guardado={
                  bar.menuUrl || bar.averageSpendCents
                    ? 'O link do cardápio e o preço médio continuam guardados, mas não aparecem no perfil até o plano voltar.'
                    : 'Com o Pro ou o Elite, o link do cardápio e o preço médio aparecem no perfil do bar.'
                }
              >
                <div className="flex flex-col gap-3.5">
                  <Campo
                    rotulo="Link do cardápio"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://"
                    value={r.menuUrl}
                    onChange={(e) => mudar({ menuUrl: e.target.value })}
                    aria-invalid={erros.menuUrl ? true : undefined}
                    dica={<Erro texto={erros.menuUrl} />}
                  />
                  <Campo
                    rotulo="Preço médio por pessoa"
                    inputMode="decimal"
                    placeholder="0,00"
                    inicio={<span className="text-[var(--painel-fg)]">R$</span>}
                    value={r.averageSpend}
                    onChange={(e) => mudar({ averageSpend: e.target.value })}
                    aria-invalid={erros.averageSpend ? true : undefined}
                    dica={
                      erros.averageSpend ? (
                        <Erro texto={erros.averageSpend} />
                      ) : (
                        'Sua estimativa, sem taxa de serviço.'
                      )
                    }
                  />
                </div>
              </PorPlano>
            </Secao>

            <Secao
              titulo="Oferta da casa"
              selo={<Badge tipo="acid">Elite</Badge>}
            >
              <PorPlano
                recurso={oferta}
                guardado={
                  bar.houseOffer
                    ? `Sua oferta continua guardada — “${bar.houseOffer}” — mas não aparece no perfil enquanto o plano Elite não estiver ativo.`
                    : 'Com o Elite, você escreve o que oferece a quem chega pela Onside e o texto aparece no perfil do bar.'
                }
              >
                <OfertaDaCasa
                  valor={r.houseOffer}
                  erro={erros.houseOffer}
                  mudar={(houseOffer) => mudar({ houseOffer })}
                />
                <CodeConfirmationMode
                  offer={bar.houseOffer}
                  // Enquanto grava, a escolha nova já aparece marcada.
                  later={
                    updateCodeConfirmation.isPending
                      ? updateCodeConfirmation.variables.later
                      : bar.confirmsCodesLater
                  }
                  isSaving={updateCodeConfirmation.isPending}
                  saveError={
                    updateCodeConfirmation.error
                      ? getUserFacingMessage(
                          updateCodeConfirmation.error,
                          'Não foi possível salvar. Tente novamente.'
                        )
                      : null
                  }
                  onChange={(later) => updateCodeConfirmation.mutate({ later })}
                />
              </PorPlano>
            </Secao>
          </div>

          <Avaliacoes
            state={
              ratings.data
                ? { status: 'ready', ratings: ratings.data }
                : ratings.isError
                  ? {
                      status: 'error',
                      retryable: isRetryableError(ratings.error),
                      retry: () => void ratings.refetch()
                    }
                  : { status: 'loading' }
            }
          />
        </div>

        <div className="min-[1100px]:sticky min-[1100px]:top-5">
          <EspacoPrevia
            rascunho={r}
            photoUrl={bar.photoUrl}
            galeria={galeria.status === 'liberado' ? fotosNoAr : []}
            elite={oferta.status === 'liberado'}
            events={events.data ? eventList : null}
            nota={profile.data?.rating ?? null}
            motivos={profile.data?.ratingReasons ?? null}
            comentarios={profile.data?.reviews ?? []}
            gastoCents={
              cardapio.status === 'liberado'
                ? gastoDoRascunho(r.averageSpend)
                : null
            }
            presencas={
              oferta.status === 'liberado' && presencas.data
                ? Object.fromEntries(
                    presencas.data.map((jogo) => [jogo.id, jogo.people.length])
                  )
                : null
            }
            local={
              profile.data?.latitude && profile.data.longitude
                ? {
                    lat: Number(profile.data.latitude),
                    lng: Number(profile.data.longitude)
                  }
                : null
            }
            now={new Date(now)}
          />
        </div>
      </div>
    </>
  )
}

/* ─── Peças da página ─── */

const PAD: CSSProperties = { padding: '20px 22px' }

function Secao({
  id,
  titulo,
  icone,
  selo,
  aside,
  kind,
  children
}: {
  id?: string
  titulo: string
  icone?: IconeNome
  selo?: ReactNode
  aside?: ReactNode
  kind?: CardKind
  children: ReactNode
}) {
  const tituloId = useId()
  return (
    <Card
      id={id}
      kind={kind}
      role="region"
      aria-labelledby={tituloId}
      style={PAD}
      className="scroll-mt-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          {icone ? <Icone nome={icone} tamanho={20} /> : null}
          <h2 id={tituloId} className="font-bold text-[17px]">
            {titulo}
          </h2>
          {selo}
        </span>
        {aside}
      </div>
      {children}
    </Card>
  )
}

function ItemChecklist({ item, acao }: { item: ItemPerfil; acao: ReactNode }) {
  return (
    // Tela estreita: a ação desce para a linha de baixo em vez de espremer o
    // texto numa palavra por linha.
    <li className="flex flex-wrap items-center gap-3 border-[var(--painel-line)] border-t py-2.5">
      <span
        aria-hidden="true"
        className={`grid size-[26px] flex-none place-items-center rounded-[6px] ${
          item.done
            ? 'bg-[var(--painel-acid)]'
            : 'shadow-[inset_0_0_0_1.5px_var(--painel-line2)]'
        }`}
      >
        {item.done ? (
          <Icone nome="check" tamanho={15} acento="var(--painel-ink)" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1 basis-32">
        <b
          className={`text-[14px] ${
            item.done
              ? 'text-[var(--painel-muted)] line-through decoration-[var(--painel-line2)]'
              : ''
          }`}
        >
          {item.label}
          <span className="sr-only">{item.done ? ' (feito)' : ' (falta)'}</span>
        </b>
        {item.done ? null : (
          <p className="text-[12.5px] text-[var(--painel-muted)]">
            {item.dica}
          </p>
        )}
      </div>
      {acao ? <div className="ml-auto">{acao}</div> : null}
    </li>
  )
}

const nacional = (phone: string) =>
  phone.replace(/^\+55/, '').replace(/\D/g, '').slice(0, 11)

function Informacoes({
  r,
  mudar,
  setRascunho,
  base,
  erros,
  cep,
  descricao,
  whatsapp
}: {
  descricao: ReturnType<typeof avisoDaDescricao>
  r: Rascunho
  mudar: (patch: Partial<Rascunho>) => void
  setRascunho: (fn: (prev: Rascunho | null) => Rascunho) => void
  base: Rascunho
  erros: Erros
  cep: ReturnType<typeof useCep>
  whatsapp: boolean
}) {
  return (
    <div className="grid grid-cols-6 gap-3.5">
      <Campo
        className="col-span-6 sm:col-span-3"
        rotulo="Nome do estabelecimento"
        maxLength={NOME_E_LUGAR_MAX}
        autoComplete="organization"
        value={r.name}
        onChange={(e) => mudar({ name: e.target.value })}
        aria-invalid={erros.name ? true : undefined}
        dica={<Erro texto={erros.name} />}
      />
      <Campo
        id="espaco-telefone"
        className="col-span-6 sm:col-span-3"
        rotulo="Telefone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(11) 9 1234-5678"
        value={formatPhone(nacional(r.phone))}
        onChange={(e) => {
          const digits = nacional(e.target.value)
          mudar({ phone: digits ? `+55${digits}` : '' })
        }}
        fim={whatsapp ? <Badge tipo="acid">✓ WhatsApp</Badge> : null}
        aria-invalid={erros.phone ? true : undefined}
        dica={<Erro texto={erros.phone} />}
      />
      <Campo
        className="col-span-6 sm:col-span-2"
        rotulo="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={cep.cep}
        onChange={(e) => void cep.mudar(e.target.value)}
        // No rótulo, não dentro da caixa como no 2c: com 1280 px de tela a
        // caixa tem duas colunas e o "Encontrado" cortava o CEP.
        aside={
          cep.status === 'achou'
            ? 'Encontrado'
            : cep.status === 'buscando'
              ? 'Buscando…'
              : undefined
        }
        dica={
          cep.status === 'nao'
            ? 'Não achamos esse CEP. Preencha o endereço.'
            : undefined
        }
      />
      <Campo
        className="col-span-4 sm:col-span-3"
        rotulo="Rua"
        autoComplete="address-line1"
        maxLength={200}
        value={r.rua}
        onChange={(e) => mudar({ rua: e.target.value })}
        aria-invalid={erros.rua ? true : undefined}
        dica={<Erro texto={erros.rua} />}
      />
      <Campo
        className="col-span-2 sm:col-span-1"
        rotulo="Número"
        autoComplete="address-line2"
        maxLength={20}
        value={r.numero}
        onChange={(e) => mudar({ numero: e.target.value })}
        aria-invalid={erros.numero ? true : undefined}
        dica={<Erro texto={erros.numero} />}
      />
      <Campo
        className="col-span-6 sm:col-span-3"
        rotulo="Bairro"
        maxLength={NOME_E_LUGAR_MAX}
        autoComplete="address-level3"
        value={r.neighborhood}
        onChange={(e) => mudar({ neighborhood: e.target.value })}
        aria-invalid={erros.neighborhood ? true : undefined}
        dica={<Erro texto={erros.neighborhood} />}
      />
      <Campo
        className="col-span-4 sm:col-span-2"
        rotulo="Cidade"
        maxLength={NOME_E_LUGAR_MAX}
        autoComplete="address-level2"
        value={r.city}
        onChange={(e) => mudar({ city: e.target.value })}
        onBlur={() =>
          conciliarUfComCidade(r.city, (proxima) =>
            setRascunho((prev) => {
              const atual = prev ?? base
              return { ...atual, uf: proxima(atual.uf) }
            })
          )
        }
        aria-invalid={erros.city ? true : undefined}
        dica={<Erro texto={erros.city} />}
      />
      <div className="painel-campo col-span-2 sm:col-span-1">
        <div className="painel-campo-topo">
          <label htmlFor="espaco-uf">UF</label>
        </div>
        <div className="painel-campo-caixa">
          <select
            id="espaco-uf"
            autoComplete="address-level1"
            value={r.uf}
            onChange={(e) => mudar({ uf: e.target.value })}
          >
            <option value="">—</option>
            {Object.entries(UFS).map(([uf, nome]) => (
              <option key={uf} value={uf} title={nome}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
      <CampoTexto
        className="col-span-6"
        rotulo="Descrição"
        aside={`${r.description.length}/${DESCRICAO_MAX}`}
        altura={84}
        rows={2}
        placeholder="Ex.: mesa de sinuca no fundo e happy hour até as 20h nos dias de jogo"
        value={r.description}
        onChange={(e) => mudar({ description: e.target.value })}
        aria-invalid={erros.description ? true : undefined}
        dica={
          erros.description ? (
            <Erro texto={erros.description} />
          ) : (
            <span
              className={
                descricao.recusada ? 'text-[var(--painel-live)]' : undefined
              }
            >
              {descricao.texto}
            </span>
          )
        }
      />
    </div>
  )
}

/** "Com oferta da casa" não se marca: é o filtro da busca do Elite com oferta. */
const MARCAVEIS = AMENITIES.filter(({ id }) => id !== HOUSE_OFFER_AMENITY_ID)

function Caracteristicas({
  r,
  mudar,
  erro
}: {
  r: Rascunho
  mudar: (patch: Partial<Rascunho>) => void
  erro?: string
}) {
  const alternar = (id: number) =>
    mudar({
      amenities: r.amenities.includes(id)
        ? r.amenities.filter((item) => item !== id)
        : [...r.amenities, id]
    })
  const telas = r.screenCount
  return (
    <div className="flex flex-col gap-4">
      {AMENITY_GROUPS.map((grupo, index) => {
        const chips = (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 font-semibold text-[13px] text-[var(--painel-muted)]">
              {grupo.label}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {MARCAVEIS.filter((a) => a.group === grupo.key).map((a) => (
                <Chip
                  key={a.id}
                  ativo={r.amenities.includes(a.id)}
                  onClick={() => alternar(a.id)}
                >
                  {a.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        )
        if (index > 0) return <div key={grupo.key}>{chips}</div>
        return (
          <div
            key={grupo.key}
            className="flex flex-wrap items-end justify-between gap-5"
          >
            {chips}
            <div className="flex flex-col items-end gap-2">
              <span
                id="espaco-telas"
                className="font-semibold text-[13px] text-[var(--painel-muted)]"
              >
                Quantas telas?
              </span>
              <fieldset
                aria-labelledby="espaco-telas"
                className="flex items-center gap-2.5"
              >
                <button
                  type="button"
                  aria-label="Uma tela a menos"
                  disabled={!telas}
                  onClick={() => mudar({ screenCount: telas ? telas - 1 : 0 })}
                  className="grid size-8 place-items-center rounded-full font-bold shadow-[inset_0_0_0_1px_var(--painel-line2)] disabled:opacity-40"
                >
                  −
                </button>
                <output
                  aria-live="polite"
                  aria-label={`${telas ?? 0} telas`}
                  className="painel-disp min-w-5 text-center [--painel-disp-size:24px]"
                >
                  {telas ?? '–'}
                </output>
                <button
                  type="button"
                  aria-label="Uma tela a mais"
                  disabled={(telas ?? 0) >= MAX_SCREEN_COUNT}
                  onClick={() => mudar({ screenCount: (telas ?? 0) + 1 })}
                  className="grid size-8 place-items-center rounded-full bg-[var(--painel-acid)] font-bold text-[var(--painel-ink)] disabled:opacity-40"
                >
                  +
                </button>
              </fieldset>
              <Erro texto={erro} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Recurso pago: o conteúdo com o plano; senão, o aviso e o caminho. */
function PorPlano({
  recurso,
  guardado,
  children
}: {
  recurso: RecursoPago
  /** O que o aviso diz do que está guardado (ou do que o plano libera). */
  guardado: string
  children: ReactNode
}) {
  if (recurso.status === 'liberado') return <>{children}</>
  if (recurso.status === 'carregando') {
    return (
      <p role="status" className="text-[13px] text-[var(--painel-muted)]">
        Conferindo o seu plano…
      </p>
    )
  }
  if (recurso.status === 'erro') {
    return (
      <p className="text-[13px] text-[var(--painel-muted)]">
        Indisponível até conferirmos o seu plano.
      </p>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <div>
        <p className="font-bold text-[14px]">{recurso.titulo}</p>
        <p className="mt-1 text-[13px] text-[var(--painel-muted)] leading-snug [overflow-wrap:anywhere]">
          {recurso.link.to === '/admin/billing'
            ? 'Volta a funcionar assim que a assinatura for regularizada, sem precisar preencher nada de novo.'
            : guardado}
        </p>
      </div>
      <Link
        to={recurso.link.to}
        search={recurso.link.to === '/plan' ? { origin: 'admin' } : undefined}
        {...propsBotao({ variante: 'ink', altura: 38 })}
      >
        {recurso.link.rotulo}
      </Link>
    </div>
  )
}

type AvaliacoesState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void; retryable: boolean }
  | { status: 'ready'; ratings: Ratings }

/** Quantas respostas aparecem antes de "Ver todas". */
const RECENTES = 3

/**
 * O que os torcedores responderam (2c): estrelas, "voltaria", etiquetas e o
 * comentário (WEB-451). O dono vê desde a primeira resposta, antes de a nota
 * ficar pública. O nome só de quem escolheu se identificar, e o comentário
 * só depois da revisão da Onside. A nota conta só as verificadas (WEB-408);
 * as outras aparecem na lista com o selo "Não verificada".
 */
function Avaliacoes({ state }: { state: AvaliacoesState }) {
  const [todas, setTodas] = useState(false)
  const ratings = state.status === 'ready' ? state.ratings : null
  const lista = ratings
    ? todas
      ? ratings.recent
      : ratings.recent.slice(0, RECENTES)
    : []
  return (
    <Secao
      titulo="Avaliações"
      icone="star"
      aside={
        ratings && ratings.recent.length > RECENTES ? (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            className="font-bold text-[13.5px]"
          >
            {todas ? 'Ver menos' : 'Ver todas'}
          </button>
        ) : null
      }
    >
      {state.status === 'loading' ? (
        <p role="status" className="text-[13px] text-[var(--painel-muted)]">
          Carregando avaliações…
        </p>
      ) : state.status === 'error' ? (
        <div role="alert" className="text-[13px] text-[var(--painel-live)]">
          Não foi possível carregar as avaliações.{' '}
          {state.retryable ? (
            <button
              type="button"
              onClick={state.retry}
              className="font-bold underline underline-offset-2"
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : ratings && ratings.recent.length === 0 ? (
        <p className="text-[13.5px] text-[var(--painel-muted)] leading-relaxed">
          Ninguém avaliou ainda. A pergunta aparece para quem marcou que ia ao
          seu bar, assim que o jogo termina.
        </p>
      ) : ratings ? (
        <>
          {ratings.total === 0 ? (
            <p className="mb-1.5 text-[13.5px] text-[var(--painel-muted)] leading-relaxed">
              Nenhuma avaliação verificada ainda. Só entra na nota quem teve o
              código validado no balcão ou fez check-in no bar durante o jogo.
            </p>
          ) : (
            <div className="mb-1.5 flex items-center gap-6">
              <span className="painel-disp [--painel-disp-size:48px]">
                {ratings.stars !== null
                  ? ratings.stars.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1
                    })
                  : `${ratings.percentage}%`}
              </span>
              <div className="text-[13px] text-[var(--painel-muted)]">
                {ratings.stars !== null ? (
                  <Estrelas nota={ratings.stars} />
                ) : null}
                <p>
                  {ratings.total === 1
                    ? '1 avaliação'
                    : `${ratings.total} avaliações`}{' '}
                  ·{' '}
                  {ratings.stars !== null
                    ? `${ratings.percentage}% voltariam`
                    : 'voltariam pra ver jogo aqui'}
                </p>
                {ratings.isPublic ? null : (
                  <p>
                    Ainda não aparece para o torcedor: a nota fica pública a
                    partir de {ratings.floor} avaliações —{' '}
                    {ratings.floor - ratings.total === 1
                      ? 'falta 1'
                      : `faltam ${ratings.floor - ratings.total}`}
                    .
                  </p>
                )}
              </div>
            </div>
          )}
          <ul>
            {lista.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 border-[var(--painel-line)] border-t py-3 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-8 flex-none place-items-center rounded-[6px] font-bold text-[12px] ${item.wouldReturn ? 'bg-[var(--painel-acid)] text-[var(--painel-ink)]' : 'bg-[var(--painel-av)] text-[var(--painel-fg)]'}`}
                >
                  {item.name ? (
                    iniciais(item.name)
                  ) : (
                    <Icone
                      nome={item.wouldReturn ? 'check' : 'x'}
                      tamanho={15}
                      acento={
                        item.wouldReturn ? 'var(--painel-ink)' : 'currentColor'
                      }
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className="text-[14px] [overflow-wrap:anywhere]">
                      {nomeDeQuemAvaliou(item.name)}
                    </b>
                    {item.stars ? (
                      <Estrelas nota={item.stars} tamanho={13} />
                    ) : null}
                    {item.verified ? null : (
                      <Badge tipo="muted">Não verificada</Badge>
                    )}
                  </div>
                  {item.comment ? (
                    <p className="mt-0.5 text-[13.5px] text-[var(--painel-muted)] leading-[1.45] [overflow-wrap:anywhere]">
                      {item.comment}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[12.5px] text-[var(--painel-muted)]">
                    {item.wouldReturn ? 'Voltaria' : 'Não voltaria'} ·{' '}
                    {gameTitle(item)} ·{' '}
                    {formatDayLabel(new Date(item.startsAt))}
                  </p>
                  {item.reasons.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.reasons.map((reason) => (
                        <Badge key={reason} tipo="pub">
                          {reasonLabel(reason)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Secao>
  )
}
