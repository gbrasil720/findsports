import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState
} from 'react'
import { toast } from 'sonner'

import { Confirm } from '@/components/houdini/confirm'
import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/ia')({
  head: () => ({ meta: [{ title: 'IA — Houdini' }] }),
  component: IaPage
})

type Outputs = inferRouterOutputs<AppRouter>
type Overview = Outputs['houdini']['ia']['overview']
type Arm = Overview['chat']['arms'][number]
type Limits = Overview['status']['limits']
type Weights = Record<string, number>
type Spell = Outputs['appConfig']['list'][number]

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Mês' },
  { value: 'all', label: 'Tudo' }
] as const
type Period = (typeof PERIODS)[number]['value']

const CHAT_ARMS = [
  { key: 'a', label: 'A · Gemini 2.5 Flash' },
  { key: 'b', label: 'B · GPT-6 Luna' }
]
const RECOMMENDER_ARMS = [
  { key: 'a', label: 'A · só o algoritmo' },
  { key: 'b', label: 'B · Jev' },
  { key: 'c', label: 'C · Clef-flash' }
]

const LIMIT_FIELDS: Array<{
  key: keyof Limits
  label: string
  unit: 'usd' | 'n'
}> = [
  { key: 'monthlyBudgetUsd', label: 'Teto do mês, todo mundo', unit: 'usd' },
  { key: 'userMonthlyUsd', label: 'Gasto do mês por pessoa', unit: 'usd' },
  { key: 'userDailyCalls', label: 'Chamadas por pessoa no dia', unit: 'n' },
  { key: 'chatDailyMessages', label: 'Mensagens do chat no dia', unit: 'n' },
  { key: 'chatMonthlyMessages', label: 'Mensagens do chat no mês', unit: 'n' }
]

const TZ = BRASILIA_TIME_ZONE

/** "Como ler esta página", da prancha 10, com o que a tela de fato mede. */
const GLOSSARY: ReadonlyArray<readonly [string, string | null, string]> = [
  [
    'Teste A/B',
    null,
    'Duas versões da IA rodando ao mesmo tempo. Cada torcedor cai em uma, sorteado, e a gente compara qual funciona melhor.'
  ],
  [
    'Braço',
    null,
    'Cada versão dentro de um teste: o braço A usa um modelo, o B usa outro. O recomendador tem três braços (A, B e C).'
  ],
  [
    'Peso',
    null,
    'A fatia de torcedores que vai para cada braço, de 0 a 100. Os pesos de um teste sempre somam 100.'
  ],
  [
    'Conversão',
    null,
    'Quando, em até 24 h depois de uma resposta, o torcedor abre um bar citado, marca "Vou assistir" ou pede a rota. É o que mais importa no teste.'
  ],
  [
    'p.p.',
    'pontos percentuais',
    'Diferença entre duas porcentagens. De 11,2% para 13,3% são 2,1 p.p. a mais.'
  ],
  [
    'Sem vencedor',
    null,
    'A diferença ainda é pequena demais para descartar sorte. Só troque os pesos quando aparecer "diferença real".'
  ],
  [
    'Tempo de resposta',
    'p50 · p95',
    'p50 é o tempo normal: metade das respostas sai até ali. p95 é o pior caso comum: só 5 em cada 100 demoram mais que isso.'
  ],
  [
    'Desvio',
    null,
    'O modelo do braço falhou e a resposta saiu pelo modelo do outro braço.'
  ],
  [
    'Teto',
    null,
    'O máximo que a IA pode gastar no mês, somando todo mundo. Chegou nele, a IA para sozinha até o mês virar.'
  ],
  [
    'Gateway',
    null,
    'O serviço da Cloudflare por onde passam as chamadas à IA. Ele também tem um teto próprio, separado deste.'
  ],
  [
    'Token',
    null,
    'A unidade que os modelos cobram, mais ou menos um pedaço de palavra. Mais texto, mais tokens, mais custo.'
  ],
  [
    'Recomendador',
    null,
    'A parte da IA que sugere bares no app sem conversa. Tem o próprio teste A/B.'
  ]
]

function usd(value: number | null, digits = 2) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

/** Custo unitário: centavos de dólar viram frações, então mais casas. */
const unit = (value: number | null) =>
  usd(value, value !== null && value < 1 ? 4 : 2)

function pct(value: number | null, digits = 0) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'percent',
    maximumFractionDigits: digits
  })
}

const int = (value: number) => value.toLocaleString('pt-BR')

function ms(value: number | null) {
  if (value === null) return '—'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
}

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

function time(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
}

function changedBy(spell: Spell | undefined) {
  if (!spell?.updatedAt) return 'no padrão do código'
  return `mudou em ${formatDateTime(spell.updatedAt)}${
    spell.updatedByNome ? ` por ${spell.updatedByNome}` : ''
  }`
}

function IaPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<Period>('7d')
  const quiet = { meta: { errorToast: false } } as const

  const overview = useQuery({
    ...trpc.houdini.ia.overview.queryOptions({ period }),
    placeholderData: keepPreviousData,
    ...quiet
  })
  // A configuração vem do `appConfig.list`, sem cache: a tela mostra o que
  // está gravado e quem mudou, como os Feitiços.
  const config = useQuery({ ...trpc.appConfig.list.queryOptions(), ...quiet })
  const spell = (key: string) => config.data?.find((s) => s.key === key)

  const set = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: async (r) => {
        toast.success(`${r.key} lançado.`)
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.appConfig.list.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.houdini.ia.pathKey()
          })
        ])
      },
      onError: (error) =>
        toast.error(
          error.data?.code === 'BAD_REQUEST'
            ? `Valor recusado — ${error.message}`
            : getUserFacingMessage(error, 'Não foi possível mudar.')
        )
    })
  )
  // Sem prazo: o que muda aqui fica até alguém mudar de novo. Lançar por
  // tempo continua nos Feitiços.
  const cast =
    (key: 'ai.enabled' | 'ai.variant_weights' | 'ai.limits') =>
    (value: unknown) =>
      set.mutateAsync({ key, value, expiresInMinutes: null }).then(
        () => true,
        () => false
      )

  const o = overview.data
  const enabledSpell = spell('ai.enabled')
  const weightsSpell = spell('ai.variant_weights')
  const limitsSpell = spell('ai.limits')
  const weights = weightsSpell?.valor as
    | { chat: Weights; recommender: Weights }
    | undefined

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Máquina"
          title="IA"
          summary="Quanto os testes de IA gastam, quanto rendem e os limites. Só números de cada chamada: o texto das conversas não é guardado."
          actions={
            <fieldset className="hd-seg" aria-label="Período">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={period === p.value}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </fieldset>
          }
        >
          <a className="hd-help" href="#legenda">
            <Icon name="help" size={16} />
            Como ler esta página
          </a>
        </PageHead>

        {overview.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                overview.error,
                'Não foi possível ler os números da IA.'
              )}
            </p>
            <button
              type="button"
              className="hd-btn"
              style={{ alignSelf: 'flex-start', marginTop: 12 }}
              onClick={() => void overview.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        ) : !o ? (
          <div className="hd-skeleton" style={{ height: 420 }} />
        ) : (
          <>
            <section
              className="hd-grid"
              aria-label="Situação"
              style={
                {
                  '--hd-min': 'min(280px, 100%)',
                  alignItems: 'start'
                } as CSSProperties
              }
            >
              <SwitchCard
                enabled={
                  enabledSpell ? enabledSpell.valor === true : o.status.enabled
                }
                overridden={enabledSpell?.sobrescrito ?? false}
                gatewayId={o.status.gatewayId}
                changed={changedBy(enabledSpell)}
                busy={set.isPending || !config.data}
                onChange={cast('ai.enabled')}
              />
              <BudgetCard month={o.status.month} />
              <HitsCard hits={o.status.hits} limits={o.status.limits} />
            </section>

            <DailyChart daily={o.status.daily} />

            <Section
              id="ia-chat"
              title="Teste do chat"
              meta="A Gemini 2.5 Flash × B GPT-6 Luna"
            >
              <div className="hd-cols" style={{ gap: 24 }}>
                <div className="grow" style={{ gap: 0 }}>
                  <ArmsTable arms={o.chat.arms} unitLabel="Conversas" />
                </div>
                <div className="side" style={{ gap: 16 }}>
                  <ConversionCard
                    arms={o.chat.arms}
                    conversion={o.chat.conversion}
                    minimum={o.chat.minimum}
                  />
                  {weights ? (
                    <WeightsEditor
                      title="Pesos do chat"
                      arms={CHAT_ARMS}
                      value={weights.chat}
                      changed={changedBy(weightsSpell)}
                      busy={set.isPending}
                      onSave={(chat) =>
                        cast('ai.variant_weights')({ ...weights, chat })
                      }
                    />
                  ) : null}
                </div>
              </div>
            </Section>

            <Section
              id="ia-recomendador"
              title="Teste do recomendador"
              meta="A só o algoritmo × B Jev × C Clef-flash"
            >
              {o.recommender.live ? (
                <ArmsTable arms={o.recommender.arms} unitLabel="Pedidos" />
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <span
                    className="hd-pill"
                    data-tone="draft"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    ainda não ligado
                  </span>
                  <p style={{ margin: 0, color: 'var(--hd-body)' }}>
                    O recomendador (WEB-426) ainda não chama a IA, então não há
                    número para mostrar. Os pesos abaixo já valem no dia em que
                    ele ligar.
                  </p>
                  <ModelList
                    arms={o.recommender.arms}
                    labels={RECOMMENDER_ARMS}
                  />
                </div>
              )}
              {weights ? (
                <>
                  <hr className="hd-rule" />
                  <WeightsEditor
                    title="Pesos do recomendador"
                    arms={RECOMMENDER_ARMS}
                    value={weights.recommender}
                    changed={changedBy(weightsSpell)}
                    busy={set.isPending}
                    onSave={(recommender) =>
                      cast('ai.variant_weights')({ ...weights, recommender })
                    }
                  />
                </>
              ) : null}
            </Section>

            <Section id="ia-limites" title="Limites" meta="ai.limits">
              {limitsSpell ? (
                <LimitsEditor
                  value={limitsSpell.valor as Limits}
                  defaults={limitsSpell.padrao as Limits}
                  changed={changedBy(limitsSpell)}
                  busy={set.isPending}
                  onSave={cast('ai.limits')}
                />
              ) : (
                <div className="hd-skeleton" style={{ height: 160 }} />
              )}
            </Section>

            <Section id="ia-top" title="Quem mais gasta">
              <div
                className="hd-grid"
                style={{ '--hd-min': 'min(420px, 100%)' } as CSSProperties}
              >
                <TopTable
                  caption="Mais gasto no mês"
                  rows={o.top.month}
                  value={(r) => usd(r.costUsd)}
                  limit={(r) => pct(r.costUsd / o.top.limits.userMonthlyUsd)}
                  limitLabel={`Do teto de ${usd(o.top.limits.userMonthlyUsd)}`}
                />
                <TopTable
                  caption="Mais chamadas hoje"
                  rows={o.top.today}
                  value={(r) =>
                    `${int(r.calls)} de ${o.top.limits.userDailyCalls}`
                  }
                  limit={(r) =>
                    `${int(r.chat)} de ${o.top.limits.chatDailyMessages}`
                  }
                  limitLabel="Mensagens úteis"
                />
              </div>
            </Section>
          </>
        )}

        <Section id="ia-registro" title="Registro recente">
          <RunsLog />
        </Section>

        <Section
          id="legenda-h"
          sectionId="legenda"
          title="Como ler esta página"
          meta="os termos que aparecem aqui"
        >
          <dl className="hd-gloss">
            {GLOSSARY.map(([term, abbr, text]) => (
              <div key={term}>
                <dt>
                  {term}
                  {abbr ? <span className="hd-mono">{abbr}</span> : null}
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </HoudiniShell>
  )
}

/** Um cartão por bloco da página, com o título e o resumo ao lado. */
function Section({
  id,
  sectionId,
  title,
  meta,
  children
}: {
  id: string
  sectionId?: string
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <section
      id={sectionId}
      className="hd-card"
      aria-labelledby={id}
      style={{ gap: 16 }}
    >
      <div className="hd-card-hd">
        <h2 id={id} className="hd-h2">
          {title}
        </h2>
        {meta ? <span className="meta hd-mono">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** O número grande das pranchas, em Anton. */
const display = (size: number): CSSProperties => ({
  font: `400 ${size}px/1 var(--hd-display)`,
  textTransform: 'uppercase'
})

function SwitchCard({
  enabled,
  overridden,
  gatewayId,
  changed,
  busy,
  onChange
}: {
  enabled: boolean
  overridden: boolean
  gatewayId: string | null
  changed: string
  busy: boolean
  onChange: (value: boolean) => Promise<boolean>
}) {
  const [asking, setAsking] = useState(false)
  return (
    <article className="hd-card" style={{ gap: 14 }} aria-label="A IA">
      <div className="hd-card-hd">
        <b>A IA</b>
        <span className="meta hd-mono">
          ai.enabled · {overridden ? 'lançado' : 'no padrão'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            ...display(40),
            color: enabled ? 'var(--hd-fg)' : 'var(--hd-muted)'
          }}
        >
          {enabled ? 'Ligada' : 'Desligada'}
        </span>
        <button
          type="button"
          role="switch"
          className="hd-switch"
          aria-checked={enabled}
          aria-label="IA ligada"
          style={{ marginLeft: 'auto' }}
          disabled={busy || asking}
          onClick={() => setAsking(true)}
        />
      </div>
      <dl className="hd-dl">
        <div>
          <dt>Gateway</dt>
          <dd className="hd-mono">{gatewayId ?? 'nenhum (nada é chamado)'}</dd>
        </div>
      </dl>
      <span className="hd-mono hd-small">{changed}</span>
      {asking ? (
        <Confirm
          text={
            enabled
              ? 'Desligar a IA? O chat do app passa a dizer "indisponível" e a busca normal segue. Vale em até 1 minuto.'
              : 'Ligar a IA? Cada mensagem chama o modelo e gasta crédito, até o teto do mês.'
          }
          confirmLabel={enabled ? 'Desligar a IA' : 'Ligar a IA'}
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={() =>
            void onChange(!enabled).then((ok) => ok && setAsking(false))
          }
        />
      ) : null}
    </article>
  )
}

function BudgetCard({ month }: { month: Overview['status']['month'] }) {
  const over = month.projectionUsd > month.budgetUsd
  const fill = Math.min(1, month.share)
  return (
    <article
      className={`hd-card ${month.blocked ? 'is-live' : 'is-hero'}`}
      style={{ gap: 12 }}
      aria-label="Gasto do mês"
    >
      <div className="hd-card-hd">
        <b>Gasto do mês</b>
        <span className="meta">teto {usd(month.budgetUsd)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap'
        }}
      >
        <span style={{ ...display(46), color: 'var(--hd-kpi-hero)' }}>
          {usd(month.spentUsd)}
        </span>
        <span style={{ color: 'var(--hd-muted)' }}>
          {pct(month.share)} do teto
        </span>
      </div>
      <div
        role="img"
        aria-label={`${pct(month.share)} do teto mensal`}
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--hd-line2)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${fill * 100}%`,
            height: '100%',
            background: month.blocked ? 'var(--hd-live)' : 'var(--hd-mark)'
          }}
        />
      </div>
      <p className="hd-small" style={{ margin: 0 }}>
        No ritmo de agora,{' '}
        <b style={{ color: 'var(--hd-fg)' }}>{usd(month.projectionUsd)}</b> no
        fim do mês.
      </p>
      {month.blocked ? (
        <span
          className="hd-pill"
          data-tone="live"
          style={{ alignSelf: 'flex-start' }}
        >
          teto atingido: a IA está indisponível para todos
        </span>
      ) : over ? (
        <span
          className="hd-pill"
          data-tone="sand"
          style={{ alignSelf: 'flex-start' }}
        >
          a projeção passa do teto
        </span>
      ) : null}
    </article>
  )
}

function HitsCard({
  hits,
  limits
}: {
  hits: Overview['status']['hits']
  limits: Limits
}) {
  const rows = [
    { k: `${limits.chatDailyMessages} mensagens no dia`, v: hits.chatDay },
    { k: `${limits.chatMonthlyMessages} mensagens no mês`, v: hits.chatMonth },
    { k: `${limits.userDailyCalls} chamadas no dia`, v: hits.callsDay },
    { k: `${usd(limits.userMonthlyUsd)} no mês`, v: hits.costMonth }
  ]
  return (
    <article
      className="hd-card"
      style={{ gap: 12 }}
      aria-label="Pessoas que chegaram ao limite"
    >
      <div className="hd-card-hd">
        <b>Pessoas que chegaram ao limite</b>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '12px 16px'
        }}
      >
        {rows.map((row) => (
          <div key={row.k}>
            <span style={{ ...display(30), display: 'block' }}>
              {int(row.v)}
            </span>
            <span className="hd-small">{row.k}</span>
          </div>
        ))}
      </div>
      <span className="hd-small">
        No período, pelos limites de agora. Pedido barrado não é gravado: conta
        quem chegou, não quantas vezes bateu.
      </span>
    </article>
  )
}

function DailyChart({ daily }: { daily: Overview['status']['daily'] }) {
  const max = Math.max(...daily.map((d) => d.costUsd), 0)
  const total = daily.reduce((sum, d) => sum + d.costUsd, 0)
  const peak = daily.find((d) => d.costUsd === max)
  return (
    <section className="hd-card" aria-labelledby="ia-dia" style={{ gap: 16 }}>
      <div className="hd-card-hd">
        <h2 id="ia-dia" className="hd-h2">
          Gasto por dia
        </h2>
        <span className="meta hd-mono">
          {usd(total)} em {daily.length} {daily.length === 1 ? 'dia' : 'dias'}
          {max > 0 ? ` · maior ${usd(max)}` : ''}
        </span>
      </div>
      {max === 0 ? (
        <p className="hd-empty is-dashed">Nenhum gasto no período.</p>
      ) : (
        <DailyBars daily={daily} max={max} peak={peak} total={total} />
      )}
      <details>
        <summary className="hd-small" style={{ cursor: 'pointer' }}>
          Ver em tabela
        </summary>
        <div className="hd-table-wrap is-flat" style={{ marginTop: 10 }}>
          <table className="hd-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Gasto</th>
                <th>Chamadas</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <td className="hd-mono">{shortDay(d.day)}</td>
                  <td>{usd(d.costUsd)}</td>
                  <td>{int(d.runs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/** As barras do gasto por dia: o último dia em destaque, o maior com o valor. */
function DailyBars({
  daily,
  max,
  peak,
  total
}: {
  daily: Overview['status']['daily']
  max: number
  peak: Overview['status']['daily'][number] | undefined
  total: number
}) {
  const last = daily.at(-1)
  return (
    <>
      <div
        role="img"
        aria-label={`Gasto por dia: ${usd(total)} no período${
          peak && max > 0
            ? `, maior em ${shortDay(peak.day)} (${usd(max)})`
            : ''
        }.`}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: daily.length > 40 ? 2 : 6,
          height: 160,
          paddingTop: 18,
          borderBottom: '1px solid var(--hd-line2)'
        }}
      >
        {daily.map((d) => {
          const isLast = d === last
          const marked = max > 0 && (isLast || d === peak)
          return (
            <div
              key={d.day}
              title={`${shortDay(d.day)}: ${usd(d.costUsd)} · ${int(d.runs)} chamadas`}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4
              }}
            >
              {marked ? (
                <span
                  className="hd-mono"
                  style={{ fontSize: 10.5, color: 'var(--hd-muted)' }}
                >
                  {d.costUsd.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              ) : null}
              <span
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: 28,
                  height: max ? `${(d.costUsd / max) * 120}px` : 0,
                  minHeight: d.costUsd > 0 ? 2 : 0,
                  borderRadius: '4px 4px 2px 2px',
                  background: isLast ? 'var(--hd-mark)' : 'var(--hd-line2)'
                }}
              />
            </div>
          )
        })}
      </div>
      <div
        className="hd-mono hd-small"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <span>{daily[0] ? shortDay(daily[0].day) : ''}</span>
        <span>{last ? shortDay(last.day) : ''}</span>
      </div>
    </>
  )
}

const ARM_ROWS: Array<{ label: string; cell: (a: Arm) => string }> = [
  { label: 'Pessoas', cell: (a) => int(a.people) },
  { label: 'Mensagens', cell: (a) => int(a.messages) },
  {
    label: 'Respostas úteis',
    cell: (a) => `${int(a.useful)} · ${pct(a.usefulRate)}`
  },
  {
    label: 'Erros · demoras',
    cell: (a) => `${int(a.errors)} · ${int(a.timeouts)}`
  },
  {
    label: 'Desvio para o outro modelo',
    cell: (a) => `${int(a.deviated)} · ${pct(a.deviatedRate)}`
  },
  {
    label: 'Polegar ▲ · ▼',
    cell: (a) =>
      `${int(a.thumbsUp)} · ${int(a.thumbsDown)}${
        a.thumbsUpRate === null ? '' : ` (${pct(a.thumbsUpRate)} ▲)`
      }`
  },
  {
    label: 'Conversão (ação em 24 h)',
    cell: (a) =>
      `${int(a.conversions)} de ${int(a.conversations)} · ${pct(a.conversionRate, 1)}`
  },
  { label: 'Tempo p50 · p95', cell: (a) => `${ms(a.p50Ms)} · ${ms(a.p95Ms)}` },
  {
    label: 'Tokens entrada · saída',
    cell: (a) => `${int(a.tokensIn)} · ${int(a.tokensOut)}`
  },
  { label: 'Custo', cell: (a) => usd(a.costUsd) },
  { label: 'Custo por resposta útil', cell: (a) => unit(a.costPerUseful) },
  { label: 'Custo por conversão', cell: (a) => unit(a.costPerConversion) }
]

function ArmsTable({ arms, unitLabel }: { arms: Arm[]; unitLabel: string }) {
  return (
    <div className="hd-table-wrap is-flat">
      <table className="hd-table" style={{ minWidth: 120 + arms.length * 160 }}>
        <thead>
          <tr>
            <th scope="col">
              <span className="hd-sr">Métrica</span>
            </th>
            {arms.map((a) => (
              <th key={a.variant} scope="col" style={{ verticalAlign: 'top' }}>
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    color: 'var(--hd-fg)'
                  }}
                >
                  Braço {a.variant.toUpperCase()}
                  <span className="hd-sub">{a.model ?? 'sem modelo'}</span>
                  <span className="hd-sub">peso {a.weight}%</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { label: unitLabel, cell: (a: Arm) => int(a.conversations) },
            ...ARM_ROWS
          ].map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                style={{
                  font: '500 14px/1.3 var(--hd-sans)',
                  letterSpacing: 0,
                  textTransform: 'none',
                  color: 'var(--hd-fg)',
                  whiteSpace: 'normal',
                  minWidth: 160
                }}
              >
                {row.label}
              </th>
              {arms.map((a) => (
                <td
                  key={a.variant}
                  className="hd-mono"
                  style={{
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    fontWeight: 600
                  }}
                >
                  {row.cell(a)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConversionCard({
  arms,
  conversion,
  minimum
}: {
  arms: Arm[]
  conversion: Overview['chat']['conversion']
  minimum: Overview['chat']['minimum']
}) {
  const points = (n: number) =>
    `${n > 0 ? '+' : ''}${(n * 100).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })} p.p.`
  return (
    <article
      className="hd-card"
      style={{ gap: 8, background: 'var(--hd-card-2)' }}
    >
      <span className="hd-eyebrow">Conversão: B − A, com intervalo de 95%</span>
      {conversion.enough ? (
        <>
          <span style={{ font: '400 44px/1 var(--hd-display)', marginTop: 4 }}>
            {points(conversion.diff)}
          </span>
          <span className="hd-mono hd-small">
            intervalo de {points(conversion.low)} a {points(conversion.high)}
          </span>
          <span
            className="hd-pill"
            data-tone={conversion.significant ? 'acid' : 'draft'}
            style={{ alignSelf: 'flex-start' }}
          >
            {conversion.significant
              ? `diferença real: ${conversion.diff > 0 ? 'B' : 'A'} converte mais`
              : 'ainda pode ser zero: sem vencedor'}
          </span>
        </>
      ) : (
        <>
          <span
            className="hd-pill"
            data-tone="sand"
            style={{ alignSelf: 'flex-start' }}
          >
            amostra insuficiente
          </span>
          <span style={{ fontSize: 13 }}>Falta: {conversion.missing}.</span>
        </>
      )}
      <p className="hd-small" style={{ margin: 0, color: 'var(--hd-body)' }}>
        Conversa: mensagens da mesma pessoa no mesmo braço sem pausa de mais de
        30 minutos. Converte quando alguma resposta dela leva, em até 24 h, a
        abrir um bar citado, marcar "Vou assistir" ou pedir a rota. O teste
        compara {arms.map((a) => pct(a.conversionRate, 1)).join(' e ')} só com
        pelo menos {minimum.conversations} conversas por braço e{' '}
        {minimum.outcomes} com e {minimum.outcomes} sem ação em cada: abaixo
        disso o teste de duas proporções não vale e o intervalo enganaria.
      </p>
    </article>
  )
}

function ModelList({
  arms,
  labels
}: {
  arms: Arm[]
  labels: Array<{ key: string; label: string }>
}) {
  return (
    <dl
      className="hd-dl"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
    >
      {arms.map((a) => (
        <div key={a.variant}>
          <dt>{labels.find((l) => l.key === a.variant)?.label}</dt>
          <dd className="hd-mono" style={{ fontWeight: 400, fontSize: 12 }}>
            {a.model ?? 'sem modelo'} · peso {a.weight}%
          </dd>
        </div>
      ))}
    </dl>
  )
}

function WeightsEditor({
  title,
  arms,
  value,
  changed,
  busy,
  onSave
}: {
  title: string
  arms: Array<{ key: string; label: string }>
  value: Weights
  changed: string
  busy: boolean
  onSave: (next: Weights) => Promise<boolean>
}) {
  const server = JSON.stringify(value)
  const [draft, setDraft] = useState<Weights>(value)
  const [asking, setAsking] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `server` é o valor serializado
  useEffect(() => {
    setDraft(value)
    setAsking(false)
  }, [server])

  const sum = arms.reduce((total, arm) => total + (draft[arm.key] ?? 0), 0)
  const dirty = JSON.stringify(draft) !== server
  const describe = (w: Weights) =>
    arms.map((arm) => `${arm.key.toUpperCase()} ${w[arm.key]}`).join(' / ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end'
        }}
      >
        {arms.map((arm) => (
          <label
            key={arm.key}
            className="hd-label"
            style={{ width: 'min(170px, 100%)' }}
          >
            {arm.label}
            <input
              className="hd-input hd-mono"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={draft[arm.key] ?? 0}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  [arm.key]: Math.max(
                    0,
                    Math.min(100, Math.round(Number(event.target.value) || 0))
                  )
                })
              }
            />
          </label>
        ))}
        <span
          className="hd-pill"
          data-tone={sum === 100 ? 'acid' : 'live'}
          style={{ alignSelf: 'center' }}
        >
          soma {sum}
          {sum === 100 ? '' : ', precisa ser 100'}
        </span>
        <button
          type="button"
          className="hd-btn"
          disabled={busy || !dirty || sum !== 100 || asking}
          onClick={() => setAsking(true)}
        >
          Mudar pesos
        </button>
      </div>
      {asking ? (
        <Confirm
          text={`${title}: de ${describe(value)} para ${describe(draft)}. O sorteio é fixo por pessoa: só muda de braço quem está na faixa que mudou. Peso 0 tira o braço.`}
          confirmLabel="Confirmar pesos"
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={() => void onSave(draft)}
        />
      ) : null}
      <span className="hd-mono hd-small">ai.variant_weights · {changed}</span>
    </div>
  )
}

function LimitsEditor({
  value,
  defaults,
  changed,
  busy,
  onSave
}: {
  value: Limits
  defaults: Limits
  changed: string
  busy: boolean
  onSave: (next: Limits) => Promise<boolean>
}) {
  const server = JSON.stringify(value)
  const [draft, setDraft] = useState<Record<keyof Limits, string>>(() =>
    toDraft(value)
  )
  const [asking, setAsking] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `server` é o valor serializado
  useEffect(() => {
    setDraft(toDraft(value))
    setAsking(false)
  }, [server])

  const next = Object.fromEntries(
    LIMIT_FIELDS.map((f) => [f.key, Number(draft[f.key].replace(',', '.'))])
  ) as Limits
  const changes = LIMIT_FIELDS.filter((f) => next[f.key] !== value[f.key])
  const valid = LIMIT_FIELDS.every((f) => Number.isFinite(next[f.key]))
  const show = (f: (typeof LIMIT_FIELDS)[number], v: number) =>
    f.unit === 'usd' ? usd(v) : int(v)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className="hd-grid"
        style={{ '--hd-min': 'min(200px, 100%)' } as CSSProperties}
      >
        {LIMIT_FIELDS.map((f) => (
          <label key={f.key} className="hd-label">
            {f.label}
            <input
              className="hd-input hd-mono"
              inputMode="decimal"
              value={draft[f.key]}
              onChange={(event) =>
                setDraft({ ...draft, [f.key]: event.target.value })
              }
            />
            <span className="hd-sub">
              {f.unit === 'usd' ? 'US$' : 'vezes'} · padrão{' '}
              {show(f, defaults[f.key])}
            </span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="hd-btn"
          disabled={busy || !changes.length || !valid || asking}
          onClick={() => setAsking(true)}
        >
          Mudar limites
        </button>
      </div>
      {asking ? (
        <Confirm
          text={`Mudar ${changes
            .map(
              (f) =>
                `${f.label.toLowerCase()} de ${show(f, value[f.key])} para ${show(f, next[f.key])}`
            )
            .join('; ')}? Vale para todo mundo em até 1 minuto.`}
          confirmLabel="Confirmar limites"
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={() => void onSave(next)}
        />
      ) : null}
      <p className="hd-small" style={{ margin: 0 }}>
        Mensagens contam só resposta útil, no dia e no mês de Brasília; chamadas
        contam todas, inclusive as que falharam. O AI Gateway de produção tem o
        próprio teto de US$ 40: subir o teto do mês aqui sem subir lá não libera
        nada. Os modelos de cada braço são decisão de produto e ficam no código.
      </p>
      <span className="hd-mono hd-small">ai.limits · {changed}</span>
    </div>
  )
}

function toDraft(limits: Limits) {
  return Object.fromEntries(
    LIMIT_FIELDS.map((f) => [f.key, String(limits[f.key])])
  ) as Record<keyof Limits, string>
}

type Spender = Overview['top']['month'][number]

function Person({ id, name }: { id: string | null; name: string | null }) {
  if (!id)
    return <span style={{ color: 'var(--hd-muted)' }}>conta apagada</span>
  return (
    <Link
      to="/houdini/pessoas/$userId"
      params={{ userId: id }}
      className="hd-link"
    >
      {name || 'sem nome'}
    </Link>
  )
}

function TopTable({
  caption,
  rows,
  value,
  limit,
  limitLabel
}: {
  caption: string
  rows: Spender[]
  value: (row: Spender) => string
  limit: (row: Spender) => string
  limitLabel: string
}) {
  return (
    <div className="hd-table-wrap is-flat">
      <table
        className="hd-table"
        style={{ minWidth: 380, whiteSpace: 'nowrap' }}
      >
        <caption
          style={{
            textAlign: 'left',
            padding: '12px 14px',
            fontWeight: 700,
            fontSize: 13
          }}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>{caption.includes('gasto') ? 'Gasto' : 'Chamadas'}</th>
            <th>{limitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.userId}>
                <td>
                  <Person id={row.userId} name={row.name} />
                </td>
                <td className="hd-mono">{value(row)}</td>
                <td className="hd-mono">{limit(row)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="hd-empty">
                Ninguém chamou a IA ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_TONE: Record<string, 'sand' | 'live' | undefined> = {
  ok: undefined,
  fallback: 'sand',
  error: 'live',
  timeout: 'live',
  stopped: 'sand'
}
const STATUS_LABEL: Record<string, string> = {
  ok: 'ok',
  fallback: 'desvio',
  error: 'erro',
  timeout: 'demora',
  stopped: 'parada',
  running: 'rodando'
}

function RunsLog() {
  const trpc = useTRPC()
  const [filters, setFilters] = useState<{
    feature?: 'chat' | 'recommender'
    variant?: 'a' | 'b' | 'c'
    model?: string
    status?: 'ok' | 'fallback' | 'error' | 'timeout' | 'stopped' | 'running'
  }>({})
  const runs = useQuery({
    ...trpc.houdini.ia.runs.queryOptions({ ...filters, limit: 50 }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const pick =
    <K extends keyof typeof filters>(key: K) =>
    (event: ChangeEvent<HTMLSelectElement>) =>
      setFilters({
        ...filters,
        [key]: event.target.value || undefined
      })

  const select = (
    name: string,
    key: keyof typeof filters,
    options: Array<[string, string]>
  ) => (
    <label className="hd-label">
      {name}
      <select
        className="hd-select"
        value={filters[key] ?? ''}
        onChange={pick(key)}
      >
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {select('Funcionalidade', 'feature', [
          ['chat', 'Chat'],
          ['recommender', 'Recomendador']
        ])}
        {select('Braço', 'variant', [
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C']
        ])}
        {select(
          'Modelo',
          'model',
          (runs.data?.models ?? []).map((m) => [m, m])
        )}
        {select('Situação', 'status', [
          ['ok', 'ok'],
          ['fallback', 'desvio'],
          ['error', 'erro'],
          ['timeout', 'demora'],
          ['stopped', 'parada'],
          ['running', 'rodando']
        ])}
      </div>
      {runs.isError ? (
        <div className="hd-card" role="alert">
          {getUserFacingMessage(runs.error, 'Não foi possível ler o registro.')}
        </div>
      ) : (
        <div className="hd-table-wrap is-flat">
          <table
            className="hd-table"
            style={{ minWidth: 980, whiteSpace: 'nowrap' }}
          >
            <thead>
              <tr>
                <th>Quando</th>
                <th>Pessoa</th>
                <th>Funcionalidade</th>
                <th>Braço</th>
                <th>Modelo</th>
                <th>Situação</th>
                <th>Tempo</th>
                <th>Tokens</th>
                <th>Custo</th>
                <th>Útil</th>
                <th>Polegar</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.rows.length ? (
                runs.data.rows.map((r) => (
                  <tr key={r.runId}>
                    <td className="hd-mono">{time(r.createdAt)}</td>
                    <td>
                      <Person id={r.userId} name={r.userName} />
                    </td>
                    <td>{r.feature === 'chat' ? 'chat' : 'recomendador'}</td>
                    <td className="hd-mono">{r.variant.toUpperCase()}</td>
                    <td className="hd-mono" style={{ fontSize: 12 }}>
                      {r.servedModel && r.servedModel !== r.assignedModel
                        ? `${r.assignedModel} → ${r.servedModel}`
                        : r.assignedModel}
                    </td>
                    <td>
                      <span
                        className="hd-pill"
                        data-tone={STATUS_TONE[r.status]}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="hd-mono">{ms(r.latencyMs)}</td>
                    <td className="hd-mono">
                      {int(r.tokensIn)} · {int(r.tokensOut)}
                    </td>
                    <td className="hd-mono">{unit(r.costUsd)}</td>
                    <td>{r.useful ? 'sim' : 'não'}</td>
                    <td>
                      {r.feedback === 1 ? '▲' : r.feedback === -1 ? '▼' : '—'}
                    </td>
                    <td className="hd-mono">{int(r.actions)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="hd-empty">
                    {runs.isLoading
                      ? 'Lendo…'
                      : 'Nenhuma chamada com esses filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="hd-small" style={{ margin: 0 }}>
        As 50 últimas chamadas. Sem o texto da conversa: ele não é guardado.
      </p>
    </>
  )
}
