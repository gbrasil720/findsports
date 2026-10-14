import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'

import { formatDateTime } from './format'
import { Icon, type IconName } from './icons'

export type GrimorioEntry =
  inferRouterOutputs<AppRouter>['grimorio']['list']['entries'][number]

type Tone = 'roxo' | 'bad' | 'warn' | 'ok' | 'neutral'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  roxo: { bg: 'var(--hd-roxo-tint)', fg: 'var(--hd-roxo-soft)' },
  bad: { bg: 'var(--hd-bad-tint)', fg: 'var(--hd-bad)' },
  warn: { bg: 'rgb(242 196 109 / 0.12)', fg: 'var(--hd-warn)' },
  ok: { bg: 'var(--hd-ok-tint)', fg: 'var(--hd-ok)' },
  neutral: { bg: 'rgb(255 255 255 / 0.07)', fg: 'var(--hd-soft)' }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function show(value: unknown) {
  const v = asRecord(value)
  if (v.padrao) return 'padrão'
  return JSON.stringify(v.value ?? v.role ?? value)
}

function duration(seconds: unknown) {
  if (typeof seconds !== 'number') return null
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
}

/** Como cada truque aparece no Grimório. */
export function describe(entry: GrimorioEntry): {
  icon: IconName
  tone: Tone
  text: string
  detail: string | null
} {
  const label = entry.targetLabel
  const detail = asRecord(entry.detail)
  switch (entry.kind) {
    case 'user.impersonate':
      return {
        icon: 'mask',
        tone: 'roxo',
        text: `entrou na pele de ${label}`,
        detail: null
      }
    case 'user.stop_impersonating': {
      const lasted = duration(detail.seconds)
      return {
        icon: 'mask',
        tone: 'roxo',
        text: `tirou a pele de ${label}`,
        detail: lasted ? `durou ${lasted}` : null
      }
    }
    case 'user.ban':
      return {
        icon: 'vanish',
        tone: 'bad',
        text: `sumiu com ${label}`,
        detail:
          typeof detail.reason === 'string'
            ? `motivo: ${detail.reason}`
            : 'sem motivo'
      }
    case 'user.unban':
      return {
        icon: 'back',
        tone: 'ok',
        text: `trouxe ${label} de volta`,
        detail: null
      }
    case 'user.set_role':
      return {
        icon: 'users',
        tone: 'neutral',
        text: `trocou a role de ${label}`,
        detail: `${asRecord(entry.before).role ?? '?'} → ${asRecord(entry.after).role ?? '?'}`
      }
    case 'config.set':
      return {
        icon: 'wand',
        tone: 'warn',
        text: `lançou ${label}`,
        detail: `${show(entry.before)} → ${show(entry.after)}${
          typeof detail.expiresInMinutes === 'number'
            ? ` · por ${detail.expiresInMinutes} min`
            : ''
        }`
      }
    case 'config.expire':
      return {
        icon: 'hourglass',
        tone: 'warn',
        text: `desfez ${label}: o prazo acabou`,
        detail: `${show(entry.before)} → padrão`
      }
    case 'config.reset':
      return {
        icon: 'wand',
        tone: 'warn',
        text: `desfez ${label}`,
        detail: `${show(entry.before)} → padrão`
      }
    default:
      return {
        icon: 'book',
        tone: 'neutral',
        text: `${entry.kind} em ${label}`,
        detail: null
      }
  }
}

export function GrimorioRow({
  entry,
  compact = false
}: {
  entry: GrimorioEntry
  compact?: boolean
}) {
  const d = describe(entry)
  const tone = TONES[d.tone]
  return (
    <article
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: compact ? '10px 0' : '14px 16px',
        borderRadius: compact ? 0 : 12,
        background: compact ? 'transparent' : 'var(--hd-panel)',
        border: compact ? 0 : '1px solid rgb(255 255 255 / 0.06)',
        borderTop: compact ? '1px solid rgb(255 255 255 / 0.05)' : undefined
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 9,
          background: tone.bg,
          color: tone.fg
        }}
      >
        <Icon name={d.icon} size={16} strokeWidth={1.8} />
      </span>
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}
      >
        <span
          style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}
        >
          <strong style={{ fontWeight: 700 }}>{entry.actorName}</strong>{' '}
          {d.text}
        </span>
        {d.detail ? (
          <span
            className="hd-mono"
            style={{
              fontSize: 12,
              color: 'var(--hd-muted)',
              overflowWrap: 'anywhere'
            }}
          >
            {d.detail}
          </span>
        ) : null}
      </div>
      <time
        className="hd-mono"
        dateTime={new Date(entry.createdAt).toISOString()}
        style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--hd-faint)' }}
      >
        {formatDateTime(entry.createdAt)}
      </time>
    </article>
  )
}
