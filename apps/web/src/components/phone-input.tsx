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

const variants = {
  dark: {
    container:
      'flex min-h-12 overflow-hidden border border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] focus-within:border-[var(--onside-live)]',
    trigger:
      'flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 border-r border-[rgb(241_238_230_/_20%)] bg-transparent px-3 py-3 text-sm text-[color-mix(in_srgb,var(--onside-paper)_72%,transparent)] transition-colors hover:bg-[rgb(241_238_230_/_6%)]',
    input:
      'min-h-12 min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)] outline-none'
  },
  onboarding: {
    container:
      'flex min-h-12 overflow-hidden border border-[rgb(241_238_230_/_28%)] bg-[rgb(241_238_230_/_6%)] focus-within:border-[var(--onside-live)]',
    trigger:
      'flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 border-r border-[rgb(241_238_230_/_20%)] bg-transparent px-4 py-3 text-sm text-[color-mix(in_srgb,var(--onside-paper)_72%,transparent)] transition-colors hover:bg-[rgb(241_238_230_/_6%)]',
    input:
      'min-h-12 min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-[var(--onside-paper)] placeholder:text-[rgb(241_238_230_/_40%)] outline-none'
  },
  admin: {
    container:
      'flex min-h-12 overflow-hidden border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] focus-within:border-[var(--onside-live)] focus-within:shadow-[0_0_0_2px_rgb(232_50_12_/_25%)]',
    trigger:
      'flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--onside-line)] bg-transparent px-3 py-3 text-sm font-semibold text-[var(--onside-muted)] transition-colors hover:bg-[var(--onside-stone)]',
    input:
      'min-h-12 min-w-0 flex-1 bg-transparent px-3 py-3 text-base font-semibold text-[var(--onside-ink)] placeholder:text-[var(--onside-muted)] outline-none'
  },
  onside: {
    container:
      'flex min-h-12 overflow-hidden border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] focus-within:border-[var(--onside-live)]',
    trigger:
      'flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--onside-line)] bg-transparent px-3 py-3 text-sm text-[var(--onside-muted)]',
    input:
      'min-h-12 min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-[var(--onside-ink)] placeholder:text-[var(--onside-muted)] outline-none'
  }
}

type Props = {
  defaultValue?: string
  id?: string
  name?: string
  onChange: (phone: string) => void
  variant?: keyof typeof variants
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
  variant = 'dark',
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

  const s = variants[variant]
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
    <div className={s.container}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Código do país: ${selectedCountry.name} ${selectedCountry.dial}`}
          className={s.trigger}
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
        className={s.input}
      />
    </div>
  )
}
