import { PhoneInput } from '@/components/phone-input'

type Props = {
  name: string
  address: string
  neighborhood: string
  city: string
  phone: string
  description: string
  onChange: (field: string, value: string) => void
  errors?: Partial<
    Record<
      'name' | 'address' | 'neighborhood' | 'city' | 'phone' | 'description',
      string
    >
  >
}

const fieldClass =
  'onside-input border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)]'
const labelClass =
  'onside-label text-[color-mix(in_srgb,var(--onside-paper)_70%,transparent)]'

export function PubInfoForm({
  name,
  address,
  neighborhood,
  city,
  phone,
  description,
  onChange,
  errors = {}
}: Props) {
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <label htmlFor="pub-name" className={labelClass}>
          Nome do estabelecimento *
        </label>
        <input
          id="pub-name"
          name="name"
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Ex: Bar do Zé"
          autoComplete="organization"
          required
          maxLength={120}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'pub-name-error' : undefined}
          className={fieldClass}
        />
        {errors.name ? (
          <p id="pub-name-error" className="onside-field-error" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pub-address" className={labelClass}>
          Endereço *
        </label>
        <input
          id="pub-address"
          name="address"
          value={address}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Ex: Rua Aspicuelta, 123"
          autoComplete="address-line1"
          required
          maxLength={200}
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={errors.address ? 'pub-address-error' : undefined}
          className={fieldClass}
        />
        {errors.address ? (
          <p id="pub-address-error" className="onside-field-error" role="alert">
            {errors.address}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="pub-neighborhood" className={labelClass}>
            Bairro *
          </label>
          <input
            id="pub-neighborhood"
            name="neighborhood"
            value={neighborhood}
            onChange={(e) => onChange('neighborhood', e.target.value)}
            placeholder="Ex: Vila Madalena"
            autoComplete="address-level3"
            required
            maxLength={100}
            aria-invalid={errors.neighborhood ? true : undefined}
            aria-describedby={
              errors.neighborhood ? 'pub-neighborhood-error' : undefined
            }
            className={fieldClass}
          />
          {errors.neighborhood ? (
            <p
              id="pub-neighborhood-error"
              className="onside-field-error"
              role="alert"
            >
              {errors.neighborhood}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label htmlFor="pub-city" className={labelClass}>
            Cidade
          </label>
          <input
            id="pub-city"
            name="city"
            value={city}
            onChange={(e) => onChange('city', e.target.value)}
            placeholder="São Paulo"
            autoComplete="address-level2"
            maxLength={100}
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'pub-city-error' : undefined}
            className={fieldClass}
          />
          {errors.city ? (
            <p id="pub-city-error" className="onside-field-error" role="alert">
              {errors.city}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="pub-phone" className={labelClass}>
          Telefone
        </label>
        <PhoneInput
          id="pub-phone"
          name="phone"
          defaultValue={phone}
          onChange={(p) => onChange('phone', p)}
          variant="onboarding"
          invalid={Boolean(errors.phone)}
          describedBy={errors.phone ? 'pub-phone-error' : undefined}
        />
        {errors.phone ? (
          <p id="pub-phone-error" className="onside-field-error" role="alert">
            {errors.phone}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pub-description" className={labelClass}>
          Descrição
        </label>
        <textarea
          id="pub-description"
          name="description"
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Ex: Bar esportivo com 4 TVs e transmissão de todos os jogos"
          rows={3}
          maxLength={500}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description ? 'pub-description-error' : undefined
          }
          className="onside-textarea border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)]"
        />
        {errors.description ? (
          <p
            id="pub-description-error"
            className="onside-field-error"
            role="alert"
          >
            {errors.description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
