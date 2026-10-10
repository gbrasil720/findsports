import {
  AMENITIES,
  AMENITY_GROUPS,
  MAX_SCREEN_COUNT,
  motivoTelasInvalido,
  RESERVATIONS_AMENITY_ID
} from '@findsports_oficial/api/lib/amenities'
import Check from 'reicon-react/icons/Check'

type Props = {
  selected: number[]
  onToggle: (id: number) => void
  screenCount: number | null
  onScreenCountChange: (value: number | null) => void
  idPrefix: string
  /**
   * O bar recebe reservas pela Onside agora (interruptor ligado e Elite
   * vigente). Sem isso o perfil não mostra "Aceita reserva", e o item diz por
   * quê em vez de sumir: o que o dono marca continua gravado.
   */
  receivesReservations: boolean
}

/**
 * O checklist de características, usado no onboarding e no `/admin`.
 *
 * Só existe na variante escura porque os dois lugares que o usam são escuros
 * — o passo do onboarding e o `PubHeroSection`. Uma variante clara agora
 * seria código sem chamador.
 *
 * Cada item é um `button` com `aria-pressed`, e não um `input[type=checkbox]`
 * escondido: o alvo de toque é a caixa inteira, o que importa porque este é o
 * passo que o dono do bar preenche no celular, no balcão.
 */
export function AmenityChecklist({
  selected,
  onToggle,
  screenCount,
  onScreenCountChange,
  idPrefix,
  receivesReservations
}: Props) {
  const isOn = (id: number) => selected.includes(id)
  const reservationsLabelId = `${idPrefix}-reservations-label`
  const reservationsHintId = `${idPrefix}-reservations-hint`
  const screenCountError = motivoTelasInvalido(screenCount)

  return (
    <div className="space-y-5">
      {AMENITY_GROUPS.map((group) => (
        <fieldset key={group.key} className="min-w-0">
          <legend className="mb-2 font-[family-name:var(--onside-mono)] text-[10px] text-[color-mix(in_srgb,var(--onside-paper)_55%,transparent)] uppercase tracking-[0.16em]">
            {group.label}
          </legend>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AMENITIES.filter((amenity) => amenity.group === group.key).map(
              (amenity) => {
                const on = isOn(amenity.id)
                const hidden =
                  amenity.id === RESERVATIONS_AMENITY_ID &&
                  !receivesReservations

                return (
                  <button
                    key={amenity.id}
                    type="button"
                    aria-pressed={on}
                    // O aviso fica dentro do botão, mas é descrição: o nome
                    // do item continua sendo só o rótulo.
                    aria-labelledby={hidden ? reservationsLabelId : undefined}
                    aria-describedby={hidden ? reservationsHintId : undefined}
                    onClick={() => onToggle(amenity.id)}
                    className={`flex min-h-11 items-center gap-2.5 border px-3 py-2 text-left text-sm transition-colors ${
                      on
                        ? 'border-[var(--onside-acid)] bg-[color-mix(in_srgb,var(--onside-acid)_14%,transparent)] text-[var(--onside-paper)]'
                        : 'border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[color-mix(in_srgb,var(--onside-paper)_72%,transparent)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-5 shrink-0 place-items-center border ${
                        on
                          ? 'border-[var(--onside-acid)] bg-[var(--onside-acid)]'
                          : 'border-[rgb(241_238_230_/_35%)]'
                      }`}
                    >
                      {on ? (
                        <Check size={13} color="var(--onside-ink)" />
                      ) : null}
                    </span>
                    {hidden ? (
                      <span className="min-w-0">
                        <span id={reservationsLabelId}>{amenity.label}</span>
                        <span
                          id={reservationsHintId}
                          className="mt-0.5 block text-[color-mix(in_srgb,var(--onside-paper)_55%,transparent)] text-xs leading-snug"
                        >
                          Aparece no perfil quando o bar recebe reservas pela
                          Onside (plano Elite).
                        </span>
                      </span>
                    ) : (
                      <span className="min-w-0">{amenity.label}</span>
                    )}
                  </button>
                )
              }
            )}
          </div>

          {group.key === 'watch' ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3">
              <label
                htmlFor={`${idPrefix}-screen-count`}
                className="text-[color-mix(in_srgb,var(--onside-paper)_72%,transparent)] text-sm"
              >
                Quantas telas?
              </label>
              <input
                id={`${idPrefix}-screen-count`}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_SCREEN_COUNT}
                value={screenCount ?? ''}
                placeholder="—"
                // O número vai como foi digitado, sem arredondar nem limitar:
                // quem diz o que corrigir é a mensagem abaixo, e quem usa o
                // checklist barra o envio com a mesma regra (WEB-280).
                onChange={(e) =>
                  onScreenCountChange(
                    e.target.value === '' ? null : Number(e.target.value)
                  )
                }
                aria-invalid={screenCountError ? true : undefined}
                aria-describedby={
                  screenCountError
                    ? `${idPrefix}-screen-count-error`
                    : undefined
                }
                className="onside-input w-24 border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)]"
              />
              {screenCountError ? (
                <p
                  id={`${idPrefix}-screen-count-error`}
                  className="onside-field-error w-full"
                  role="alert"
                >
                  {screenCountError}
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      ))}

      <p className="text-[color-mix(in_srgb,var(--onside-paper)_50%,transparent)] text-xs leading-relaxed">
        Você declara que seu bar oferece o que marcar aqui. A Onside não
        verifica essas informações — elas aparecem no seu perfil como declaradas
        por você.
      </p>
    </div>
  )
}
