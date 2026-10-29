import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'

import { formatDateTime, formatTime, initials, when } from './format'
import { Icon, type IconName } from './icons'

export type GrimorioEntry =
  inferRouterOutputs<AppRouter>['grimorio']['list']['entries'][number]

/** O ladrilho do ícone: acid lança, vermelho tira, tinta é na pele. */
type Tone = 'acid' | 'live' | 'ink' | 'stone'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  acid: { bg: 'var(--hd-acid)', fg: '#12120f' },
  live: { bg: 'var(--hd-live)', fg: '#fff' },
  ink: { bg: 'var(--hd-fg)', fg: 'var(--hd-bg)' },
  stone: { bg: 'var(--hd-sub)', fg: 'var(--hd-fg)' }
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
  analytics_retention: 'a limpeza dos analytics',
  ai_stale_runs: 'o encerramento das execuções presas da IA',
  bar_notices: 'os avisos da semana dos bares'
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
        tone: 'ink',
        text: `entrou na pele de ${label}`,
        detail: null
      }
    case 'user.stop_impersonating': {
      const lasted = duration(detail.seconds)
      return {
        icon: 'mask',
        tone: 'ink',
        text: `tirou a pele de ${label}`,
        detail: lasted ? `durou ${lasted}` : null
      }
    }
    case 'user.impersonation_mode': {
      const act = asRecord(entry.after).mode === 'act'
      return {
        icon: 'mask',
        tone: 'ink',
        text: `${act ? 'passou a agir' : 'voltou a só olhar'} na pele de ${label}`,
        detail: null
      }
    }
    case 'user.ban':
      return {
        icon: 'vanish',
        tone: 'live',
        text: `sumiu com ${label}`,
        detail:
          typeof detail.reason === 'string'
            ? `motivo: ${detail.reason}`
            : 'sem motivo'
      }
    case 'user.unban':
      return {
        icon: 'back',
        tone: 'stone',
        text: `trouxe ${label} de volta`,
        detail: null
      }
    case 'user.set_role':
      return {
        icon: 'users',
        tone: 'stone',
        text: `trocou o papel de ${label}`,
        detail: `${asRecord(entry.before).role ?? '?'} → ${asRecord(entry.after).role ?? '?'}`
      }
    case 'user.resend_verification':
      return {
        icon: 'check',
        tone: 'stone',
        text: `pediu o reenvio da verificação de e-mail para ${label}`,
        detail: null
      }
    case 'user.send_password_reset':
      return {
        icon: 'back',
        tone: 'stone',
        text: `pediu o link de troca de senha para ${label}`,
        detail: null
      }
    case 'config.set':
      return {
        icon: 'wand',
        tone: 'acid',
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
        tone: 'stone',
        text: `desfez ${label}: o prazo acabou`,
        detail: `${show(entry.before)} → padrão`
      }
    case 'config.reset':
      return {
        icon: 'wand',
        tone: 'stone',
        text: `desfez ${label}`,
        detail: `${show(entry.before)} → padrão`
      }
    case 'system.run_job':
      return {
        icon: 'pulse',
        tone: detail.ok ? 'stone' : 'live',
        text: `rodou ${JOB_LABELS[label] ?? label} na hora`,
        detail: detail.ok ? null : 'falhou: o erro está em Bastidores'
      }
    case 'event.update':
      return {
        icon: 'cal',
        tone: 'stone',
        text: `corrigiu o jogo ${label}`,
        detail: eventChanges(entry.before, entry.after)
      }
    case 'event.delete':
      return {
        icon: 'cal',
        tone: 'live',
        text: `apagou o jogo ${label}`,
        detail: eventField('startsAt', asRecord(entry.before).startsAt)
      }
    case 'event.fix':
      return detail.warning === 'duplicate'
        ? {
            icon: 'cal',
            tone: 'stone',
            text: `apagou o duplicado ${label}`,
            detail: eventField('startsAt', asRecord(entry.before).startsAt)
          }
        : {
            icon: 'cal',
            tone: 'stone',
            text: `ligou ao catálogo o jogo ${label}`,
            detail: `“${asRecord(entry.before).participantFreeText ?? '?'}” → ${(
              (asRecord(entry.after).teams as string[] | undefined) ?? []
            ).join(' × ')}`
          }
    case 'bar.sync_search':
      return {
        icon: 'store',
        tone: 'stone',
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
        tone: 'stone',
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
        tone: 'live',
        text: `tirou ${label} do ar`,
        detail: null
      }
    case 'bar.put_on_air':
      return {
        icon: 'back',
        tone: 'stone',
        text: `religou ${label}`,
        detail: null
      }
    case 'bar.photo_approve':
      return {
        icon: 'check',
        tone: 'acid',
        text: `aprovou uma foto de ${label}`,
        detail: detail.cover ? 'virou a capa' : null
      }
    case 'bar.description_approve':
      return {
        icon: 'check',
        tone: 'acid',
        text: `aprovou a descrição de ${label}`,
        detail: null
      }
    case 'bar.description_reject':
      return {
        icon: 'warn',
        tone: 'live',
        text: `recusou a descrição de ${label}`,
        detail: typeof detail.reason === 'string' ? detail.reason : null
      }
    case 'bar.rating_comment_approve':
      return {
        icon: 'check',
        tone: 'acid',
        text: `aprovou um comentário sobre ${label}`,
        detail: null
      }
    case 'bar.rating_comment_reject':
      return {
        icon: 'warn',
        tone: 'live',
        text: `recusou um comentário sobre ${label}`,
        detail: typeof detail.reason === 'string' ? detail.reason : null
      }
    case 'bar.photo_reject':
      return {
        icon: 'warn',
        tone: 'live',
        text: `recusou uma foto de ${label}`,
        detail: typeof detail.reason === 'string' ? detail.reason : null
      }
    default:
      return {
        icon: 'book',
        tone: 'stone',
        text: `${entry.kind} em ${label}`,
        detail: null
      }
  }
}

/** A ficha que a linha abre: pessoa e bar têm; jogo, feitiço e rotina não. */
function Target({ entry }: { entry: GrimorioEntry }) {
  const style = { paddingTop: 6, fontWeight: 600 }
  if (entry.targetType === 'user') {
    return (
      <Link
        to="/houdini/pessoas/$userId"
        params={{ userId: entry.targetId }}
        className="hd-small hd-grim-target"
        style={style}
      >
        {entry.targetLabel}
      </Link>
    )
  }
  if (entry.targetType === 'bar') {
    return (
      <Link
        to="/houdini/bares/$barId"
        params={{ barId: entry.targetId }}
        className="hd-small hd-grim-target"
        style={style}
      >
        {entry.targetLabel}
      </Link>
    )
  }
  return null
}

/**
 * Uma linha do Grimório. Na página, agrupada por dia: hora, ladrilho, quem e o
 * quê, e a ficha do alvo. No Início (`compact`): as iniciais de quem fez e a
 * hora no fim.
 */
export function GrimorioRow({
  entry,
  compact = false
}: {
  entry: GrimorioEntry
  compact?: boolean
}) {
  const d = describe(entry)
  const tone = TONES[d.tone]
  const time = (
    <time
      className="hd-mono hd-grim-time"
      dateTime={new Date(entry.createdAt).toISOString()}
      title={formatDateTime(entry.createdAt)}
      style={{
        flex: '0 0 auto',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--hd-muted)',
        paddingTop: compact ? 0 : 7,
        minWidth: compact ? undefined : 48
      }}
    >
      {compact
        ? when(entry.createdAt).replace(/^hoje /, '')
        : formatTime(entry.createdAt)}
    </time>
  )

  return (
    <article
      className="hd-row hd-grim-row"
      style={{
        alignItems: 'flex-start',
        gap: compact ? 12 : 14,
        padding: compact ? '10px 0' : '14px 0'
      }}
    >
      {compact ? (
        <span
          className="hd-avatar is-sm"
          role="img"
          aria-label={entry.actorName}
          title={entry.actorName}
        >
          {initials(entry.actorName)}
        </span>
      ) : (
        <>
          {time}
          <span
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 6,
              background: tone.bg,
              color: tone.fg
            }}
          >
            <Icon name={d.icon} size={16} />
          </span>
        </>
      )}
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
          style={{ fontSize: compact ? 14 : 14.5, overflowWrap: 'anywhere' }}
        >
          {compact ? null : <b>{entry.actorName} </b>}
          {d.text}
        </span>
        {d.detail ? (
          <span
            className="hd-mono hd-small"
            style={{ overflowWrap: 'anywhere' }}
          >
            {d.detail}
          </span>
        ) : null}
      </div>
      {compact ? time : <Target entry={entry} />}
    </article>
  )
}
