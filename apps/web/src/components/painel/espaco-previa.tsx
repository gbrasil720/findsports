import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  formatAverageSpend,
  menuUrlHost
} from '@findsports_oficial/db/bar-menu'
import { toast } from 'sonner'
import type { AdminBar, EventsState } from '@/components/admin/admin-model'
import { Beer, Pin } from '@/components/landing/v3/icons'
import { compareEventStartsAscending } from '@/domain/events'
import { juntarEndereco } from '@/lib/cep'
import { getPlan } from '@/lib/plan-catalog'
import type { Perfil } from './espaco-rascunho'
import {
  brasiliaTime,
  dayLabel,
  eventState,
  eventTitle,
  houseDay
} from './noite'

/*
 * A prévia de "Meu espaço" (protótipo `espaco`, `aside.prev`): a página do
 * bar como o torcedor vê, desenhada do rascunho, para o dono ver o que muda
 * antes de salvar. O selo e os recursos pagos seguem o plano vigente. Card e
 * Mapa ficam para depois.
 */
export function EspacoPrevia({
  bar,
  perfil,
  plano,
  oferta,
  menu,
  eventsState
}: {
  bar: AdminBar
  perfil: Perfil
  /** O plano que o torcedor vê: parado aparece como Starter (WEB-129). */
  plano: SubscriptionPlan
  oferta: string | null
  menu: { url: string | null; gasto: number | null } | null
  eventsState: EventsState
}) {
  const now = Date.now()
  const proximo =
    eventsState.status === 'ready'
      ? eventsState.events
          .filter((e) => eventState(e, now) !== 'past')
          .sort(compareEventStartsAscending)[0]
      : undefined
  const onde = [
    juntarEndereco(perfil.rua, perfil.numero),
    perfil.neighborhood.trim(),
    perfil.city.trim()
  ]
    .filter(Boolean)
    .join(' · ')
  const tags = [
    ...(perfil.screenCount
      ? [perfil.screenCount === 1 ? '1 tela' : `${perfil.screenCount} telas`]
      : []),
    ...perfil.amenities.flatMap((id) => findAmenity(id)?.label ?? [])
  ]
  const temTelefone = perfil.phone.length >= 12
  const soon = () => toast('Em breve: a prévia do card e do mapa.')

  return (
    <aside className="pn-prev" aria-label="Prévia">
      <div className="pn-tabs pn-prev-seg">
        <button type="button" aria-pressed="true">
          Página
        </button>
        <button type="button" aria-pressed="false" onClick={soon}>
          Card · em breve
        </button>
        <button type="button" aria-pressed="false" onClick={soon}>
          Mapa · em breve
        </button>
      </div>
      <div className="pn-phone">
        <div className="pn-phone-s">
          <div className={`pn-pv-img${bar.photoUrl ? '' : ' is-empty'}`}>
            {bar.photoUrl ? (
              // biome-ignore lint/performance/noImgElement: foto do armazenamento do bar, sem otimizador.
              <img src={bar.photoUrl} alt="" />
            ) : (
              <span>A foto de capa entra aqui.</span>
            )}
            {plano !== 'starter' ? (
              <em className={`pn-pv-pl is-${plano}`}>
                {getPlan(plano).name.toUpperCase()}
              </em>
            ) : null}
          </div>
          <div className="pn-pv-b">
            <b className="pn-disp">{perfil.name.trim() || 'Seu bar'}</b>
            {onde ? (
              <p className="pn-pv-where">
                <Pin size={13} />
                <span>{onde}</span>
              </p>
            ) : null}
            {proximo ? (
              <div className="pn-pv-game">
                <small>
                  {eventState(proximo, now) === 'live'
                    ? 'AO VIVO'
                    : `${dayLabel(houseDay(proximo.startsAt)).toUpperCase()} · ${brasiliaTime(proximo.startsAt)}`}
                </small>
                <span>{eventTitle(proximo)}</span>
              </div>
            ) : null}
            {perfil.description.trim() ? (
              <p className="pn-pv-about">{perfil.description.trim()}</p>
            ) : null}
            {oferta ? (
              <p className="pn-pv-offer">
                <Beer size={16} />
                <span>{oferta}</span>
              </p>
            ) : null}
            {tags.length ? (
              <div className="pn-pv-tags">
                {tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            ) : null}
            {menu && (menu.url || menu.gasto) ? (
              <p className="pn-pv-menu">
                {menu.gasto
                  ? `Gasto médio ${formatAverageSpend(menu.gasto)}`
                  : ''}
                {menu.gasto && menu.url ? ' · ' : ''}
                {menu.url ? `Cardápio em ${menuUrlHost(menu.url)}` : ''}
              </p>
            ) : null}
            <div className="pn-pv-acts" aria-hidden="true">
              {temTelefone &&
              bar.phoneAcceptsWhatsapp &&
              perfil.phone === bar.phone ? (
                <span className="is-on">WhatsApp</span>
              ) : null}
              {temTelefone ? <span>Ligar</span> : null}
              <span>Rota</span>
            </div>
          </div>
        </div>
      </div>
      <p>
        A prévia acompanha o que você digita. O torcedor vê depois de salvar; a
        foto muda na hora.
      </p>
    </aside>
  )
}
