import { maintenanceForecast } from '@findsports_oficial/api/lib/maintenance-forecast'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Confirm } from '@/components/houdini/confirm'
import { formatDateTime } from '@/components/houdini/format'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/feiticos')({
  head: () => ({ meta: [{ title: 'Feitiços — Houdini' }] }),
  component: FeiticosPage
})

type Spell = inferRouterOutputs<AppRouter>['appConfig']['list'][number]

// WEB-387: passado o prazo, o feitiço volta ao padrão sozinho.
const PRAZOS = [
  { label: '15 min', minutes: 15 },
  { label: '1 h', minutes: 60 },
  { label: '24 h', minutes: 24 * 60 },
  { label: 'Sem prazo', minutes: null }
] as const

function remaining(expiresAt: string, now = Date.now()) {
  const minutes = Math.max(
    0,
    Math.round((Date.parse(expiresAt) - now) / 60_000)
  )
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
}

const GLOSSARY = [
  [
    'Feitiço',
    'Um botão de configuração do app que muda o comportamento sem precisar publicar código novo. Cada um tem um nome técnico, como ai.enabled.'
  ],
  [
    'Lançado · no padrão',
    'Lançado: alguém mudou o valor e ele está valendo agora. No padrão: está no valor original que vem do código.'
  ],
  [
    'Volta em…',
    'Quanto falta para o feitiço se desfazer sozinho. "Lançar por" escolhe esse prazo antes de você mexer.'
  ],
  [
    'Público · só servidor',
    'Público: o valor pode ser lido pelo app do torcedor. Só servidor: fica só do nosso lado, ninguém de fora vê.'
  ],
  [
    'JSON',
    'O formato dos feitiços que guardam mais de um número, como os pesos e limites da IA. Em dúvida, mude pela tela da IA, que valida os números.'
  ],
  [
    'Manutenção do app',
    'Tira o app do torcedor do ar com o aviso "Voltamos já já." e a previsão de volta. O painel do bar, o Houdini e o login continuam no ar.'
  ],
  [
    'Instâncias',
    'As cópias do app que estão rodando nos servidores. Elas percebem a mudança em até 60 segundos.'
  ]
] as const

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function FeiticosPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [prazo, setPrazo] = useState(1)
  const minutes = PRAZOS[prazo]?.minutes ?? null

  const list = useQuery({
    ...trpc.appConfig.list.queryOptions(),
    meta: { errorToast: false }
  })

  async function reload() {
    await queryClient.invalidateQueries({
      queryKey: trpc.appConfig.list.queryKey()
    })
  }

  const set = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: async (r, input) => {
        const por = PRAZOS.find((p) => p.minutes === input.expiresInMinutes)
        toast.success(
          input.expiresInMinutes && por
            ? `${r.key} lançado por ${por.label}.`
            : `${r.key} lançado.`
        )
        await reload()
      },
      onError: (error) =>
        toast.error(
          error.data?.code === 'BAD_REQUEST'
            ? `Valor recusado — ${error.message}`
            : getUserFacingMessage(error, 'Não foi possível lançar o feitiço.')
        )
    })
  )
  const reset = useMutation(
    trpc.appConfig.reset.mutationOptions({
      onSuccess: async (r) => {
        toast.success(`${r.key} voltou ao padrão.`)
        await reload()
      },
      onError: (error) =>
        toast.error(
          getUserFacingMessage(error, 'Não foi possível desfazer o feitiço.')
        )
    })
  )

  const spells = list.data ?? []

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Máquina"
          title="Feitiços"
          summary={
            <>
              Mudam o app sem publicar código novo. Valem em até <b>1 minuto</b>
              ; se o banco cair, tudo volta ao padrão.
            </>
          }
          actions={
            <div
              className="hd-label"
              style={{ alignItems: 'flex-end', fontWeight: 400 }}
            >
              <span className="hd-eyebrow">Lançar por</span>
              <fieldset className="hd-seg" aria-label="Prazo do feitiço">
                {PRAZOS.map((p, index) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={prazo === index}
                    onClick={() => setPrazo(index)}
                  >
                    {p.label}
                  </button>
                ))}
              </fieldset>
              <small className="hd-small">
                Acabou o prazo, o feitiço se desfaz sozinho e o Grimório anota.
              </small>
            </div>
          }
        >
          <a className="hd-help" href="#legenda">
            <Icon name="help" size={16} />
            Como ler esta página
          </a>
        </PageHead>

        {list.data ? (
          <MaintenanceCard
            spell={spells.find((s) => s.key === 'app.maintenance')}
          />
        ) : null}

        {list.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                list.error,
                'Não foi possível carregar os feitiços.'
              )}
            </p>
            <button
              type="button"
              className="hd-btn"
              style={{ alignSelf: 'flex-start', marginTop: 12 }}
              onClick={() => void list.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        ) : list.isLoading ? (
          <div className="hd-skeleton" style={{ height: 180 }} />
        ) : (
          <section
            className="hd-card"
            aria-label="Feitiços"
            style={{ padding: '6px 20px', gap: 0 }}
          >
            {spells.map((spell, index) => (
              <SpellRow
                key={spell.key}
                spell={spell}
                first={index === 0}
                open={openKey === spell.key}
                onToggleOpen={() =>
                  setOpenKey((k) => (k === spell.key ? null : spell.key))
                }
                busy={set.isPending || reset.isPending}
                onSet={(value) =>
                  set.mutate({
                    key: spell.key,
                    value,
                    expiresInMinutes: minutes
                  })
                }
                onReset={() => reset.mutate({ key: spell.key })}
              />
            ))}
          </section>
        )}

        <section
          id="legenda"
          className="hd-card"
          aria-labelledby="legenda-h"
          style={{ gap: 14 }}
        >
          <div className="hd-card-hd">
            <h2 id="legenda-h" className="hd-h2">
              Como ler esta página
            </h2>
            <span className="meta">os termos que aparecem aqui</span>
          </div>
          <dl className="hd-gloss">
            {GLOSSARY.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </HoudiniShell>
  )
}

function SpellRow({
  spell,
  first,
  open,
  onToggleOpen,
  busy,
  onSet,
  onReset
}: {
  spell: Spell
  first: boolean
  open: boolean
  onToggleOpen: () => void
  busy: boolean
  onSet: (value: unknown) => void
  onReset: () => void
}) {
  const fieldId = useId()
  const isBool = typeof spell.valor === 'boolean'
  const serverValue = asJson(spell.valor)
  const [draft, setDraft] = useState(serverValue)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(serverValue)
    setError(null)
  }, [serverValue])

  function saveDraft() {
    try {
      onSet(JSON.parse(draft))
      setError(null)
    } catch {
      setError('JSON inválido. Exemplos: true, false, 10.')
    }
  }

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 0',
        borderTop: first ? undefined : '1px solid var(--hd-line)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={spell.key}
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 44,
            padding: 0,
            border: 0,
            background: 'transparent',
            color: 'var(--hd-fg)',
            textAlign: 'left',
            cursor: 'pointer'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 6,
              flex: '0 0 auto',
              background: spell.sobrescrito
                ? 'var(--hd-acid)'
                : 'var(--hd-sub)',
              color: spell.sobrescrito ? '#12120f' : 'var(--hd-muted)'
            }}
          >
            <Icon name="wand" size={18} />
          </span>
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 0
            }}
          >
            <code
              className="hd-mono"
              style={{
                fontSize: 15,
                fontWeight: 600,
                overflowWrap: 'anywhere'
              }}
            >
              {spell.key}
            </code>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span
                className="hd-pill"
                data-tone={spell.sobrescrito ? 'acid' : 'draft'}
              >
                {spell.sobrescrito ? 'lançado' : 'no padrão'}
              </span>
              {spell.expiresAt ? (
                <span className="hd-pill" data-tone="sand">
                  volta em {remaining(spell.expiresAt)}
                </span>
              ) : null}
              <span className="hd-pill">
                {spell.publico ? 'público' : 'só servidor'}
              </span>
            </span>
          </span>
        </button>
        {isBool ? (
          <button
            type="button"
            role="switch"
            className="hd-switch"
            aria-checked={spell.valor === true}
            aria-label={spell.key}
            disabled={busy}
            onClick={() => onSet(!spell.valor)}
          />
        ) : (
          <code
            className="hd-mono"
            style={{
              maxWidth: 360,
              padding: '6px 10px',
              borderRadius: 5,
              background: 'var(--hd-sub)',
              color: 'var(--hd-body)',
              fontSize: 12.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {serverValue}
          </code>
        )}
      </div>

      {open ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginLeft: 46,
            padding: '14px 16px',
            borderRadius: 6,
            background: 'var(--hd-card-2)',
            boxShadow: 'inset 0 0 0 1px var(--hd-line)'
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: 'var(--hd-body)' }}>
            {spell.descricao}
          </p>
          <span className="hd-mono hd-small">
            padrão: {asJson(spell.padrao)}
            {spell.updatedAt
              ? ` · mudou em ${formatDateTime(spell.updatedAt)}${
                  spell.updatedByNome ? ` por ${spell.updatedByNome}` : ''
                }`
              : ' · nunca lançado'}
          </span>
          <details>
            <summary
              className="hd-small"
              style={{ cursor: 'pointer', fontWeight: 600 }}
            >
              Editar como JSON
            </summary>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 10
              }}
            >
              <label htmlFor={fieldId} className="hd-sr">
                Valor de {spell.key} em JSON
              </label>
              <textarea
                id={fieldId}
                className="hd-input hd-textarea hd-mono"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <p
                  role="alert"
                  style={{ margin: 0, color: 'var(--hd-live-text)' }}
                >
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="hd-btn is-sm"
                style={{ alignSelf: 'flex-start' }}
                disabled={busy || draft === serverValue}
                onClick={saveDraft}
              >
                Lançar este valor
              </button>
            </div>
          </details>
          {spell.sobrescrito ? (
            <button
              type="button"
              className="hd-btn is-sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={busy}
              onClick={onReset}
            >
              Voltar ao padrão
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

// WEB-466: a previsão sai da hora do clique, sem fuso para digitar.
const PREVISOES = [
  { label: '30 min', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: 'Sem previsão', minutes: null }
] as const

type Maintenance = { on: boolean; backAt: string | null }

/**
 * Manutenção do app (WEB-466, 26d e 26e): o interruptor da chave
 * `app.maintenance`, com a previsão de volta. Só o app lê a chave; o painel
 * do bar, o Houdini e o login seguem no ar.
 */
function MaintenanceCard({ spell }: { spell: Spell | undefined }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<'switch' | 'forecast' | null>(null)
  const [previsao, setPrevisao] = useState(1)
  const value = (spell?.valor ?? { on: false, backAt: null }) as Maintenance
  const forecast = maintenanceForecast(value.backAt, Date.now())

  const set = useMutation(
    trpc.appConfig.set.mutationOptions({
      onSuccess: async (_, input) => {
        const next = input.value as Maintenance
        toast.success(next.on ? 'App em manutenção.' : 'App de volta ao ar.')
        setAsking(null)
        await queryClient.invalidateQueries({
          queryKey: trpc.appConfig.list.queryKey()
        })
      },
      onError: (error) =>
        toast.error(getUserFacingMessage(error, 'Não foi possível mudar.'))
    })
  )

  const minutes = PREVISOES[previsao]?.minutes ?? null
  const backAt = () =>
    minutes === null
      ? null
      : new Date(Date.now() + minutes * 60_000).toISOString()
  const forecastLabel =
    minutes === null ? 'sem previsão' : `volta em ${PREVISOES[previsao]?.label}`

  return (
    <article
      className={`hd-card${value.on ? ' is-live' : ''}`}
      aria-labelledby="manutencao-h"
      style={{ gap: 14 }}
    >
      <div className="hd-card-hd">
        <h2 id="manutencao-h" className="hd-h2">
          Manutenção do app
        </h2>
        <span className="meta hd-mono">
          app.maintenance · {spell?.sobrescrito ? 'lançado' : 'no padrão'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            font: '400 40px/1 var(--hd-display)',
            textTransform: 'uppercase',
            color: value.on ? 'var(--hd-live-text)' : 'var(--hd-fg)'
          }}
        >
          {value.on ? 'Em manutenção' : 'No ar'}
        </span>
        <button
          type="button"
          role="switch"
          className="hd-switch"
          aria-checked={value.on}
          aria-label="App em manutenção"
          style={{ marginLeft: 'auto' }}
          disabled={!spell || set.isPending || asking !== null}
          onClick={() => setAsking('switch')}
        />
      </div>
      {value.on ? (
        <p style={{ margin: 0, color: 'var(--hd-body)' }}>
          {forecast
            ? `Previsão de volta ${forecast.time}, faltam cerca de ${forecast.left}.`
            : 'Sem previsão de volta: o app não mostra contagem.'}
        </p>
      ) : (
        <p style={{ margin: 0, color: 'var(--hd-body)' }}>
          Ligada, quem abre o app vê "Voltamos já já." com a previsão e o código
          do jogo de hoje. O painel do bar, o Houdini e o login continuam no ar.
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10
        }}
      >
        <span className="hd-eyebrow">Previsão de volta</span>
        <fieldset className="hd-seg" aria-label="Previsão de volta">
          {PREVISOES.map((p, index) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={previsao === index}
              onClick={() => setPrevisao(index)}
            >
              {p.label}
            </button>
          ))}
        </fieldset>
        {value.on ? (
          <button
            type="button"
            className="hd-btn"
            disabled={set.isPending || asking !== null}
            onClick={() => setAsking('forecast')}
          >
            Mudar a previsão
          </button>
        ) : null}
      </div>
      <span className="hd-mono hd-small">
        app.maintenance ·{' '}
        {spell?.updatedAt
          ? `mudou em ${formatDateTime(spell.updatedAt)}${
              spell.updatedByNome ? ` por ${spell.updatedByNome}` : ''
            }`
          : 'nunca lançado'}
      </span>
      {asking ? (
        <Confirm
          text={
            asking === 'forecast'
              ? `Mudar a previsão de volta (${forecastLabel})? O app mostra a nova em até 2 minutos.`
              : value.on
                ? 'Tirar o app da manutenção? Quem está com o app aberto volta ao normal em até 2 minutos.'
                : `Pôr o app em manutenção (${forecastLabel})? Em até 2 minutos, quem abrir o app vê "Voltamos já já." no lugar das telas.`
          }
          confirmLabel={
            asking === 'forecast'
              ? 'Mudar a previsão'
              : value.on
                ? 'Tirar da manutenção'
                : 'Pôr em manutenção'
          }
          busy={set.isPending}
          onCancel={() => setAsking(null)}
          onConfirm={() =>
            set.mutate({
              key: 'app.maintenance',
              value:
                asking === 'switch' && value.on
                  ? { on: false, backAt: null }
                  : { on: true, backAt: backAt() },
              expiresInMinutes: null
            })
          }
        />
      ) : null}
    </article>
  )
}
