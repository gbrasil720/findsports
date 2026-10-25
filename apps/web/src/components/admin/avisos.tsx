import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef } from 'react'
import {
  Badge,
  Card,
  ErroBloco,
  Icone,
  Medalha,
  Progresso,
  propsBotao
} from '@/components/painel'
import { analytics } from '@/lib/analytics'
import {
  founderCouponFromQuery,
  getPlan,
  planChargeForCurrentPlan,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import { useTRPC } from '@/utils/trpc'
import {
  useMyBar,
  useMyEventCreationPolicy,
  useMySubscription
} from './admin-queries'
import {
  type Acao,
  type Aviso,
  avisoDaTela,
  type CardPlano,
  cardDoPlano,
  type Situacao,
  type Tela
} from './avisos-model'

/** Bar, assinatura e limite de jogos: o que decide aviso e card do plano. */
export function useSituacao(): Situacao {
  const bar = useMyBar().data
  const assinatura = useMySubscription().data
  const politica = useMyEventCreationPolicy().data
  return { ativo: bar?.isActive, assinatura, politica }
}

function BotaoDaAcao({ acao, largo }: { acao: Acao; largo?: boolean }) {
  return (
    <Link
      to={acao.para}
      {...(acao.para === '/plan'
        ? { search: { origin: 'admin' as const } }
        : {})}
      {...propsBotao(
        { variante: acao.variante, altura: largo ? undefined : 40 },
        largo ? 'painel-plano-botao' : 'painel-aviso-botao'
      )}
    >
      {acao.rotulo}
    </Link>
  )
}

/**
 * O aviso do momento (1t/1u), logo abaixo do título de Hoje e de Jogos: no
 * máximo um, o de maior prioridade que a tela mostra.
 */
export function AvisoDoPainel({ tela }: { tela: Tela }) {
  const aviso = avisoDaTela(useSituacao(), tela)
  const contado = useRef(false)
  useEffect(() => {
    if (aviso?.tipo === 'limite' && !contado.current) {
      contado.current = true
      analytics.eventLimitReached()
    }
  }, [aviso?.tipo])
  return aviso ? <AvisoVisual aviso={aviso} /> : null
}

export function AvisoVisual({
  aviso,
  botao
}: {
  aviso: Aviso
  /** No lugar do link de `aviso.acao` (o portal de Plano e cobrança). */
  botao?: ReactNode
}) {
  return (
    <section
      className="painel-aviso"
      data-tom={aviso.tom}
      data-aviso={aviso.tipo}
      aria-label="Aviso do plano"
    >
      {aviso.tom === 'trial' && aviso.plano ? (
        <Medalha plano={aviso.plano} tamanho={32} />
      ) : aviso.tom === 'info' ? (
        <Icone nome="info" tamanho={22} base={0.3} />
      ) : (
        <Icone
          nome="alert"
          tamanho={22}
          base={0.3}
          className="painel-aviso-alerta"
        />
      )}
      <div className="painel-aviso-texto">
        <b>{aviso.titulo}</b>
        <span>{aviso.texto}</span>
      </div>
      {botao ?? (aviso.acao ? <BotaoDaAcao acao={aviso.acao} /> : null)}
    </section>
  )
}

/** Mensalidade do plano do bar, com o desconto de fundador quando houver. */
function usePrecoDoPlano(assinatura: Situacao['assinatura']): number | null {
  const trpc = useTRPC()
  const cupom = founderCouponFromQuery(
    useQuery({
      ...trpc.pub.getFounderCouponAvailable.queryOptions(),
      meta: { errorToast: false }
    })
  )
  if (!assinatura) return null
  return (
    planChargeForCurrentPlan(getPlan(assinatura.plan), assinatura, cupom)
      ?.chargeReais ?? null
  )
}

/** O card do plano (1t, seis estados): coluna da direita de Hoje e de Jogos. */
export function CardDoPlano() {
  const situacao = useSituacao()
  const assinatura = useMySubscription()
  const card = cardDoPlano(situacao, usePrecoDoPlano(situacao.assinatura))
  if (card) return <CardDoPlanoVisual card={card} />
  // O plano não chegou: o card diz isso em vez de sumir (WEB-460).
  return assinatura.isError ? (
    <Card className="painel-plano">
      <ErroBloco
        compacto
        titulo="Não foi possível carregar o seu plano."
        erro={assinatura.error}
        tentar={assinatura.refetch}
        tentando={assinatura.isFetching}
      />
    </Card>
  ) : null
}

export function CardDoPlanoVisual({ card }: { card: CardPlano }) {
  return (
    <Card
      kind={card.kind}
      className="painel-plano"
      data-estado={card.estado}
      role="region"
      aria-label="Seu plano"
    >
      <div className="painel-plano-topo">
        {card.plano ? (
          <Medalha plano={card.plano} tamanho={44} />
        ) : (
          <span className="painel-plano-sem">
            <Icone nome="card" tamanho={22} />
          </span>
        )}
        <div>
          <span className="painel-muted">Seu plano</span>
          <p
            className="painel-disp"
            style={{ ['--painel-disp-size' as string]: '28px' }}
          >
            {card.nome}
          </p>
        </div>
      </div>
      <div className="painel-plano-situacao">
        <Badge tipo={card.selo.tipo}>{card.selo.texto}</Badge>
        {card.linha ? (
          <span className="painel-plano-linha">{card.linha}</span>
        ) : null}
      </div>
      {card.uso?.tipo === 'dias' ? (
        <div className="painel-plano-uso">
          <Progresso
            valor={card.uso.usados}
            max={card.uso.total}
            rotulo={card.uso.rotulo}
          />
          <span>{card.uso.rotulo}</span>
        </div>
      ) : card.uso?.tipo === 'jogos' ? (
        <div
          className="painel-plano-uso"
          data-cheio={card.uso.cheio || undefined}
        >
          <div
            className="painel-plano-segs"
            role="img"
            aria-label={card.uso.rotulo}
          >
            {Array.from({ length: card.uso.total }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: segmentos fixos, sem identidade
                key={i}
                data-usado={i < (card.uso?.usados ?? 0) ? true : undefined}
              />
            ))}
          </div>
          <span>{card.uso.rotulo}</span>
        </div>
      ) : null}
      {card.acao ? (
        <BotaoDaAcao acao={card.acao} largo />
      ) : (
        <Link to="/admin/billing" className="painel-plano-link">
          Plano e cobrança →
        </Link>
      )}
    </Card>
  )
}

/** "No Pro" (1ab): o que o Starter no limite ganha subindo de plano. */
export function NoPro() {
  const trpc = useTRPC()
  const cupom = founderCouponFromQuery(
    useQuery({
      ...trpc.pub.getFounderCouponAvailable.queryOptions(),
      meta: { errorToast: false }
    })
  )
  const preco = planChargeForShowcase(getPlan('pro'), cupom)
  return (
    <Card className="painel-nopro" role="region" aria-label="No Pro">
      <b>No Pro</b>
      <ul>
        {[
          'Jogos ilimitados',
          'Destaque por time e liga',
          'Cardápio e preço médio',
          'Histórico de 12 meses'
        ].map((item) => (
          <li key={item}>
            <Icone nome="check" tamanho={16} acento="var(--painel-ink)" />
            {item}
          </li>
        ))}
      </ul>
      {preco ? (
        <span className="painel-muted">
          R$ {preco.chargeReais}/mês
          {preco.listReais != null ? ' com desconto de fundador' : ''}
        </span>
      ) : null}
    </Card>
  )
}
