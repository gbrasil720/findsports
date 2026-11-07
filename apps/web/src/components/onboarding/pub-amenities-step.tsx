import {
  AMENITIES,
  AMENITY_GROUPS,
  HOUSE_OFFER_AMENITY_ID,
  MAX_SCREEN_COUNT,
  motivoTelasInvalido
} from '@findsports_oficial/api/lib/amenities'
import { Check, Tv } from '@/components/landing/v3/icons'

type Props = {
  amenities: number[]
  onToggleAmenity: (id: number) => void
  screenCount: number | null
  onScreenCountChange: (value: number | null) => void
}

/**
 * "Com oferta da casa" não está entre os itens: não é escolha do bar, é o
 * filtro da busca para quem é Elite e tem oferta cadastrada.
 */
const ITENS = AMENITIES.filter(({ id }) => id !== HOUSE_OFFER_AMENITY_ID)

/**
 * O passo opcional do cadastro do bar (WEB-501): quantas telas e o que o bar
 * tem, em chips por grupo. Nada aqui é obrigatório, e o passo é pulável: o
 * cadastro que importa terminou no passo anterior.
 */
export function PubAmenitiesStep({
  amenities,
  onToggleAmenity,
  screenCount,
  onScreenCountChange
}: Props) {
  const screenError = motivoTelasInvalido(screenCount)
  const screens = screenCount ?? 0

  return (
    <>
      <div className="ob-sw ob-sw-card">
        <Tv size={20} />
        <span className="ob-sw-tx">
          <label htmlFor="onboarding-screen-count">Quantas telas?</label>
          <span>TVs, telão e projetor, somados.</span>
        </span>
        <span className="ob-stepper">
          <button
            type="button"
            aria-label="Uma tela a menos"
            disabled={screens <= 0}
            onClick={() => onScreenCountChange(screens - 1)}
          >
            −
          </button>
          <input
            id="onboarding-screen-count"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SCREEN_COUNT}
            value={screenCount ?? ''}
            placeholder="—"
            // O número vai como foi digitado: quem diz o que corrigir é a
            // mensagem abaixo, e o botão do passo barra com a mesma regra (WEB-280).
            onChange={(e) =>
              onScreenCountChange(
                e.target.value === '' ? null : Number(e.target.value)
              )
            }
            aria-invalid={screenError ? true : undefined}
            aria-describedby={
              screenError ? 'onboarding-screen-count-error' : undefined
            }
          />
          <button
            type="button"
            aria-label="Uma tela a mais"
            disabled={screens >= MAX_SCREEN_COUNT}
            onClick={() => onScreenCountChange(screens + 1)}
          >
            +
          </button>
        </span>
      </div>
      {screenError ? (
        <p
          id="onboarding-screen-count-error"
          className="onside-field-error"
          role="alert"
        >
          {screenError}
        </p>
      ) : null}

      {AMENITY_GROUPS.map((group) => (
        <fieldset key={group.key} className="ob-cg">
          <legend>{group.label}</legend>
          <div className="ob-chips">
            {ITENS.filter((amenity) => amenity.group === group.key).map(
              (amenity) => {
                const on = amenities.includes(amenity.id)
                return (
                  <button
                    key={amenity.id}
                    type="button"
                    className="ob-tchip"
                    aria-pressed={on}
                    onClick={() => onToggleAmenity(amenity.id)}
                  >
                    {on ? <Check size={15} /> : null}
                    {amenity.label}
                  </button>
                )
              }
            )}
          </div>
        </fieldset>
      ))}

      <p className="ob-note">
        Você declara que seu bar oferece o que marcar aqui. A Onside não
        verifica essas informações: elas aparecem no seu perfil como declaradas
        por você.
      </p>
    </>
  )
}
