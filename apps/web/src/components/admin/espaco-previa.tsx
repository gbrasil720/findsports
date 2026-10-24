import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { normalizeHouseOffer } from '@findsports_oficial/db/house-offer'
import { Chip, Icone } from '@/components/painel'
import {
  compareEventStartsAscending,
  getEventTemporalState
} from '@/domain/events'
import type { AdminEvent } from './admin-model'
import { abertoAte, horarioDoRascunho, type Rascunho } from './espaco-model'

const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit'
})

type Props = {
  rascunho: Rascunho
  photoUrl: string | null
  /** Elite em dia: selo e oferta da casa, como o torcedor vê. */
  elite: boolean
  /** Jogos do bar; `null` enquanto carregam. */
  events: AdminEvent[] | null
  /** "% voltariam" público (acima do piso); `null` quando não aparece. */
  nota: number | null
  now: Date
}

/**
 * "Como o torcedor vê" (2c/2d): a página do bar no app, escura como o app,
 * montada do rascunho. Não age: é só desenho.
 */
export function EspacoPrevia(props: Props) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="font-bold text-[15px]">Como o torcedor vê</h2>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Prévia</legend>
          <Chip ativo check={false} aria-pressed>
            Página
          </Chip>
          <Chip disabled title="Em breve">
            Card <span className="sr-only">(em breve)</span>
          </Chip>
          <Chip disabled title="Em breve">
            Mapa <span className="sr-only">(em breve)</span>
          </Chip>
        </fieldset>
      </div>
      <TelaDoApp {...props} />
      <p className="max-w-[300px] text-center text-[12.5px] text-[var(--painel-muted)]">
        Atualiza enquanto você edita. O que não estiver salvo aparece só aqui.
      </p>
    </div>
  )
}

function TelaDoApp({ rascunho, photoUrl, elite, events, nota, now }: Props) {
  const nome = rascunho.name.trim() || 'Seu bar'
  const linha = [
    rascunho.neighborhood.trim(),
    abertoAte(horarioDoRascunho(rascunho.hours), now),
    nota !== null ? `${nota}% voltariam` : null
  ]
    .filter(Boolean)
    .join(' · ')
  const etiquetas = [
    ...rascunho.amenities
      .map((id) => findAmenity(id)?.label.split(' / ')[0])
      .filter((label): label is string => Boolean(label))
      .slice(0, rascunho.screenCount ? 2 : 3),
    ...(rascunho.screenCount
      ? [
          `${rascunho.screenCount} ${rascunho.screenCount === 1 ? 'tela' : 'telas'}`
        ]
      : [])
  ]
  const oferta = elite ? normalizeHouseOffer(rascunho.houseOffer) : null
  const jogos = (events ?? [])
    .filter((e) => getEventTemporalState(e.startsAt, e.endsAt, now) !== 'past')
    .sort(compareEventStartsAscending)
    .slice(0, 2)

  return (
    <div
      inert
      aria-label={`Prévia da página de ${nome} no app`}
      role="img"
      className="w-[340px] max-w-full rounded-[34px] bg-black p-2.5 shadow-[0_30px_50px_-25px_rgb(18_18_15/60%)]"
    >
      <div className="relative flex h-[640px] flex-col overflow-hidden rounded-[26px] bg-[#12120f] text-[#f1eee6]">
        <div
          className="relative h-[200px] flex-none bg-[#262621] bg-center bg-cover"
          style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {}}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_18_15/0%)_40%,#12120f)]" />
          <div className="absolute inset-x-3.5 top-3.5 flex justify-between">
            <span className="grid size-[34px] place-items-center rounded-full bg-[rgb(36_36_32/50%)]">
              <Icone nome="back" tamanho={14} acento="#f1eee6" />
            </span>
            <span className="grid size-[34px] place-items-center rounded-full bg-[rgb(36_36_32/50%)]">
              <Icone nome="heart" tamanho={16} acento="#c9f135" />
            </span>
          </div>
        </div>
        <div className="relative -mt-[26px] flex min-h-0 flex-col gap-3 px-4">
          {elite ? (
            <div className="flex gap-1.5">
              <span className="rounded-[3px] bg-[#c9f135] px-[7px] py-[3px] font-bold text-[#12120f] text-[11px] leading-tight">
                Elite
              </span>
            </div>
          ) : null}
          <p className="painel-disp break-words [--painel-disp-size:40px]">
            {nome}
          </p>
          {linha ? <p className="text-[#aaa9a4] text-[13px]">{linha}</p> : null}
          {etiquetas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((etiqueta) => (
                <span
                  key={etiqueta}
                  className="rounded-[4px] px-2 py-[5px] font-semibold text-[11.5px] shadow-[inset_0_0_0_1px_rgb(241_238_230/18%)]"
                >
                  {etiqueta}
                </span>
              ))}
            </div>
          ) : null}
          {oferta ? (
            <div className="flex items-center gap-2.5 rounded-[7px] bg-[#c9f135] px-3.5 py-3 text-[#12120f] shadow-[3px_3px_0_#000]">
              <Icone nome="ticket" tamanho={22} acento="#12120f" />
              <div className="min-w-0">
                <b className="text-[13.5px]">Oferta da casa</b>
                <p className="text-[12px] [overflow-wrap:anywhere]">{oferta}</p>
              </div>
            </div>
          ) : null}
          {jogos.length ? (
            <>
              <b className="mt-0.5 text-[14px]">Jogos aqui</b>
              {jogos.map((jogo) => (
                <div
                  key={jogo.id}
                  className="flex items-center gap-3 rounded-[7px] bg-[#1c1c18] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(241_238_230/9%)]"
                >
                  <span className="painel-disp [--painel-disp-size:22px]">
                    {HORA.format(new Date(jogo.startsAt))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13px]">
                      {gameTitle(jogo)}
                    </b>
                    <span className="block truncate text-[#aaa9a4] text-[11.5px]">
                      {jogo.championship}
                    </span>
                  </div>
                  {getEventTemporalState(jogo.startsAt, jogo.endsAt, now) ===
                  'live' ? (
                    <span className="rounded-[3px] bg-[#e8320c] px-[7px] py-[3px] font-bold text-[11px] text-white">
                      Ao vivo
                    </span>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}
        </div>
        <div className="absolute inset-x-3.5 bottom-4 flex h-[50px] items-center justify-center rounded-full bg-[#c9f135] font-bold text-[#12120f] text-[14.5px] shadow-[0_3px_0_#000]">
          Vou assistir aqui
        </div>
      </div>
    </div>
  )
}
