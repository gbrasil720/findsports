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
}

/**
 * As três ações que a página inteira serve — falar, chegar, ligar.
 *
 * O WhatsApp é o primário porque é o único que devolve resposta ("tem mesa?").
 * Quando o bar não deixou WhatsApp, a rota assume o primário em vez de sobrar
 * um botão desabilitado: o torcedor não tem culpa do cadastro incompleto, e um
 * botão morto vale menos que um botão que leva.
 *
 * O componente é o ponto único de troca: quando a reserva na plataforma
 * existir, ela vira o primário aqui e nada mais no layout muda.
 */
export function BarActions({
  whatsappUrl,
  directionsUrl,
  phone,
  onWhatsApp,
  onDirections,
  onPhone,
  variant,
  isOwner
}: BarActions & { variant: 'panel' | 'bar'; isOwner: boolean }) {
  const primaryIsWhatsApp = Boolean(whatsappUrl)
  const isBar = variant === 'bar'

  const primary = primaryIsWhatsApp ? (
    <a
      href={whatsappUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onWhatsApp}
      className="onside-btn onside-btn-acid min-h-12 flex-1 justify-center text-sm"
    >
      <Chat size={16} color="currentColor" aria-hidden="true" />
      <span className="ml-2">Falar com o bar</span>
    </a>
  ) : directionsUrl ? (
    <a
      href={directionsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onDirections}
      className="onside-btn onside-btn-acid min-h-12 flex-1 justify-center text-sm"
    >
      <Route size={16} color="currentColor" aria-hidden="true" />
      <span className="ml-2">Como chegar</span>
    </a>
  ) : null

  const secondaries = (
    <>
      {primaryIsWhatsApp && directionsUrl && (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDirections}
          className="onside-btn onside-btn-outline min-h-12 justify-center text-sm"
        >
          <Route size={16} color="currentColor" aria-hidden="true" />
          <span className="ml-2">Rota</span>
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={onPhone}
          className="onside-btn onside-btn-outline min-h-12 justify-center text-sm"
        >
          <Phone size={16} color="currentColor" aria-hidden="true" />
          <span className="ml-2">
            {isBar ? 'Ligar' : formatStoredPhone(phone)}
          </span>
        </a>
      )}
    </>
  )

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
      {!primaryIsWhatsApp &&
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
