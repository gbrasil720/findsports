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
import { HoudiniShell } from '@/components/houdini/shell'
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
  const cast = spells.filter((s) => s.sobrescrito).length

  return (
    <HoudiniShell title="Feitiços" env={env} user={admin}>
      <div className="hd-page" style={{ maxWidth: 980 }}>
        <div className="hd-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="hd-h1">Feitiços</h1>
            <p className="hd-lead">
              Mudam o app sem deploy. Gravam na hora, e as instâncias em
              execução sentem em até 60 segundos. Banco fora do ar, tudo volta
              ao padrão.
            </p>
          </div>
          {list.data ? (
            <span className="hd-mono hd-small">
              {spells.length} feitiços · {cast} lançado{cast === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
            Lançar por
          </span>
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
          <span className="hd-small">
            Acabou o prazo, o feitiço se desfaz sozinho e o Grimório anota.
          </span>
        </div>

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
          <div
            className="hd-card"
            style={{ padding: 0, overflow: 'hidden', gap: 0 }}
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
          </div>
        )}
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
        borderTop: first ? undefined : '1px solid rgb(255 255 255 / 0.06)',
        background: open ? '#18161f' : undefined
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          style={{
            flex: '1 1 260px',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            minHeight: 44,
            padding: 0,
            border: 0,
            background: 'transparent',
            color: 'var(--hd-text)',
            textAlign: 'left',
            cursor: 'pointer'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              flex: '0 0 auto',
              background: spell.sobrescrito
                ? 'var(--hd-roxo-tint)'
                : 'var(--hd-raise)',
              color: spell.sobrescrito ? 'var(--hd-roxo)' : 'var(--hd-muted)'
            }}
          >
            <Icon name="wand" size={18} strokeWidth={1.8} />
          </span>
          <code
            className="hd-mono"
            style={{ fontSize: 13, overflowWrap: 'anywhere' }}
          >
            {spell.key}
          </code>
        </button>
        <span
          className="hd-pill"
          data-tone={spell.sobrescrito ? 'roxo' : undefined}
        >
          {spell.sobrescrito ? 'lançado' : 'no padrão'}
        </span>
        {spell.expiresAt ? (
          <span className="hd-pill" data-tone="warn">
            volta em {remaining(spell.expiresAt)}
          </span>
        ) : null}
        <span className="hd-pill">
          {spell.publico ? 'público' : 'só servidor'}
        </span>
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
          <code className="hd-mono hd-small">{serverValue}</code>
        )}
      </div>

      {open ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '0 18px 20px 68px'
          }}
        >
          <p className="hd-lead" style={{ color: 'var(--hd-soft)' }}>
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
            <summary className="hd-small" style={{ cursor: 'pointer' }}>
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
                <p role="alert" style={{ margin: 0, color: 'var(--hd-bad)' }}>
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="hd-btn"
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
              className="hd-btn"
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
    <article className="hd-card" style={{ gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="hd-small">Manutenção do app</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '-0.02em',
              color: value.on ? 'var(--hd-warn)' : 'var(--hd-ok)'
            }}
          >
            {value.on ? 'Em manutenção' : 'No ar'}
          </span>
        </div>
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          role="switch"
          className="hd-switch"
          aria-checked={value.on}
          aria-label="App em manutenção"
          disabled={!spell || set.isPending || asking !== null}
          onClick={() => setAsking('switch')}
        />
      </div>
      {value.on ? (
        <p className="hd-lead" style={{ margin: 0 }}>
          {forecast
            ? `Previsão de volta ${forecast.time}, faltam cerca de ${forecast.left}.`
            : 'Sem previsão de volta: o app não mostra contagem.'}
        </p>
      ) : (
        <p className="hd-lead" style={{ margin: 0 }}>
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
        <span style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
          Previsão de volta
        </span>
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
