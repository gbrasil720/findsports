import {
  AMENITIES,
  AMENITY_GROUPS,
  MAX_SCREEN_COUNT
} from '@findsports_oficial/api/lib/amenities'
import Check from 'reicon-react/icons/Check'

type Props = {
  selected: number[]
  onToggle: (id: number) => void
  screenCount: number | null
  onScreenCountChange: (value: number | null) => void
  idPrefix: string
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
  idPrefix
}: Props) {
  const isOn = (id: number) => selected.includes(id)

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

                return (
                  <button
                    key={amenity.id}
                    type="button"
                    aria-pressed={on}
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
                    <span className="min-w-0">{amenity.label}</span>
                  </button>
                )
              }
            )}
          </div>

          {group.key === 'watch' ? (
            <div className="mt-2 flex items-center gap-3">
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
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  if (raw === '') return onScreenCountChange(null)

                  const parsed = Number.parseInt(raw, 10)
                  if (Number.isNaN(parsed)) return

                  onScreenCountChange(
                    Math.min(Math.max(parsed, 0), MAX_SCREEN_COUNT)
                  )
                }}
                className="onside-input w-24 border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)]"
              />
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
