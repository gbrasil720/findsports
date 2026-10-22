import type { AppRouter } from '@findsports_oficial/api/routers/index'
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

import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
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

const TZ = 'America/Sao_Paulo'

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
    <HoudiniShell title="IA" env={env} user={admin}>
      <div className="hd-page">
        <div className="hd-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="hd-h1">IA</h1>
            <p className="hd-lead">
              Os testes de IA: quanto gastam, quanto rendem e os limites. Só
              números de cada chamada: o texto das conversas não é guardado.
            </p>
          </div>
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
        </div>

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
            <Section id="ia-situacao" title="Situação">
              <div
                className="hd-grid"
                style={{ '--hd-min': 'min(300px, 100%)' } as CSSProperties}
              >
                <SwitchCard
                  enabled={
                    enabledSpell
                      ? enabledSpell.valor === true
                      : o.status.enabled
                  }
                  gatewayId={o.status.gatewayId}
                  changed={changedBy(enabledSpell)}
                  busy={set.isPending || !config.data}
                  onChange={cast('ai.enabled')}
                />
                <BudgetCard month={o.status.month} />
                <HitsCard hits={o.status.hits} limits={o.status.limits} />
              </div>
              <DailyChart daily={o.status.daily} />
            </Section>

            <Section
              id="ia-chat"
              title="Teste do chat"
              aside="A Gemini 2.5 Flash × B GPT-6 Luna"
            >
              <ArmsTable arms={o.chat.arms} unitLabel="Conversas" />
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
            </Section>

            <Section
              id="ia-recomendador"
              title="Teste do recomendador"
              aside="A só o algoritmo × B Jev × C Clef-flash"
            >
              {o.recommender.live ? (
                <ArmsTable arms={o.recommender.arms} unitLabel="Pedidos" />
              ) : (
                <div className="hd-card" style={{ gap: 10 }}>
                  <span className="hd-pill" style={{ alignSelf: 'flex-start' }}>
                    ainda não ligado
                  </span>
                  <p className="hd-lead" style={{ margin: 0 }}>
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
              ) : null}
            </Section>

            <Section id="ia-limites" title="Limites">
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
                  limitLabel={`do teto de ${usd(o.top.limits.userMonthlyUsd)}`}
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
                  limitLabel="mensagens úteis"
                />
              </div>
            </Section>
          </>
        )}

        <Section id="ia-registro" title="Registro recente">
          <RunsLog />
        </Section>
      </div>
    </HoudiniShell>
  )
}

function Section({
  id,
  title,
  aside,
  children
}: {
  id: string
  title: string
  aside?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: '4px 12px'
        }}
      >
        <h2 id={id} className="hd-h2">
          {title}
        </h2>
        {aside ? <span className="hd-mono hd-small">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** Pedido de confirmação no lugar, com o que muda escrito por extenso. */
function Confirm({
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel
}: {
  text: string
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="hd-alert" role="alertdialog" aria-label={confirmLabel}>
      <p style={{ margin: 0, fontSize: 13 }}>{text}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="hd-btn hd-btn-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Gravando…' : confirmLabel}
        </button>
        <button type="button" className="hd-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

const label: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--hd-muted)'
}
const big: CSSProperties = {
  fontWeight: 700,
  fontSize: 28,
  letterSpacing: '-0.03em'
}

function SwitchCard({
  enabled,
  gatewayId,
  changed,
  busy,
  onChange
}: {
  enabled: boolean
  gatewayId: string | null
  changed: string
  busy: boolean
  onChange: (value: boolean) => Promise<boolean>
}) {
  const [asking, setAsking] = useState(false)
  return (
    <article className="hd-card" style={{ gap: 10 }}>
      <span style={label}>
        <Icon name="spark" size={16} strokeWidth={1.8} />A IA
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            ...big,
            color: enabled ? 'var(--hd-ok)' : 'var(--hd-muted)'
          }}
        >
          {enabled ? 'Ligada' : 'Desligada'}
        </span>
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          role="switch"
          className="hd-switch"
          aria-checked={enabled}
          aria-label="IA ligada"
          disabled={busy || asking}
          onClick={() => setAsking(true)}
        />
      </div>
      <dl className="hd-dl" style={{ gap: '8px 14px' }}>
        <div>
          <dt>Gateway</dt>
          <dd className="hd-mono">{gatewayId ?? 'nenhum (nada é chamado)'}</dd>
        </div>
        <div>
          <dt>Chave</dt>
          <dd className="hd-mono" style={{ fontWeight: 400, fontSize: 12 }}>
            ai.enabled
          </dd>
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
    <article className="hd-card" style={{ gap: 10 }} aria-label="Gasto do mês">
      <span style={label}>Gasto do mês</span>
      <span style={big}>
        {usd(month.spentUsd)}{' '}
        <span
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--hd-muted)' }}
        >
          de {usd(month.budgetUsd)}
        </span>
      </span>
      <div
        aria-hidden="true"
        style={{
          height: 8,
          borderRadius: 4,
          background: 'var(--hd-raise)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${fill * 100}%`,
            height: '100%',
            borderRadius: 4,
            background: month.blocked
              ? 'var(--hd-bad-dot)'
              : fill >= 0.8
                ? 'var(--hd-warn)'
                : 'var(--hd-roxo)'
          }}
        />
      </div>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
        <strong>{pct(month.share)}</strong>
        <span style={{ color: 'var(--hd-muted)' }}>
          · no ritmo de agora, {usd(month.projectionUsd)} no fim do mês
        </span>
      </span>
      {month.blocked ? (
        <span
          className="hd-pill"
          data-tone="bad"
          style={{ alignSelf: 'flex-start' }}
        >
          teto atingido: a IA está indisponível para todos
        </span>
      ) : over ? (
        <span
          className="hd-pill"
          data-tone="warn"
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
    <article className="hd-card" style={{ gap: 10 }}>
      <span style={label}>Pessoas que chegaram ao limite</span>
      <dl className="hd-dl" style={{ gap: '10px 14px' }}>
        {rows.map((row) => (
          <div key={row.k}>
            <dt>{row.k}</dt>
            <dd style={{ fontSize: 18 }}>{int(row.v)}</dd>
          </div>
        ))}
      </dl>
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
    <article className="hd-card" style={{ gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <span style={label}>Gasto por dia</span>
        <span className="hd-mono hd-small">
          {usd(total)} em {daily.length} {daily.length === 1 ? 'dia' : 'dias'}
          {max > 0 ? ` · maior ${usd(max)}` : ''}
        </span>
      </div>
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
          gap: 2,
          height: 120,
          borderBottom: '1px solid var(--hd-line-2)'
        }}
      >
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${shortDay(d.day)}: ${usd(d.costUsd)} · ${int(d.runs)} chamadas`}
            style={{
              flex: '1 1 0',
              height: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center'
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 28,
                height: max ? `${(d.costUsd / max) * 100}%` : 0,
                minHeight: d.costUsd > 0 ? 2 : 0,
                borderRadius: '4px 4px 0 0',
                background: 'var(--hd-roxo)'
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="hd-mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--hd-faint)'
        }}
      >
        <span>{daily[0] ? shortDay(daily[0].day) : ''}</span>
        <span>{daily.at(-1) ? shortDay(daily.at(-1)?.day ?? '') : ''}</span>
      </div>
      <details>
        <summary className="hd-small" style={{ cursor: 'pointer' }}>
          Ver em tabela
        </summary>
        <div className="hd-table-wrap" style={{ marginTop: 10 }}>
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
    </article>
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
    <div className="hd-table-wrap">
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
                    color: 'var(--hd-text)'
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
                  background: 'transparent',
                  fontWeight: 500,
                  color: 'var(--hd-muted)',
                  borderTop: '1px solid rgb(255 255 255 / 0.05)'
                }}
              >
                {row.label}
              </th>
              {arms.map((a) => (
                <td key={a.variant} className="hd-mono">
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
    <article className="hd-card" style={{ gap: 10 }}>
      <span style={label}>Conversão: B − A, com intervalo de 95%</span>
      {conversion.enough ? (
        <>
          <span style={big}>{points(conversion.diff)}</span>
          <span className="hd-mono hd-small">
            intervalo de {points(conversion.low)} a {points(conversion.high)}
          </span>
          <span
            className="hd-pill"
            data-tone={conversion.significant ? 'ok' : undefined}
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
            data-tone="warn"
            style={{ alignSelf: 'flex-start' }}
          >
            amostra insuficiente
          </span>
          <span style={{ fontSize: 13 }}>Falta: {conversion.missing}.</span>
        </>
      )}
      <p className="hd-small" style={{ margin: 0 }}>
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
    <article className="hd-card" style={{ gap: 12 }}>
      <span style={label}>{title}</span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end'
        }}
      >
        {arms.map((arm) => (
          <label key={arm.key} className="hd-label" style={{ width: 170 }}>
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
          data-tone={sum === 100 ? 'ok' : 'bad'}
          style={{ minHeight: 40, padding: '0 12px', borderRadius: 10 }}
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
    </article>
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
    <article className="hd-card" style={{ gap: 12 }}>
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
    </article>
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
    return <span style={{ color: 'var(--hd-faint)' }}>conta apagada</span>
  return (
    <Link
      to="/houdini/pessoas/$userId"
      params={{ userId: id }}
      style={{
        color: 'var(--hd-roxo-soft)',
        textDecoration: 'none',
        fontWeight: 600
      }}
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
    <div className="hd-table-wrap">
      <table className="hd-table" style={{ minWidth: 380 }}>
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

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  ok: 'ok',
  fallback: 'warn',
  error: 'bad',
  timeout: 'bad'
}
const STATUS_LABEL: Record<string, string> = {
  ok: 'ok',
  fallback: 'desvio',
  error: 'erro',
  timeout: 'demora'
}

function RunsLog() {
  const trpc = useTRPC()
  const [filters, setFilters] = useState<{
    feature?: 'chat' | 'recommender'
    variant?: 'a' | 'b' | 'c'
    model?: string
    status?: 'ok' | 'fallback' | 'error' | 'timeout'
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
          ['timeout', 'demora']
        ])}
      </div>
      {runs.isError ? (
        <div className="hd-card" role="alert">
          {getUserFacingMessage(runs.error, 'Não foi possível ler o registro.')}
        </div>
      ) : (
        <div className="hd-table-wrap">
          <table className="hd-table" style={{ minWidth: 980 }}>
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
