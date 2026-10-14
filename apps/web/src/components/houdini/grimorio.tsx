import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
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

function planName(plan: unknown) {
  return typeof plan === 'string' && plan in PLAN_NAMES
    ? PLAN_NAMES[plan as keyof typeof PLAN_NAMES]
    : '?'
}

function duration(seconds: unknown) {
  if (typeof seconds !== 'number') return null
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
}

const JOB_LABELS: Record<string, string> = {
  bar_plans: 'a reconciliação dos planos',
  analytics_retention: 'a limpeza dos analytics'
}

const EVENT_FIELDS: Record<string, string> = {
  startsAt: 'início',
  endsAt: 'fim',
  championship: 'campeonato',
  acceptsReservations: 'reservas',
  reservationCap: 'limite'
}

function eventField(key: string, value: unknown) {
  if (value === null || value === undefined) {
    return key === 'reservationCap' ? 'do bar' : '—'
  }
  if (key === 'startsAt' || key === 'endsAt') {
    return formatDateTime(String(value))
  }
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  return String(value)
}

/** "início 14/10 21:30 → 14/10 22:00 · limite do bar → 30". */
function eventChanges(before: unknown, after: unknown) {
  const b = asRecord(before)
  const a = asRecord(after)
  return Object.keys(a)
    .map(
      (key) =>
        `${EVENT_FIELDS[key] ?? key} ${eventField(key, b[key])} → ${eventField(key, a[key])}`
    )
    .join(' · ')
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
    case 'user.impersonation_mode': {
      const act = asRecord(entry.after).mode === 'act'
      return {
        icon: 'mask',
        tone: act ? 'warn' : 'roxo',
        text: `${act ? 'passou a agir' : 'voltou a só olhar'} na pele de ${label}`,
        detail: null
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
    case 'user.resend_verification':
      return {
        icon: 'check',
        tone: 'neutral',
        text: `reenviou a verificação de e-mail para ${label}`,
        detail: null
      }
    case 'user.send_password_reset':
      return {
        icon: 'back',
        tone: 'neutral',
        text: `mandou o link de troca de senha para ${label}`,
        detail: null
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
    case 'system.run_job':
      return {
        icon: 'pulse',
        tone: detail.ok ? 'neutral' : 'bad',
        text: `rodou ${JOB_LABELS[label] ?? label} na hora`,
        detail: detail.ok ? null : 'falhou: o erro está em Bastidores'
      }
    case 'event.update':
      return {
        icon: 'cal',
        tone: 'warn',
        text: `corrigiu o jogo ${label}`,
        detail: eventChanges(entry.before, entry.after)
      }
    case 'event.delete':
      return {
        icon: 'cal',
        tone: 'bad',
        text: `apagou o jogo ${label}`,
        detail: eventField('startsAt', asRecord(entry.before).startsAt)
      }
    case 'event.fix':
      return detail.warning === 'duplicate'
        ? {
            icon: 'cal',
            tone: 'ok',
            text: `apagou o duplicado ${label}`,
            detail: eventField('startsAt', asRecord(entry.before).startsAt)
          }
        : {
            icon: 'cal',
            tone: 'ok',
            text: `ligou ao catálogo o jogo ${label}`,
            detail: `“${asRecord(entry.before).participantFreeText ?? '?'}” → ${(
              (asRecord(entry.after).teams as string[] | undefined) ?? []
            ).join(' × ')}`
          }
    case 'bar.sync_search':
      return {
        icon: 'store',
        tone: 'warn',
        text: `sincronizou a busca de ${label}`,
        detail: `${planName(asRecord(entry.before).plan)} → ${planName(asRecord(entry.after).plan)}`
      }
    case 'bar.extend_trial': {
      const before = asRecord(entry.before)
      const after = asRecord(entry.after)
      const end =
        typeof after.currentPeriodEnd === 'string'
          ? `até ${formatDateTime(after.currentPeriodEnd)}`
          : null
      return {
        icon: 'hourglass',
        tone: 'roxo',
        text: `estendeu o teste de ${label} em ${detail.days ?? '?'} dias`,
        detail:
          [end, !before.isActive && after.isActive ? 'religou o bar' : null]
            .filter(Boolean)
            .join(' · ') || null
      }
    }
    case 'bar.take_off_air':
      return {
        icon: 'vanish',
        tone: 'bad',
        text: `tirou ${label} do ar`,
        detail: null
      }
    case 'bar.put_on_air':
      return {
        icon: 'back',
        tone: 'ok',
        text: `religou ${label}`,
        detail: null
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
      className="hd-grim-row"
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
        className="hd-mono hd-grim-time"
        dateTime={new Date(entry.createdAt).toISOString()}
        style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--hd-faint)' }}
      >
        {formatDateTime(entry.createdAt)}
      </time>
    </article>
  )
}
