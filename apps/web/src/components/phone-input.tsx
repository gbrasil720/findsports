import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
import { useEffect, useState } from 'react'
import ChevronDown from 'reicon-react/icons/ChevronDown'

import { formatPhone } from '../utils/format-phone'

const COUNTRIES = [
  { code: 'BR', name: 'Brasil', dial: '+55' },
  { code: 'NANP', name: 'EUA / Canadá', dial: '+1' },
  { code: 'PT', name: 'Portugal', dial: '+351' },
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'CO', name: 'Colômbia', dial: '+57' },
  { code: 'MX', name: 'México', dial: '+52' },
  { code: 'UY', name: 'Uruguai', dial: '+598' },
  { code: 'PE', name: 'Peru', dial: '+51' },
  { code: 'ES', name: 'Espanha', dial: '+34' },
  { code: 'DE', name: 'Alemanha', dial: '+49' },
  { code: 'FR', name: 'França', dial: '+33' },
  { code: 'IT', name: 'Itália', dial: '+39' },
  { code: 'GB', name: 'Reino Unido', dial: '+44' },
  { code: 'AU', name: 'Austrália', dial: '+61' },
  { code: 'JP', name: 'Japão', dial: '+81' },
  { code: 'IN', name: 'Índia', dial: '+91' },
  { code: 'ZA', name: 'África do Sul', dial: '+27' }
] as const

type Country = (typeof COUNTRIES)[number]

function parsePhone(stored: string): { country: Country; digits: string } {
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of sorted) {
    if (stored.startsWith(c.dial)) {
      return { country: c, digits: stored.slice(c.dial.length) }
    }
  }
  return { country: COUNTRIES[0], digits: stored.replace(/\D/g, '') }
}

/**
 * Tom da superfície, e só isso.
 *
 * Eram quatro conjuntos de classes (`dark`, `onboarding`, `admin`, `onside`)
 * para dois desenhos: dois deles nunca foram usados e os dois usados
 * diferiam em 4px de padding. Cada conjunto trazia a própria borda, sombra e
 * regra de foco, e o campo acendia três indicadores ao mesmo tempo — o anel
 * do invólucro, a divisória interna e o outline do input ou do gatilho.
 *
 * Agora o desenho inteiro mora em `.onside-field-composite` (ver
 * `app-primitives.css`), que aplica a política única de foco: o invólucro
 * desenha o anel uma vez, os controles internos calam o próprio.
 */
export type PhoneInputTone = 'paper' | 'ink'

const TONE_CLASS: Record<PhoneInputTone, string> = {
  paper: 'onside-field-composite',
  ink: 'onside-field-composite onside-field-composite-ink'
}

type Props = {
  defaultValue?: string
  id?: string
  name?: string
  onChange: (phone: string) => void
  tone?: PhoneInputTone
  placeholder?: string
  required?: boolean
  invalid?: boolean
  describedBy?: string
}

export function PhoneInput({
  defaultValue = '',
  id,
  name,
  onChange,
  tone = 'ink',
  placeholder = '(11) 9 1234-5678',
  required,
  invalid,
  describedBy
}: Props) {
  const parsed = parsePhone(defaultValue)
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    parsed.country
  )
  const [digits, setDigits] = useState(parsed.digits)

  useEffect(() => {
    const next = parsePhone(defaultValue)
    setSelectedCountry(next.country)
    setDigits(next.digits)
  }, [defaultValue])

  const formatCode =
    selectedCountry.code === 'NANP' ? 'US' : selectedCountry.code

  const handleCountryChange = (country: Country) => {
    setSelectedCountry(country)
    onChange(digits ? `${country.dial}${digits}` : '')
  }

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const max = selectedCountry.code === 'BR' ? 11 : 15
    const newDigits = e.target.value.replace(/\D/g, '').slice(0, max)
    setDigits(newDigits)
    onChange(newDigits ? `${selectedCountry.dial}${newDigits}` : '')
  }

  return (
    <div className={TONE_CLASS[tone]} data-invalid={invalid || undefined}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Código do país: ${selectedCountry.name} ${selectedCountry.dial}`}
          className="onside-field-part onside-field-part-lead"
        >
          <span className="font-[family-name:var(--onside-mono)] text-xs font-bold tracking-wide">
            {selectedCountry.code === 'NANP' ? '+1' : selectedCountry.code}
          </span>
          <span>{selectedCountry.dial}</span>
          <ChevronDown
            size={12}
            color="currentColor"
            className="opacity-60"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="onside-menu max-h-60 w-72 overflow-y-auto p-0">
          <DropdownMenuGroup>
            {COUNTRIES.map((country) => (
              <DropdownMenuItem
                key={country.code}
                onClick={() => handleCountryChange(country)}
                className="rounded-none"
              >
                <span className="font-[family-name:var(--onside-mono)] text-xs font-bold">
                  {country.code === 'NANP' ? '+1' : country.code}
                </span>
                <span className="flex-1">{country.name}</span>
                <span className="text-[var(--onside-muted)]">
                  {country.dial}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        value={formatPhone(digits, formatCode)}
        onChange={handleDigitsChange}
        placeholder={placeholder}
        autoComplete="tel-national"
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="onside-field-part onside-field-part-grow"
      />
    </div>
  )
}
