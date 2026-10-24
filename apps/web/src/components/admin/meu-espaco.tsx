import {
  AMENITIES,
  AMENITY_GROUPS,
  HOUSE_OFFER_AMENITY_ID,
  MAX_SCREEN_COUNT
} from '@findsports_oficial/api/lib/amenities'
import {
  mensagemEnderecoIndisponivel,
  mensagemEnderecoNaoEncontrado,
  UFS
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Badge,
  Botao,
  CabecalhoPagina,
  Campo,
  CampoTexto,
  Card,
  type CardKind,
  Chip,
  Icone,
  type IconeNome,
  Progresso,
  propsBotao
} from '@/components/painel'
import { conciliarUfComCidade } from '@/components/uf-select'
import { getEventTemporalState } from '@/domain/events'
import { formatDayLabel } from '@/domain/pub-profile'
import { useCep } from '@/lib/cep'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { formatPhone } from '@/utils/format-phone'
import { useTRPC } from '@/utils/trpc'
import type { PlanState } from './admin-model'
import { useMyBar, useMyEvents, useMySubscription } from './admin-queries'
import { CodeConfirmationMode } from './code-confirmation-mode'
import {
  alteracoes,
  checklistDoPerfil,
  DESCRICAO_MAX,
  type DiaRascunho,
  type Erros,
  type ItemPerfil,
  type Rascunho,
  type RecursoPago,
  rascunhoDoBar,
  recursoPago,
  SEMANA_PADRAO,
  temAlteracao
} from './espaco-model'
import { EspacoPrevia } from './espaco-previa'
import { useFotoDoBar } from './foto-do-bar'

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

  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

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
  // A foto tem mutation própria: a falha aparece na foto (WEB-212), não no
  // formulário.
  const updatePhoto = useMutation(
    trpc.pub.updateMe.mutationOptions({ onSuccess: () => void invalidateBar() })
  )
  const updateCodeConfirmation = useMutation(
    trpc.pub.updateCodeConfirmation.mutationOptions({
      onSuccess: invalidateBar
    })
  )
  const foto = useFotoDoBar({
    onUploadSuccess: async (url) => {
      await updatePhoto.mutateAsync({ photoUrl: url })
    },
    onRemoveSuccess: invalidateBar
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

  const eventList = events.data ?? []
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
    const tentar = async (fn: () => Promise<unknown>, falha: string) => {
      try {
        await fn()
      } catch (err) {
        falhas.push(falha === '' ? String(err) : falha)
      }
    }
    if (pendente.perfil) {
      const perfil = pendente.perfil
      await tentar(async () => {
        try {
          await updateMe.mutateAsync(perfil)
        } catch (err) {
          const code = (err as { data?: { code?: string } }).data?.code
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
      setErroSalvar(falhas.join(' '))
      return
    }
    descartar()
    toast.success('Alterações salvas.')
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
        return botao('Adicionar', foto.escolher)
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
            <Botao
              variante="acid"
              disabled={!sujo || salvando}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </Botao>
          </>
        }
      />
      {erroSalvar ? (
        <p
          role="alert"
          className="rounded-[7px] px-4 py-3 text-[14px] text-[var(--painel-live)] shadow-[inset_0_0_0_1.5px_rgb(201_43_12/45%)]"
        >
          {erroSalvar}
        </p>
      ) : null}

      <div className="grid items-start gap-7 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
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
            <Fotos photoUrl={bar.photoUrl} nome={bar.name} foto={foto} />
          </Secao>

          <Secao id={SECAO.info} titulo="Informações" icone="pin">
            <Informacoes
              r={r}
              mudar={mudar}
              setRascunho={setRascunho}
              base={base}
              erros={erros}
              cep={cep}
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
            elite={oferta.status === 'liberado'}
            events={events.data ?? null}
            nota={profile.data?.rating?.percentage ?? null}
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

function Erro({ texto }: { texto?: string }) {
  return texto ? (
    <span role="alert" className="text-[var(--painel-live)]">
      {texto}
    </span>
  ) : null
}

function ItemChecklist({ item, acao }: { item: ItemPerfil; acao: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-[var(--painel-line)] border-t py-2.5">
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
      <div className="min-w-0 flex-1">
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
      {acao}
    </li>
  )
}

function Fotos({
  photoUrl,
  nome,
  foto
}: {
  photoUrl: string | null
  nome: string
  foto: ReturnType<typeof useFotoDoBar>
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
        <div className="relative h-[170px] overflow-hidden rounded-[6px] bg-[var(--painel-sub)]">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`Capa de ${nome}`}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[13px] text-[var(--painel-muted)]">
              Sem foto de capa
            </span>
          )}
          <Badge tipo="ink" className="absolute bottom-2.5 left-2.5">
            Capa
          </Badge>
          <button
            type="button"
            onClick={foto.escolher}
            disabled={foto.enviando}
            className="absolute right-2.5 bottom-2.5 rounded-[5px] bg-[rgb(250_248_243/92%)] px-2.5 py-[7px] font-bold text-[#12120f] text-[12.5px] disabled:opacity-60"
          >
            {foto.enviando ? 'Enviando…' : photoUrl ? 'Trocar' : 'Adicionar'}
          </button>
        </div>
        <div
          aria-hidden="true"
          className="hidden h-[170px] place-items-center rounded-[6px] bg-[repeating-linear-gradient(135deg,var(--painel-sub)_0_10px,transparent_10px_20px)] sm:grid"
        >
          <span className="painel-mono rounded-[3px] bg-[var(--painel-card)] px-2 py-1 font-normal text-[11px] text-[var(--painel-muted)]">
            foto do ambiente
          </span>
        </div>
        <div
          aria-disabled="true"
          className="flex h-[170px] flex-col items-center justify-center gap-1.5 rounded-[6px] border-[1.5px] border-[var(--painel-line2)] border-dashed text-[13px] text-[var(--painel-muted)]"
        >
          <Icone nome="photo" tamanho={24} acento="var(--painel-muted)" />
          Adicionar foto
          <span className="text-[11.5px]">Galeria · em breve no Pro</span>
        </div>
      </div>
      {photoUrl ? (
        <button
          type="button"
          onClick={() => void foto.remover()}
          disabled={foto.enviando}
          className="mt-2.5 text-[12.5px] text-[var(--painel-muted)] underline underline-offset-2 disabled:opacity-60"
        >
          Remover a capa
        </button>
      ) : null}
      {foto.erro ? (
        <p role="alert" className="mt-2 text-[13px] text-[var(--painel-live)]">
          {foto.erro}
        </p>
      ) : null}
      <input {...foto.inputProps} aria-label="Foto de capa" />
    </>
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
  whatsapp
}: {
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
        value={r.rua}
        onChange={(e) => mudar({ rua: e.target.value })}
        aria-invalid={erros.rua ? true : undefined}
        dica={<Erro texto={erros.rua} />}
      />
      <Campo
        className="col-span-2 sm:col-span-1"
        rotulo="Número"
        autoComplete="address-line2"
        value={r.numero}
        onChange={(e) => mudar({ numero: e.target.value })}
        aria-invalid={erros.numero ? true : undefined}
        dica={<Erro texto={erros.numero} />}
      />
      <Campo
        className="col-span-6 sm:col-span-3"
        rotulo="Bairro"
        autoComplete="address-level3"
        value={r.neighborhood}
        onChange={(e) => mudar({ neighborhood: e.target.value })}
        aria-invalid={erros.neighborhood ? true : undefined}
        dica={<Erro texto={erros.neighborhood} />}
      />
      <Campo
        className="col-span-4 sm:col-span-2"
        rotulo="Cidade"
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
        dica={<Erro texto={erros.description} />}
      />
    </div>
  )
}

/** Segunda primeiro; o índice é o do `getDay` (0 = domingo). */
const DIAS = [
  [1, 'Segunda'],
  [2, 'Terça'],
  [3, 'Quarta'],
  [4, 'Quinta'],
  [5, 'Sexta'],
  [6, 'Sábado'],
  [0, 'Domingo']
] as const

function Horario({
  hours,
  erro,
  mudar
}: {
  hours: DiaRascunho[] | null
  erro?: string
  mudar: (hours: DiaRascunho[] | null) => void
}) {
  if (!hours) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-[var(--painel-muted)]">
          A página do bar não mostra horário. Com ele, o torcedor vê “aberto
          agora” no horário de Brasília.
        </p>
        <Botao altura={38} onClick={() => mudar(SEMANA_PADRAO)}>
          Informar horário
        </Botao>
      </div>
    )
  }
  const atualizar = (dia: number, patch: Partial<DiaRascunho>) =>
    mudar(hours.map((d, i) => (i === dia ? { ...d, ...patch } : d)))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--painel-muted)]">
        Fecha depois da meia-noite? Informe a hora do dia seguinte, como 17:00
        às 02:00.
      </p>
      <ul>
        {DIAS.map(([dia, nome], index) => {
          const d = hours[dia]
          if (!d) return null
          const igual = d.open && d.opens === d.closes
          return (
            <li
              key={dia}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-2 ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
            >
              <label className="flex w-36 items-center gap-2.5 font-semibold text-[14px]">
                <input
                  type="checkbox"
                  checked={d.open}
                  onChange={(e) => atualizar(dia, { open: e.target.checked })}
                  className="size-4 accent-[var(--painel-acid)]"
                />
                {nome}
              </label>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <HoraCampo
                    rotulo={`${nome}, abre`}
                    valor={d.opens}
                    mudar={(opens) => atualizar(dia, { opens })}
                  />
                  <span aria-hidden="true">–</span>
                  <HoraCampo
                    rotulo={`${nome}, fecha`}
                    valor={d.closes}
                    invalido={igual}
                    mudar={(closes) => atualizar(dia, { closes })}
                  />
                </div>
              ) : (
                <span className="text-[13.5px] text-[var(--painel-muted)]">
                  Fechado
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <Erro texto={erro} />
      <div>
        <Botao altura={36} onClick={() => mudar(null)}>
          Tirar o horário da página
        </Botao>
      </div>
    </div>
  )
}

function HoraCampo({
  rotulo,
  valor,
  invalido,
  mudar
}: {
  rotulo: string
  valor: string
  invalido?: boolean
  mudar: (valor: string) => void
}) {
  return (
    <div className="painel-campo-caixa w-[140px] [--painel-campo-h:40px]">
      <input
        type="time"
        aria-label={rotulo}
        value={valor}
        aria-invalid={invalido || undefined}
        onChange={(e) => e.target.value && mudar(e.target.value)}
        className="painel-mono"
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

function OfertaDaCasa({
  valor,
  erro,
  mudar
}: {
  valor: string
  erro?: string
  mudar: (valor: string) => void
}) {
  const tamanho = houseOfferLength(normalizeHouseOffer(valor))
  const passou = tamanho > HOUSE_OFFER_MAX_LENGTH
  return (
    <div>
      <CampoTexto
        aria-label="Oferta da casa"
        altura={84}
        rows={2}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        aria-invalid={erro || passou ? true : undefined}
      />
      <div className="mt-1.5 flex justify-between gap-3 text-[12.5px] text-[var(--painel-muted)]">
        <span>Vale para quem validar o código no balcão.</span>
        <span
          className={`painel-mono text-[12px] ${passou ? 'text-[var(--painel-live)]' : ''}`}
        >
          {tamanho}/{HOUSE_OFFER_MAX_LENGTH}
        </span>
      </div>
      {erro ? (
        <p
          role="alert"
          className="mt-1.5 text-[12.5px] text-[var(--painel-live)]"
        >
          {erro}
        </p>
      ) : null}
      <p className="mt-3 text-[12.5px] text-[var(--painel-muted)] leading-[1.45]">
        A promessa é sua com o cliente: a Onside não define nem confere o
        conteúdo. Em branco, o perfil não mostra oferta.
      </p>
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
 * O que os torcedores responderam (a nota é "voltaria", não estrelas). O
 * dono vê desde a primeira resposta, antes de a nota ficar pública; não vê
 * quem respondeu: um nome ao lado de "não voltaria" viraria conflito
 * pessoal, não melhoria de serviço.
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
      ) : ratings && ratings.total === 0 ? (
        <p className="text-[13.5px] text-[var(--painel-muted)] leading-relaxed">
          Ninguém avaliou ainda. A pergunta aparece para quem marcou que ia ao
          seu bar, no dia seguinte ao jogo.
        </p>
      ) : ratings ? (
        <>
          <div className="mb-1.5 flex items-center gap-6">
            <span className="painel-disp [--painel-disp-size:48px]">
              {ratings.percentage}%
            </span>
            <div className="text-[13px] text-[var(--painel-muted)]">
              <p>
                {ratings.total === 1
                  ? '1 avaliação'
                  : `${ratings.total} avaliações`}{' '}
                · voltariam pra ver jogo aqui
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
          <ul>
            {lista.map((item) => (
              <li
                key={`${item.startsAt}-${item.createdAt}`}
                className="flex items-start gap-3 border-[var(--painel-line)] border-t py-3"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-8 flex-none place-items-center rounded-[6px] ${item.wouldReturn ? 'bg-[var(--painel-acid)]' : 'bg-[var(--painel-av)]'}`}
                >
                  <Icone
                    nome={item.wouldReturn ? 'check' : 'x'}
                    tamanho={15}
                    acento={
                      item.wouldReturn ? 'var(--painel-ink)' : 'currentColor'
                    }
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[14.5px]">
                    {item.wouldReturn ? 'Voltaria' : 'Não voltaria'}
                  </b>
                  <p className="text-[13px] text-[var(--painel-muted)]">
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
