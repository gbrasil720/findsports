import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import type { inferRouterOutputs } from '@trpc/server'
import { eventLimitReachedTitle } from '@/lib/event-limit'
import { getLapsedPaidPlan, isStarterSubscription } from '@/lib/lapsed-plan'
import { getTrialNotice, isContractedTrial } from '@/lib/plan-catalog'
import type { EventCreationPolicy } from './admin-model'

/*
 * Avisos do painel e card do plano (telas 1t/1u do design "Bar Web", Rodada
 * 3). Contas puras: qual aviso vale agora e o que o card do plano diz. As
 * regras são as do painel de antes (overview-tab, lapsed-plan, event-limit):
 * `bar.is_active`, plano em vigor (`standing`), limite do Starter
 * (`getMyEventCreationPolicy`), `past_due` e teste vencido.
 */

type Assinatura = inferRouterOutputs<AppRouter>['pub']['getMySubscription']

export type Situacao = {
  /** `bar.is_active`; `undefined` enquanto carrega. */
  ativo: boolean | undefined
  /** `undefined` enquanto carrega; `null` sem assinatura. */
  assinatura: Assinatura | undefined
  politica: EventCreationPolicy | undefined
}

export type Tela = 'hoje' | 'jogos'

export type AvisoTipo =
  | 'fora'
  | 'trial'
  | 'starter'
  | 'ultimo'
  | 'limite'
  | 'pendente'
  | 'encerrado'

export type Acao = {
  rotulo: string
  para: '/plan' | '/admin/billing'
  variante: 'ink' | 'acid'
}

export type Aviso = {
  tipo: AvisoTipo
  /** Cara do aviso (`notice` do design): perigo, atenção, informação, teste. */
  tom: 'perigo' | 'atencao' | 'info' | 'trial'
  titulo: string
  texto: string
  acao: Acao | null
  /** A medalha do aviso do teste. */
  plano?: SubscriptionPlan
}

/** Onde cada aviso aparece (1t): o do teste só em Hoje, o do Starter só em Jogos. */
const TELAS: Record<AvisoTipo, readonly Tela[]> = {
  fora: ['hoje', 'jogos'],
  trial: ['hoje'],
  starter: ['jogos'],
  ultimo: ['hoje', 'jogos'],
  limite: ['hoje', 'jogos'],
  pendente: ['hoje', 'jogos'],
  encerrado: ['hoje', 'jogos']
}

const diaPorExtenso = (data: string | Date) =>
  new Date(data).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo'
  })

/** "12 nov", "9 fev". */
export const diaCurto = (data: string | Date) =>
  new Date(data)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Sao_Paulo'
    })
    .replace('.', '')
    .replace(' de ', ' ')

const restantes = (p: { remaining: number; limit: number }) =>
  `${p.remaining} de ${p.limit} jogos restantes`

/** Teste grátis do cadastro em vigor: sem cartão e sem assinatura no Stripe. */
function emTeste(a: Assinatura | undefined): a is NonNullable<Assinatura> & {
  currentPeriodEnd: NonNullable<NonNullable<Assinatura>['currentPeriodEnd']>
} {
  return (
    a?.status === 'trialing' &&
    a.standing === 'current' &&
    a.currentPeriodEnd != null &&
    !isContractedTrial(a)
  )
}

/**
 * O aviso do momento, o de maior prioridade (1t): fora do ar, teste, Starter
 * (dentro do limite, último jogo, limite atingido), pagamento pendente e teste
 * encerrado. Pro ou Elite parado cai no limite do Starter, mas o caminho é
 * regularizar, não fazer upgrade (WEB-331): por isso o pendente vem antes do
 * limite. `null` enquanto carrega ou sem nada a dizer.
 */
export function avisoDoMomento(s: Situacao): Aviso | null {
  if (s.ativo === false) {
    return {
      tipo: 'fora',
      tom: 'perigo',
      titulo: 'Seu bar não está visível na plataforma',
      texto:
        'Nenhum plano ou período de teste ativo. Ative um plano para aparecer nas buscas e no mapa.',
      acao: { rotulo: 'Ver planos', para: '/plan', variante: 'ink' }
    }
  }
  const a = s.assinatura
  if (s.ativo === undefined || a === undefined) return null

  if (emTeste(a)) {
    const nome = PLAN_NAMES[a.plan]
    return {
      tipo: 'trial',
      tom: 'trial',
      titulo: `Trial gratuito do ${nome} até ${diaPorExtenso(a.currentPeriodEnd)}`,
      texto:
        'Sem cartão. Contratando antes do fim, a primeira cobrança só sai quando o teste acabar.',
      acao: { rotulo: `Garantir o ${nome}`, para: '/plan', variante: 'acid' },
      plano: a.plan
    }
  }

  const limitada = s.politica?.status === 'limited' ? s.politica : null
  if (!limitada) return null

  const parado = getLapsedPaidPlan(a)
  if (parado && a) {
    const encerrado = a.standing === 'trial_ended'
    return {
      tipo: encerrado ? 'encerrado' : 'pendente',
      tom: 'atencao',
      titulo: `${parado.label} — ${restantes(limitada)}`,
      texto: `${parado.cause} Os jogos ilimitados voltam assim que a assinatura for regularizada.`,
      acao: encerrado
        ? {
            rotulo: `Continuar no ${PLAN_NAMES[a.plan]}`,
            para: '/plan',
            variante: 'acid'
          }
        : {
            rotulo: 'Regularizar assinatura',
            para: '/admin/billing',
            variante: 'ink'
          }
    }
  }

  // Sem linha em `subscription` o Starter é só o default da coluna: o card
  // diz "Sem plano", e o aviso do Starter não vale (WEB-344).
  if (!isStarterSubscription(a)) return null
  const upgrade: Acao = {
    rotulo: 'Fazer upgrade',
    para: '/plan',
    variante: 'ink'
  }
  if (!limitada.canCreate) {
    return {
      tipo: 'limite',
      tom: 'perigo',
      titulo: eventLimitReachedTitle(limitada.periodEnd),
      texto: 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.',
      acao: upgrade
    }
  }
  if (limitada.remaining === 1) {
    return {
      tipo: 'ultimo',
      tom: 'atencao',
      titulo: 'Último jogo disponível no plano Starter',
      texto: 'Considere fazer upgrade para o Pro antes de atingir o limite.',
      acao: upgrade
    }
  }
  return {
    tipo: 'starter',
    tom: 'info',
    titulo: `Plano Starter — ${restantes(limitada)}`,
    texto: `Você usou ${limitada.used} jogo${limitada.used !== 1 ? 's' : ''} neste período de cobrança.`,
    acao: null
  }
}

/** O aviso da tela: o do momento, se ele aparece nela (no máximo um). */
export function avisoDaTela(s: Situacao, tela: Tela): Aviso | null {
  const aviso = avisoDoMomento(s)
  return aviso && TELAS[aviso.tipo].includes(tela) ? aviso : null
}

/* ─── Card do plano ─── */

export type CardPlanoEstado =
  | 'trial'
  | 'ativo'
  | 'starter'
  | 'limite'
  | 'pendente'
  | 'sem'

export type CardPlano = {
  estado: CardPlanoEstado
  /** `null`: "Sem plano", com o ícone do cartão no lugar da medalha. */
  plano: SubscriptionPlan | null
  nome: string
  selo: { texto: string; tipo: 'ink' | 'acid' | 'live' | 'muted' }
  linha: string | null
  /** Barra de dias do teste ou segmentos de jogos usados. */
  uso:
    | { tipo: 'dias'; usados: number; total: number; rotulo: string }
    | {
        tipo: 'jogos'
        usados: number
        total: number
        rotulo: string
        cheio: boolean
      }
    | null
  /** Botão; `null` no plano em dia, que só leva a Plano e cobrança. */
  acao: Acao | null
  kind?: 'hero' | 'live'
}

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * O card do plano (1t, seis estados), na coluna da direita de Hoje e no
 * limite de Jogos. `preco` é a mensalidade em reais (com o desconto de
 * fundador, quando houver); `null` quando ainda não se sabe.
 */
export function cardDoPlano(
  s: Situacao,
  preco: number | null,
  now = new Date()
): CardPlano | null {
  const a = s.assinatura
  if (a === undefined || s.ativo === undefined) return null
  const mes = preco === null ? null : `R$ ${preco}/mês`
  const com = (...partes: (string | null)[]) =>
    partes.filter(Boolean).join(' · ') || null

  const sem: CardPlano = {
    estado: 'sem',
    plano: null,
    nome: 'Sem plano',
    selo: { texto: 'Nenhuma assinatura ativa', tipo: 'muted' },
    linha: s.ativo ? null : 'O bar está fora das buscas e do mapa.',
    uso: null,
    acao: { rotulo: 'Ver planos', para: '/plan', variante: 'acid' },
    kind: 'live'
  }
  if (!s.ativo || !a?.standing || a.standing === 'ended') return sem

  const nome = PLAN_NAMES[a.plan]
  if (emTeste(a)) {
    const fim = new Date(a.currentPeriodEnd).getTime()
    const total = ONBOARDING_TRIAL.days
    const faltam = Math.max(0, Math.ceil((fim - now.getTime()) / DIA_MS))
    const usados = Math.min(total, Math.max(0, total - faltam))
    return {
      estado: 'trial',
      plano: a.plan,
      nome,
      selo: { texto: 'Trial gratuito', tipo: 'ink' },
      linha: `Grátis até ${diaCurto(a.currentPeriodEnd)} · sem cartão`,
      uso: {
        tipo: 'dias',
        usados,
        total,
        rotulo: `${usados} de ${total} dias usados`
      },
      acao: {
        rotulo: `Garantir o ${nome} · R$ 0 hoje`,
        para: '/plan',
        variante: 'acid'
      },
      kind: 'hero'
    }
  }

  const limitada = s.politica?.status === 'limited' ? s.politica : null
  const parado = getLapsedPaidPlan(a)
  if (parado) {
    const encerrado = a.standing === 'trial_ended'
    return {
      estado: 'pendente',
      plano: a.plan,
      nome,
      selo: { texto: parado.label, tipo: 'live' },
      linha:
        'Recursos do plano ficam suspensos até a assinatura ser regularizada.',
      uso: limitada
        ? {
            tipo: 'jogos',
            usados: limitada.used,
            total: limitada.limit,
            rotulo: `${limitada.used} de ${limitada.limit} jogos do Starter usados`,
            cheio: false
          }
        : null,
      acao: encerrado
        ? { rotulo: `Continuar no ${nome}`, para: '/plan', variante: 'acid' }
        : {
            rotulo: 'Regularizar assinatura',
            para: '/admin/billing',
            variante: 'ink'
          },
      kind: 'live'
    }
  }

  const renova = a.currentPeriodEnd
    ? a.cancelAt
      ? `termina ${diaCurto(a.cancelAt)}`
      : `renova ${diaCurto(a.currentPeriodEnd)}`
    : null

  if (a.plan === 'starter') {
    const noLimite = limitada !== null && !limitada.canCreate
    if (noLimite) {
      return {
        estado: 'limite',
        plano: 'starter',
        nome,
        selo: { texto: 'Limite atingido', tipo: 'live' },
        linha: com(
          mes,
          limitada.periodEnd
            ? `o limite volta em ${diaCurto(limitada.periodEnd)}`
            : 'limite dos últimos 30 dias'
        ),
        uso: {
          tipo: 'jogos',
          usados: limitada.used,
          total: limitada.limit,
          rotulo: `${limitada.used} de ${limitada.limit} jogos usados`,
          cheio: true
        },
        acao: {
          rotulo: 'Fazer upgrade para o Pro',
          para: '/plan',
          variante: 'acid'
        },
        kind: 'live'
      }
    }
    return {
      estado: 'starter',
      plano: 'starter',
      nome,
      selo: { texto: 'Ativo', tipo: 'acid' },
      linha: com(mes, renova),
      uso: limitada
        ? {
            tipo: 'jogos',
            usados: limitada.used,
            total: limitada.limit,
            rotulo: `${limitada.used} de ${limitada.limit} jogos usados neste ciclo`,
            cheio: false
          }
        : null,
      acao: { rotulo: 'Fazer upgrade', para: '/plan', variante: 'ink' }
    }
  }

  // Pro ou Elite em dia. Quem contratou durante o teste lê quando sai a
  // primeira cobrança (WEB-347).
  const contratado = isContractedTrial(a)
  return {
    estado: 'ativo',
    plano: a.plan,
    nome,
    selo: { texto: 'Ativo', tipo: 'acid' },
    linha: contratado
      ? getTrialNotice(a, now)
      : com(
          mes,
          a.currentPeriodEnd && !a.cancelAt
            ? `próxima cobrança ${diaCurto(a.currentPeriodEnd)}`
            : renova
        ),
    uso: null,
    acao: null
  }
}
