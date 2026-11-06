import type { ReactNode } from 'react'
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
  /** "Vou assistir aqui" do jogo em destaque (WEB-127). Só no painel. */
  presence?: ReactNode
}

type Action = {
  key: string
  icon: typeof Chat
  /** Texto quando é a ação principal. */
  label: string
  /** Texto quando desce para secundária. */
  shortLabel: string
  /** Sem clique, o item só informa: vira botão desabilitado. */
  onClick?: () => void
  href?: string
}

/**
 * As três ações que a página inteira serve — falar, chegar, ligar.
 *
 * O WhatsApp é o primário porque é o único que devolve resposta ("tem mesa?").
 * Quando o bar não deixou WhatsApp, a rota assume o primário em vez de sobrar
 * um botão desabilitado: o torcedor não tem culpa do cadastro incompleto, e um
 * botão morto vale menos que um botão que leva.
 */
export function BarActions({
  whatsappUrl,
  directionsUrl,
  phone,
  onWhatsApp,
  onDirections,
  onPhone,
  presence,
  variant,
  isOwner
}: BarActions & { variant: 'panel' | 'bar'; isOwner: boolean }) {
  const isBar = variant === 'bar'

  // Em ordem de preferência: a primeira disponível é a principal, as outras
  // descem para secundárias. Telefone nunca é principal.
  const candidates: (Action | false | '' | null)[] = [
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
  ]
  const [primaryAction, ...otherActions] = candidates.filter(
    (action): action is Action => Boolean(action)
  )

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

  // Na barra fixa do celular, três botões com texto não cabem (em 390px o
  // "Falar com o bar" estourava o terço dele e espremia os ícones, WEB-370):
  // com dois secundários ou mais eles ficam só com ícone (o nome segue para
  // leitor de tela).
  const compact = isBar && secondaryActions.length > 1

  const primary = primaryAction ? (
    <ActionButton
      action={primaryAction}
      text={
        isBar && !primaryAction.onClick
          ? primaryAction.shortLabel
          : primaryAction.label
      }
      className={`onside-btn onside-btn-acid flex-1${primaryAction.onClick ? ' whitespace-nowrap' : ''}`}
      iconOnly={false}
      hideIcon={compact}
    />
  ) : null

  const secondaries = secondaryActions.map((action) => (
    <ActionButton
      key={action.key}
      action={action}
      text={action.shortLabel}
      className={`onside-btn onside-btn-outline${compact ? ' onside-pub-actionbar-icon' : ''}`}
      iconOnly={compact}
      hideIcon={false}
    />
  ))

  // "Fale com o bar" só com WhatsApp ou telefone: sobrando a rota, o título
  // é ela.
  const title =
    !whatsappUrl && !phone && directionsUrl ? 'Como chegar' : 'Fale com o bar'

  // Bar sem contato nenhum e sem coordenada não tem ação a oferecer — mas o
  // dono ainda precisa saber que a página chegou nesse estado.
  if (!primary && !phone && !presence) {
    return isOwner && !isBar ? (
      <section className="onside-panel p-5 md:p-6">
        <p className="onside-kicker">{title}</p>
        <OwnerNudge action={{ label: 'Completar', to: '/admin/meu-espaco' }}>
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

  // No celular estes botões já estão na barra presa ao pé da janela (a
  // variante `bar`, abaixo de `md`), e os dois apareciam juntos na primeira
  // tela (WEB-370). Lá o painel fica só com o que a barra não tem: a presença
  // e o aviso do WhatsApp. Sem nenhum dos dois, some inteiro.
  const onlyButtons = !presence && Boolean(whatsappUrl)

  return (
    <section
      className={`onside-panel p-5 md:p-6${onlyButtons ? ' max-md:hidden' : ''}`}
    >
      <div className="max-md:hidden">
        <p className="onside-kicker">{title}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {primary}
          {secondaries}
        </div>
      </div>
      {presence && <div className="md:mt-4">{presence}</div>}
      {!whatsappUrl &&
        (isOwner ? (
          <OwnerNudge action={{ label: 'Liberar', to: '/admin/meu-espaco' }}>
            Sem WhatsApp confirmado, você perde o contato de quem quer saber se
            tem mesa.
          </OwnerNudge>
        ) : (
          <p
            className={`${presence ? 'mt-3' : 'md:mt-3'} text-[var(--onside-muted)] text-xs`}
          >
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
      <button
        type="button"
        onClick={action.onClick}
        disabled={!action.onClick}
        className={className}
      >
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
