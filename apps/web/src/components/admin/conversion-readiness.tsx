import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'
import CheckCircle from 'reicon-react/icons/CheckCircle'
import PhoneChat from 'reicon-react/icons/PhoneChat'
import { formatStoredPhone } from '@/utils/format-phone'
import type { AdminBar, ProfileReadiness } from './admin-model'

type ReadinessItem = ProfileReadiness['checks'][number] & {
  description: string
}

type DetailedReadiness = Omit<ProfileReadiness, 'checks'> & {
  checks: ReadinessItem[]
}

export function buildReadiness(
  bar: AdminBar,
  hasUpcomingEvent: boolean
): DetailedReadiness {
  const hasPhone = (bar.phone?.length ?? 0) >= 10
  const checks: ReadinessItem[] = [
    {
      key: 'photo',
      label: 'Foto do bar',
      description: 'Ajuda o torcedor a reconhecer seu espaço.',
      done: !!bar.photoUrl
    },
    {
      key: 'name',
      label: 'Nome do bar',
      description: 'É como seu estabelecimento aparece nas buscas.',
      done: (bar.name?.length ?? 0) >= 2
    },
    {
      key: 'description',
      label: 'Descrição',
      description: 'Mostre rapidamente por que vale assistir aí.',
      done: (bar.description?.length ?? 0) >= 10
    },
    {
      key: 'address',
      label: 'Endereço completo',
      description: 'Necessário para rota, distância e mapa.',
      done:
        (bar.address?.length ?? 0) >= 5 &&
        (bar.neighborhood?.length ?? 0) >= 2 &&
        (bar.city?.length ?? 0) >= 2
    },
    {
      key: 'phone',
      label: 'Telefone de contato',
      description: 'Permite que potenciais clientes falem com o bar.',
      done: hasPhone
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp ativado',
      description: 'Confirme que o telefone também recebe mensagens.',
      done: hasPhone && !!bar.phoneAcceptsWhatsapp
    },
    {
      key: 'upcoming_event',
      label: 'Próximo jogo cadastrado',
      description: 'Coloca o bar nas buscas por partidas futuras.',
      done: hasUpcomingEvent
    }
  ]

  return {
    checks,
    score: checks.filter((check) => check.done).length,
    total: checks.length
  }
}

function CheckRow({
  check,
  actionLabel,
  onAction
}: {
  check: ReadinessItem
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <li
      className={`flex min-w-0 flex-col gap-3 border p-3.5 sm:flex-row sm:items-center sm:justify-between ${
        check.done
          ? 'border-[var(--onside-line)] bg-[var(--onside-stone)]/55'
          : 'border-[var(--onside-ink)] bg-[var(--onside-paper)]'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center border ${
            check.done
              ? 'border-[var(--onside-ink)] bg-[var(--onside-acid)]'
              : 'border-[var(--onside-line)] bg-[var(--onside-stone)]'
          }`}
          aria-hidden="true"
        >
          {check.done ? (
            <Check size={16} color="var(--onside-ink)" />
          ) : (
            <AlertCircle size={16} color="var(--onside-muted)" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--onside-ink)] text-sm">
              {check.label}
            </p>
            {check.done ? (
              <span className="font-[family-name:var(--onside-mono)] text-[9px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
                Completo
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[var(--onside-muted)] text-xs leading-relaxed">
            {check.description}
          </p>
        </div>
      </div>

      {!check.done && actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="onside-btn onside-btn-outline min-h-11 w-full shrink-0 justify-center text-xs sm:w-auto"
        >
          {actionLabel}
          <ArrowRight size={13} color="currentColor" aria-hidden="true" />
        </button>
      ) : null}
    </li>
  )
}

function WhatsAppStatus({
  phone,
  confirmed,
  isConfirming,
  onConfirm,
  onEditProfile
}: {
  phone: string
  confirmed: boolean
  isConfirming: boolean
  onConfirm: () => void
  onEditProfile: () => void
}) {
  const hasPhone = phone.length >= 10
  const isActive = hasPhone && confirmed

  return (
    <article
      className={`${isActive ? 'onside-panel-acid' : 'onside-panel'} flex h-full flex-col p-5 sm:p-6`}
      aria-labelledby="whatsapp-status-title"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center border border-[var(--onside-ink)] ${
            isActive
              ? 'bg-[var(--onside-ink)] text-[var(--onside-acid)]'
              : 'bg-[var(--onside-stone)] text-[var(--onside-ink)]'
          }`}
          aria-hidden="true"
        >
          <PhoneChat size={22} color="currentColor" />
        </span>
        <span
          className={`onside-badge ${isActive ? 'onside-badge-ink' : 'onside-badge-stone'}`}
        >
          {isActive ? 'Ativado' : hasPhone ? 'Pendente' : 'Não configurado'}
        </span>
      </div>

      <div className="flex-1">
        <p className="onside-kicker mb-1">Canal de conversão</p>
        <h3 id="whatsapp-status-title" className="onside-heading text-xl">
          WhatsApp do bar
        </h3>
        <p className="mt-2 text-[var(--onside-muted)] text-sm leading-relaxed">
          {isActive
            ? 'Pronto para receber potenciais clientes diretamente pelo perfil.'
            : hasPhone
              ? 'Confirme o número para liberar o contato pelo WhatsApp.'
              : 'Cadastre um telefone para ativar conversas pelo WhatsApp.'}
        </p>

        <div className="mt-5 border-[var(--onside-ink)] border-y py-3">
          <p className="font-[family-name:var(--onside-mono)] text-[9px] text-[var(--onside-muted)] uppercase tracking-[0.14em]">
            Número utilizado
          </p>
          <p className="mt-1 font-semibold text-[var(--onside-ink)] tabular-nums">
            {hasPhone ? formatStoredPhone(phone) : 'Nenhum telefone cadastrado'}
          </p>
        </div>
      </div>

      {isActive ? (
        <div
          className="mt-4 flex items-center gap-2 font-semibold text-sm"
          aria-live="polite"
        >
          <CheckCircle size={18} color="currentColor" aria-hidden="true" />
          Contato disponível no perfil
        </div>
      ) : (
        <button
          type="button"
          onClick={hasPhone ? onConfirm : onEditProfile}
          disabled={isConfirming}
          className="onside-btn onside-btn-ink mt-4 min-h-11 w-full justify-center text-xs disabled:opacity-60"
        >
          {isConfirming
            ? 'Ativando…'
            : hasPhone
              ? 'Ativar WhatsApp'
              : 'Cadastrar telefone'}
          {!isConfirming ? (
            <ArrowRight size={13} color="currentColor" aria-hidden="true" />
          ) : null}
        </button>
      )}
    </article>
  )
}

export function ConversionReadiness({
  bar,
  hasUpcomingEvent,
  isConfirmingWhatsApp,
  onConfirmWhatsApp,
  onEditProfile,
  onCreateEvent
}: {
  bar: AdminBar
  hasUpcomingEvent: boolean
  isConfirmingWhatsApp: boolean
  onConfirmWhatsApp: () => void
  onEditProfile: () => void
  onCreateEvent: () => void
}) {
  const readiness = buildReadiness(bar, hasUpcomingEvent)
  const pendingCount = readiness.total - readiness.score
  const percentage = Math.round((readiness.score / readiness.total) * 100)

  const getAction = (check: ReadinessItem) => {
    if (check.key === 'upcoming_event') {
      return { label: 'Adicionar jogo', onClick: onCreateEvent }
    }
    if (check.key === 'whatsapp' && (bar.phone?.length ?? 0) >= 10) {
      return { label: 'Ativar', onClick: onConfirmWhatsApp }
    }
    return { label: 'Completar', onClick: onEditProfile }
  }

  return (
    <section aria-labelledby="profile-readiness-title" className="space-y-4">
      <div>
        <p className="onside-kicker mb-1">Qualidade do perfil</p>
        <h2 id="profile-readiness-title" className="onside-display text-2xl">
          Pronto para receber clientes?
        </h2>
        <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
          Complete as informações que ajudam o torcedor a escolher e entrar em
          contato com o seu bar.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <article className="onside-panel-ink flex flex-col justify-between p-5 text-[var(--onside-paper)] sm:p-6">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
                  Progresso do perfil
                </p>
                <p className="mt-2 max-w-md text-sm text-[color-mix(in_srgb,var(--onside-paper)_68%,transparent)]">
                  {pendingCount === 0
                    ? 'Tudo pronto. Seu perfil tem as informações essenciais para converter visitas em contatos.'
                    : `${pendingCount} ${pendingCount === 1 ? 'ajuste separa' : 'ajustes separam'} seu perfil da configuração recomendada.`}
                </p>
              </div>
              <div className="text-right">
                <strong className="onside-display text-5xl text-[var(--onside-acid)] tabular-nums sm:text-6xl">
                  {percentage}%
                </strong>
                <p className="mt-1 font-[family-name:var(--onside-mono)] text-[9px] text-[color-mix(in_srgb,var(--onside-paper)_52%,transparent)] uppercase tracking-[0.14em]">
                  {readiness.score} de {readiness.total} completos
                </p>
              </div>
            </div>

            <div
              className="mt-6 grid grid-cols-7 gap-1.5"
              role="progressbar"
              aria-label="Progresso de configuração do perfil"
              aria-valuemin={0}
              aria-valuemax={readiness.total}
              aria-valuenow={readiness.score}
              aria-valuetext={`${percentage}% completo`}
            >
              {readiness.checks.map((check, index) => (
                <span
                  key={check.key}
                  className={`h-3 border ${
                    index < readiness.score
                      ? 'border-[var(--onside-acid)] bg-[var(--onside-acid)]'
                      : 'border-[color-mix(in_srgb,var(--onside-paper)_28%,transparent)] bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-[color-mix(in_srgb,var(--onside-paper)_18%,transparent)] border-t pt-4 text-xs">
            <span className="text-[color-mix(in_srgb,var(--onside-paper)_58%,transparent)]">
              Atualizado com os dados atuais do seu bar
            </span>
            <span className="font-semibold text-[var(--onside-paper)]">
              {pendingCount === 0
                ? 'Perfil completo'
                : 'Continue pelo checklist'}
            </span>
          </div>
        </article>

        <WhatsAppStatus
          phone={bar.phone ?? ''}
          confirmed={!!bar.phoneAcceptsWhatsapp}
          isConfirming={isConfirmingWhatsApp}
          onConfirm={onConfirmWhatsApp}
          onEditProfile={onEditProfile}
        />
      </div>

      <article className="onside-panel p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-[var(--onside-line)] border-b pb-4">
          <div>
            <p className="onside-kicker mb-1">Checklist do bar</p>
            <h3 className="onside-heading text-xl">O que está pronto</h3>
          </div>
          <span
            className={`onside-badge ${pendingCount === 0 ? 'onside-badge-acid' : 'onside-badge-stone'}`}
          >
            {pendingCount === 0
              ? 'Tudo completo'
              : `${pendingCount} ${pendingCount === 1 ? 'pendência' : 'pendências'}`}
          </span>
        </div>

        <ul className="grid gap-2 lg:grid-cols-2">
          {readiness.checks.map((check) => {
            const action = check.done ? null : getAction(check)
            return (
              <CheckRow
                key={check.key}
                check={check}
                actionLabel={action?.label}
                onAction={action?.onClick}
              />
            )
          })}
        </ul>
      </article>
    </section>
  )
}
