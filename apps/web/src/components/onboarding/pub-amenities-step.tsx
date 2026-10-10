import { AmenityChecklist } from '@/components/pub-profile/amenity-checklist'

type Props = {
  amenities: number[]
  onToggleAmenity: (id: number) => void
  screenCount: number | null
  onScreenCountChange: (value: number | null) => void
  description: string
  onDescriptionChange: (value: string) => void
  error?: string
}

/**
 * O passo opcional do cadastro do bar.
 *
 * A ordem é deliberada: o checklist vem primeiro e o texto livre depois. Um
 * bar que só tinha a caixa de texto escrevia "telas grandes e comida boa" —
 * duas características em prosa, num campo que ninguém consegue exibir bem.
 * Marcando primeiro, o texto sobra para o que o checklist não cobre.
 *
 * Nada aqui é obrigatório, e o passo é pulável de propósito: o cadastro que
 * importa terminou no passo anterior.
 */
export function PubAmenitiesStep({
  amenities,
  onToggleAmenity,
  screenCount,
  onScreenCountChange,
  description,
  onDescriptionChange,
  error
}: Props) {
  return (
    <div className="max-w-xl space-y-6">
      <AmenityChecklist
        idPrefix="onboarding"
        selected={amenities}
        onToggle={onToggleAmenity}
        screenCount={screenCount}
        onScreenCountChange={onScreenCountChange}
      />

      <div>
        <label
          htmlFor="pub-description"
          className="onside-label text-[color-mix(in_srgb,var(--onside-paper)_70%,transparent)]"
        >
          Mais alguma coisa? (opcional)
        </label>
        <textarea
          id="pub-description"
          name="description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Ex: mesa de sinuca no fundo e happy hour até as 20h nos dias de jogo"
          rows={3}
          maxLength={500}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'pub-description-error' : undefined}
          className="onside-textarea border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)]"
        />
        {error ? (
          <p
            id="pub-description-error"
            className="onside-field-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
