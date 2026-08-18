import type { bar } from '@findsports_oficial/db/schema/platform'
import type { InferSelectModel } from 'drizzle-orm'
import Chat from 'reicon-react/icons/Chat'
import Location from 'reicon-react/icons/Location'
import Phone from 'reicon-react/icons/Phone'
import { formatStoredPhone } from '@/utils/format-phone'

// `geo` é coluna derivada de uso exclusivo do índice espacial; a API não a envia.
type Bar = Omit<InferSelectModel<typeof bar>, 'geo' | 'userId'>

type Props = {
  pub: Bar
  onOpenDirections: () => void
  onPhoneClick?: () => void
  onWhatsAppClick?: () => void
}

export function BarInfoSidebar({
  pub,
  onOpenDirections,
  onPhoneClick,
  onWhatsAppClick
}: Props) {
  const formattedPhone = formatStoredPhone(pub.phone ?? '')
  const acceptsWhatsapp = pub.phoneAcceptsWhatsapp === true
  const whatsappUrl =
    pub.phone && acceptsWhatsapp
      ? `https://wa.me/${pub.phone.replace(/\D/g, '')}`
      : null

  return (
    <aside className="space-y-6 lg:sticky lg:top-[calc(var(--banner-h,0px)+var(--onside-header-h)+16px)]">
      <section className="onside-panel p-5">
        <h3 className="onside-display mb-4 text-xl">Informações</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-2">
            <Location
              size={16}
              color="currentColor"
              className="shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
            <span className="onside-text-on-paper">
              {pub.address}, {pub.neighborhood}, {pub.city}
            </span>
          </li>
          {pub.phone && (
            <li className="flex items-start gap-2">
              <Phone
                size={16}
                color="currentColor"
                className="shrink-0 text-[var(--onside-muted)]"
                aria-hidden="true"
              />
              <a
                href={`tel:${pub.phone}`}
                onClick={() => onPhoneClick?.()}
                className="onside-text-link"
              >
                {formattedPhone}
              </a>
            </li>
          )}
          {whatsappUrl && (
            <li className="flex items-start gap-2">
              <Chat
                size={16}
                color="currentColor"
                className="shrink-0 text-[var(--onside-muted)]"
                aria-hidden="true"
              />
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onWhatsAppClick?.()}
                className="onside-text-link"
              >
                WhatsApp
              </a>
            </li>
          )}
        </ul>
      </section>

      <section className="onside-panel p-5">
        <h3 className="onside-display mb-3 text-xl">Como chegar</h3>
        <button
          type="button"
          className="onside-btn onside-btn-ghost w-full"
          onClick={onOpenDirections}
        >
          <Location size={16} color="currentColor" aria-hidden="true" />
          <span className="ml-2">Abrir no Maps</span>
        </button>
      </section>
    </aside>
  )
}
