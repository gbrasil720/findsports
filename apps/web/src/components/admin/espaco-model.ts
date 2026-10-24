import { motivoTelasInvalido } from '@findsports_oficial/api/lib/amenities'
import {
  ehUf,
  motivoTelefoneInvalido,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'
import {
  isOpenNow,
  normalizeOpeningHours,
  type OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'
import {
  averageSpendInputValue,
  parseAverageSpendInput,
  parseMenuUrl
} from '@findsports_oficial/db/bar-menu'
import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import { getPlan, PLAN_TIER_ORDER } from '@/lib/plan-catalog'
import type { AdminBar, PlanState } from './admin-model'

/*
 * "Meu espaço" (telas 2c/2d): um formulário só, com rascunho local até
 * "Salvar alterações". As contas ficam aqui, puras, para a tela e os testes
 * lerem a mesma regra.
 */

/** Teto da descrição, o mesmo do `pub.updateMe`. */
export const DESCRICAO_MAX = 500

export type DiaRascunho = { open: boolean; opens: string; closes: string }

export type Rascunho = {
  name: string
  phone: string
  address: string
  neighborhood: string
  city: string
  uf: string
  description: string
  amenities: number[]
  screenCount: number | null
  /** Como digitado: a conferência é a de `bar-menu.ts`. */
  menuUrl: string
  averageSpend: string
  houseOffer: string
  /** `null`: o bar não mostra horário. Índice 0 é domingo. */
  hours: DiaRascunho[] | null
}

/** Uma faixa comum de bar, para quem começa a informar o horário. */
export const SEMANA_PADRAO: DiaRascunho[] = Array.from({ length: 7 }, () => ({
  open: true,
  opens: '17:00',
  closes: '00:00'
}))

export function rascunhoDoBar(bar: AdminBar): Rascunho {
  const hours = normalizeOpeningHours(bar.openingHours)
  return {
    name: bar.name ?? '',
    phone: bar.phone ?? '',
    address: bar.address ?? '',
    neighborhood: bar.neighborhood ?? '',
    city: bar.city ?? '',
    uf: bar.uf ?? '',
    description: bar.description ?? '',
    amenities: bar.amenities ?? [],
    screenCount: bar.screenCount ?? null,
    menuUrl: bar.menuUrl ?? '',
    averageSpend: averageSpendInputValue(bar.averageSpendCents),
    houseOffer: bar.houseOffer ?? '',
    hours: hours
      ? hours.map((day) =>
          day
            ? { open: true, ...day }
            : { open: false, opens: '17:00', closes: '00:00' }
        )
      : null
  }
}

export function horarioDoRascunho(
  hours: DiaRascunho[] | null
): OpeningHours | null {
  return normalizeOpeningHours(
    hours?.map((day) =>
      day.open ? { opens: day.opens, closes: day.closes } : null
    ) ?? null
  )
}

const mesmaLista = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

export type PerfilAlterado = {
  name?: string
  address?: string
  neighborhood?: string
  city?: string
  uf?: Uf
  phone?: string
  description?: string
  amenities?: number[]
  screenCount?: number | null
}

export type CardapioAlterado = {
  menuUrl?: string | null
  averageSpendCents?: number | null
}

/** O que cada campo tem de errado; só os que têm erro aparecem. */
export type Erros = Partial<
  Record<
    | 'name'
    | 'address'
    | 'neighborhood'
    | 'city'
    | 'phone'
    | 'description'
    | 'screenCount'
    | 'menuUrl'
    | 'averageSpend'
    | 'houseOffer'
    | 'hours',
    string
  >
>

export type Alteracoes = {
  /** `null`: nada mudou no perfil (`pub.updateMe`). */
  perfil: PerfilAlterado | null
  cardapio: CardapioAlterado | null
  /** `undefined`: a oferta não mudou; `null` a tira do perfil. */
  oferta: string | null | undefined
  horario: OpeningHours | null | undefined
  erros: Erros
}

/**
 * O que salvar, comparando o rascunho com o gravado. Cardápio e oferta só
 * entram com o plano que os libera (`podeCardapio`, `podeOferta`): o servidor
 * confere de novo e recusaria.
 */
export function alteracoes(
  bar: AdminBar,
  r: Rascunho,
  { podeCardapio, podeOferta }: { podeCardapio: boolean; podeOferta: boolean }
): Alteracoes {
  const base = rascunhoDoBar(bar)
  const erros: Erros = {}
  const perfil: PerfilAlterado = {}

  // Nome e endereço são obrigatórios: o servidor recusa curto demais.
  for (const [campo, min, msg] of [
    ['name', 2, 'Informe o nome do bar.'],
    ['address', 5, 'Informe a rua e o número.'],
    ['neighborhood', 2, 'Informe o bairro.'],
    ['city', 2, 'Informe a cidade.']
  ] as const) {
    const valor = r[campo].trim()
    if (valor === base[campo].trim()) continue
    if (valor.length < min) erros[campo] = msg
    else perfil[campo] = valor
  }
  // Sem UF escolhida vira "não mexer" (WEB-270).
  if (r.uf !== base.uf && ehUf(r.uf)) perfil.uf = r.uf
  if (r.phone !== base.phone) {
    const motivo = motivoTelefoneInvalido(r.phone, bar.phone)
    if (motivo) erros.phone = motivo
    // Vazio vai como está e limpa o campo (WEB-143).
    else perfil.phone = r.phone
  }
  if (r.description !== base.description) {
    if (r.description.length > DESCRICAO_MAX) {
      erros.description = `A descrição aceita até ${DESCRICAO_MAX} caracteres.`
    } else perfil.description = r.description
  }
  if (!mesmaLista(r.amenities, base.amenities)) perfil.amenities = r.amenities
  if (r.screenCount !== base.screenCount) {
    const motivo = motivoTelasInvalido(r.screenCount)
    if (motivo) erros.screenCount = motivo
    else perfil.screenCount = r.screenCount
  }

  let cardapio: CardapioAlterado | null = null
  if (podeCardapio) {
    const url = parseMenuUrl(r.menuUrl)
    const spend = parseAverageSpendInput(r.averageSpend)
    if (!url.ok && r.menuUrl !== base.menuUrl) erros.menuUrl = url.error
    if (!spend.ok && r.averageSpend !== base.averageSpend) {
      erros.averageSpend = spend.error
    }
    const mudou: CardapioAlterado = {}
    if (url.ok && url.url !== bar.menuUrl) mudou.menuUrl = url.url
    if (spend.ok && spend.cents !== bar.averageSpendCents) {
      mudou.averageSpendCents = spend.cents
    }
    if (Object.keys(mudou).length) cardapio = mudou
  }

  let oferta: string | null | undefined
  if (podeOferta) {
    const texto = normalizeHouseOffer(r.houseOffer)
    const tamanho = houseOfferLength(texto)
    if (tamanho > HOUSE_OFFER_MAX_LENGTH) {
      erros.houseOffer = `A oferta aceita até ${HOUSE_OFFER_MAX_LENGTH} caracteres. Tire ${tamanho - HOUSE_OFFER_MAX_LENGTH}.`
    } else if (texto !== (bar.houseOffer ?? null)) oferta = texto
  }

  let horario: OpeningHours | null | undefined
  if (r.hours?.some((day) => day.open && day.opens === day.closes)) {
    erros.hours = 'Abre e fecha no mesmo horário: ajuste o dia marcado.'
  } else {
    const proximo = horarioDoRascunho(r.hours)
    if (
      JSON.stringify(proximo) !==
      JSON.stringify(normalizeOpeningHours(bar.openingHours))
    ) {
      horario = proximo
    }
  }

  return {
    perfil: Object.keys(perfil).length ? perfil : null,
    cardapio,
    oferta,
    horario,
    erros
  }
}

export const temAlteracao = (a: Alteracoes) =>
  a.perfil !== null ||
  a.cardapio !== null ||
  a.oferta !== undefined ||
  a.horario !== undefined

/* ─── Perfil N de 6 ─── */

export type ItemPerfil = {
  key: 'bar' | 'jogo' | 'foto' | 'caracteristicas' | 'telefone' | 'whatsapp'
  label: string
  /** Uma linha sob o item, só enquanto falta. */
  dica: string
  done: boolean
}

/** Abaixo disso a página do bar ainda parece um cadastro pela metade. */
export const MIN_CARACTERISTICAS = 3

/**
 * O que o perfil precisa para converter visita em gente no bar, a partir do
 * que está gravado (não do rascunho).
 */
export function checklistDoPerfil(
  bar: AdminBar,
  temProximoJogo: boolean
): ItemPerfil[] {
  const temTelefone = (bar.phone?.replace(/\D/g, '').length ?? 0) >= 10
  return [
    {
      key: 'bar',
      label: 'Cadastrar o bar',
      dica: 'Nome e endereço completos, para a rota e a distância.',
      done:
        (bar.name?.length ?? 0) >= 2 &&
        (bar.address?.length ?? 0) >= 5 &&
        (bar.neighborhood?.length ?? 0) >= 2 &&
        (bar.city?.length ?? 0) >= 2
    },
    {
      key: 'jogo',
      label: 'Cadastrar o próximo jogo',
      dica: 'Coloca o bar na busca de quem procura a partida.',
      done: temProximoJogo
    },
    {
      key: 'foto',
      label: 'Foto de capa',
      dica: 'Ajuda o torcedor a reconhecer o seu espaço.',
      done: Boolean(bar.photoUrl)
    },
    {
      key: 'caracteristicas',
      label: 'Marcar as características',
      dica: `Pelo menos ${MIN_CARACTERISTICAS}: é o que o torcedor usa para filtrar a busca.`,
      done: (bar.amenities?.length ?? 0) >= MIN_CARACTERISTICAS
    },
    {
      key: 'telefone',
      label: 'Telefone do bar',
      dica: 'Para o torcedor ligar antes de sair de casa.',
      done: temTelefone
    },
    {
      key: 'whatsapp',
      label: 'Confirmar WhatsApp',
      dica: 'O botão de WhatsApp só aparece no perfil depois da confirmação.',
      done: temTelefone && Boolean(bar.phoneAcceptsWhatsapp)
    }
  ]
}

/* ─── Recurso pago ─── */

export type Tier = 'pro' | 'elite'

export type RecursoPago =
  | { status: 'carregando' }
  | { status: 'erro' }
  | { status: 'liberado' }
  | {
      status: 'bloqueado'
      titulo: string
      link: { to: '/admin/billing' | '/plan'; rotulo: string }
    }

/**
 * Plano mínimo de cada recurso pago do espaço (cardápio = Pro, oferta =
 * Elite). Só decide o que desenhar: o servidor confere antes de gravar. Plano
 * que daria acesso, parado por pagamento, manda regularizar em vez de
 * contratar de novo (WEB-141).
 */
export function recursoPago(plan: PlanState, tier: Tier): RecursoPago {
  if (plan.status === 'loading') return { status: 'carregando' }
  if (plan.status === 'error') return { status: 'erro' }
  const alcanca = PLAN_TIER_ORDER[plan.plan] >= PLAN_TIER_ORDER[tier]
  if (alcanca && plan.standing === 'current') return { status: 'liberado' }
  if (alcanca && isLapsed(plan.standing)) {
    return {
      status: 'bloqueado',
      titulo: LAPSED_COPY[plan.standing].title(getPlan(plan.plan).name),
      link: { to: '/admin/billing', rotulo: 'Regularizar assinatura' }
    }
  }
  return {
    status: 'bloqueado',
    titulo:
      tier === 'pro'
        ? 'Disponível nos planos Pro e Elite'
        : 'Disponível no plano Elite',
    link: { to: '/plan', rotulo: 'Ver planos' }
  }
}

/* ─── Prévia ─── */

const minutos = (hora: string) =>
  Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))

/** "00:00" vira "00h"; "02:30", "02h30". */
const horaCurta = (hora: string) =>
  hora.endsWith(':00') ? `${hora.slice(0, 2)}h` : hora.replace(':', 'h')

/**
 * "aberto até 00h" da página do bar no app, no relógio de Brasília. `null`
 * sem horário informado. Aberto depois da meia-noite é a faixa de ontem.
 */
export function abertoAte(
  hours: OpeningHours | null,
  now: Date
): string | null {
  const aberto = isOpenNow(hours, now)
  if (aberto === null || !hours) return null
  if (!aberto) return 'fechado agora'
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: BRASILIA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parte('weekday') ?? ''
  )
  const agora = Number(parte('hour')) * 60 + Number(parte('minute'))
  const hoje = hours[dia]
  const desdeHoje =
    hoje &&
    agora >= minutos(hoje.opens) &&
    (minutos(hoje.closes) <= minutos(hoje.opens) ||
      agora < minutos(hoje.closes))
  const faixa = desdeHoje ? hoje : hours[(dia + 6) % 7]
  return faixa ? `aberto até ${horaCurta(faixa.closes)}` : 'aberto agora'
}
