import Calendar from 'reicon-react/icons/Calendar'
import Chat from 'reicon-react/icons/Chat'
import Phone from 'reicon-react/icons/Phone'
import Route from 'reicon-react/icons/Route'
import { formatStoredPhone } from '@/utils/format-phone'
import { OwnerNudge } from './owner-notice'

export type BarActions = {
  whatsappUrl: string | null
  directionsUrl: string | null
  phone: string | null
  onWhatsApp: () => void
  onDirections: () => void
  onPhone: () => void
  /**
   * Presente só quando o torcedor pode pedir mesa agora: bar recebendo
   * reservas (quer e pode), jogo futuro na agenda e conta de torcedor.
   */
  onReserve: (() => void) | null
}

/**
 * As três ações que a página inteira serve — falar, chegar, ligar.
 *
 * O WhatsApp é o primário porque é o único que devolve resposta ("tem mesa?").
 * Quando o bar não deixou WhatsApp, a rota assume o primário em vez de sobrar
 * um botão desabilitado: o torcedor não tem culpa do cadastro incompleto, e um
 * botão morto vale menos que um botão que leva.
 *
 * O componente é o ponto único de troca: com reserva disponível (WEB-124),
 * "Reservar mesa" vira o primário e o WhatsApp desce para secundário. Sem
 * ela, nada muda — nenhum botão morto.
 */
type Action = {
  key: string
  icon: typeof Chat
  /** Texto quando é a ação principal. */
  label: string
  /** Texto quando desce para secundária. */
  shortLabel: string
  onClick: () => void
  href?: string
}

export function BarActions({
  whatsappUrl,
  directionsUrl,
  phone,
  onWhatsApp,
  onDirections,
  onPhone,
  onReserve,
  variant,
  isOwner
}: BarActions & { variant: 'panel' | 'bar'; isOwner: boolean }) {
  const isBar = variant === 'bar'

  // Em ordem de preferência: a primeira disponível é a principal, as outras
  // descem para secundárias. Telefone nunca é principal.
  const [primaryAction, ...otherActions] = [
    onReserve && {
      key: 'reserve',
      icon: Calendar,
      label: 'Reservar mesa',
      shortLabel: 'Reservar mesa',
      onClick: onReserve
    },
    whatsappUrl && {
      key: 'whatsapp',
      icon: Chat,
      label: 'Falar com o bar',
      shortLabel: 'WhatsApp',
      onClick: onWhatsApp,
      href: whatsappUrl
    },
    directionsUrl && {
      key: 'directions',
      icon: Route,
      label: 'Como chegar',
      shortLabel: 'Rota',
      onClick: onDirections,
      href: directionsUrl
    }
  ].filter((action): action is Action => Boolean(action))

  const secondaryActions: Action[] = phone
    ? [
        ...otherActions,
        {
          key: 'phone',
          icon: Phone,
          label: 'Ligar',
          shortLabel: isBar ? 'Ligar' : formatStoredPhone(phone),
          onClick: onPhone,
          href: `tel:${phone}`
        }
      ]
    : otherActions

  // Na barra fixa do celular, quatro botões com texto não cabem: com reserva,
  // os secundários ficam só com ícone (o nome segue para leitor de tela).
  const compact = isBar && secondaryActions.length > 2

  const primary = primaryAction ? (
    <ActionButton
      action={primaryAction}
      text={primaryAction.label}
      className="onside-btn onside-btn-acid min-h-12 flex-1 justify-center whitespace-nowrap text-sm"
      iconOnly={false}
      hideIcon={compact}
    />
  ) : null

  const secondaries = secondaryActions.map((action) => (
    <ActionButton
      key={action.key}
      action={action}
      text={action.shortLabel}
      className={`onside-btn onside-btn-outline min-h-12 justify-center text-sm${compact ? ' onside-pub-actionbar-icon' : ''}`}
      iconOnly={compact}
      hideIcon={false}
    />
  ))

  // Bar sem contato nenhum e sem coordenada não tem ação a oferecer — mas o
  // dono ainda precisa saber que a página chegou nesse estado.
  if (!primary && !phone) {
    return isOwner && !isBar ? (
      <section className="onside-panel p-5 md:p-6">
        <p className="onside-kicker mb-1">Garanta seu lugar</p>
        <OwnerNudge
          action={{ label: 'Completar', to: '/admin', hash: 'admin-espaco' }}
        >
          Seu perfil não tem nenhuma forma de contato. O torcedor chega até aqui
          e não consegue falar com você.
        </OwnerNudge>
      </section>
    ) : null
  }

  if (isBar) {
    return (
      <div className="onside-pub-actionbar md:hidden">
        <div className="flex items-center gap-2">
          {primary}
          {secondaries}
        </div>
      </div>
    )
  }

  return (
    <section className="onside-panel p-5 md:p-6">
      <p className="onside-kicker mb-3">Garanta seu lugar</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {primary}
        {secondaries}
      </div>
      {!whatsappUrl &&
        (isOwner ? (
          <OwnerNudge
            action={{ label: 'Liberar', to: '/admin', hash: 'admin-espaco' }}
          >
            Sem WhatsApp confirmado, você perde o contato que costuma virar mesa
            reservada.
          </OwnerNudge>
        ) : (
          <p className="mt-3 text-[var(--onside-muted)] text-xs">
            Esse bar ainda não liberou contato por WhatsApp.
          </p>
        ))}
    </section>
  )
}

function ActionButton({
  action,
  text,
  className,
  iconOnly,
  hideIcon
}: {
  action: Action
  text: string
  className: string
  iconOnly: boolean
  hideIcon: boolean
}) {
  const Icon = action.icon
  const content = (
    <>
      {!hideIcon && <Icon size={16} color="currentColor" aria-hidden="true" />}
      <span className={iconOnly ? 'sr-only' : hideIcon ? undefined : 'ml-2'}>
        {text}
      </span>
    </>
  )
  if (!action.href) {
    return (
      <button type="button" onClick={action.onClick} className={className}>
        {content}
      </button>
    )
  }
  // `tel:` abre o discador; o resto sai do app.
  const external = !action.href.startsWith('tel:')
  return (
    <a
      href={action.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={action.onClick}
      className={className}
    >
      {content}
    </a>
  )
}
