import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

import { formatPhone } from '../utils/format-phone'

const COUNTRIES = [
  { code: 'BR', name: 'Brasil', dial: '+55', flag: '🇧🇷' },
  { code: 'US', name: 'Estados Unidos', dial: '+1', flag: '🇺🇸' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colômbia', dial: '+57', flag: '🇨🇴' },
  { code: 'MX', name: 'México', dial: '+52', flag: '🇲🇽' },
  { code: 'UY', name: 'Uruguai', dial: '+598', flag: '🇺🇾' },
  { code: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪' },
  { code: 'ES', name: 'Espanha', dial: '+34', flag: '🇪🇸' },
  { code: 'DE', name: 'Alemanha', dial: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'França', dial: '+33', flag: '🇫🇷' },
  { code: 'IT', name: 'Itália', dial: '+39', flag: '🇮🇹' },
  { code: 'GB', name: 'Reino Unido', dial: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canadá', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Austrália', dial: '+61', flag: '🇦🇺' },
  { code: 'JP', name: 'Japão', dial: '+81', flag: '🇯🇵' },
  { code: 'IN', name: 'Índia', dial: '+91', flag: '🇮🇳' },
  { code: 'ZA', name: 'África do Sul', dial: '+27', flag: '🇿🇦' }
] as const

type Country = (typeof COUNTRIES)[number]

function parsePhone(stored: string): { country: Country; digits: string } {
  // longest dial codes first to avoid +1 matching +351
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
      'flex overflow-hidden rounded-xl bg-white/10 focus-within:ring-2 focus-within:ring-white/30',
    trigger:
      'flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-white/20 bg-transparent px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 focus:outline-none',
    input:
      'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none'
  },
  onboarding: {
    container:
      'flex overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 focus-within:ring-1 focus-within:ring-brand-blue/60 transition',
    trigger:
      'flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-white/10 bg-transparent px-4 py-3 text-sm text-white/70 transition hover:bg-white/5 focus:outline-none',
    input:
      'min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none'
  },
  admin: {
    container:
      'flex overflow-hidden rounded-lg bg-[#fafafa] focus-within:shadow-[0_0_0_2px_rgba(30,107,255,0.3)]',
    trigger:
      'flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-zinc-200 bg-transparent px-3 py-[0.625rem] text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 focus:outline-none',
    input:
      'min-w-0 flex-1 bg-transparent px-3 py-[0.625rem] text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 outline-none'
  }
}

type Props = {
  defaultValue?: string
  onChange: (phone: string) => void
  variant?: keyof typeof variants
  placeholder?: string
}

export function PhoneInput({
  defaultValue = '',
  onChange,
  variant = 'dark',
  placeholder = '(11) 9 1234-5678'
}: Props) {
  const parsed = parsePhone(defaultValue)
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    parsed.country
  )
  const [digits, setDigits] = useState(parsed.digits)

  const s = variants[variant]

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
        <DropdownMenuTrigger className={s.trigger}>
          <span>{selectedCountry.flag}</span>
          <span>{selectedCountry.dial}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            color="currentColor"
            strokeWidth={2}
            className="opacity-60"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-60 w-72 overflow-y-auto">
          {COUNTRIES.map((country) => (
            <DropdownMenuItem
              key={country.code}
              onClick={() => handleCountryChange(country)}
            >
              <span>{country.flag}</span>
              <span className="flex-1">{country.name}</span>
              <span className="text-zinc-400">{country.dial}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        type="tel"
        value={formatPhone(digits, selectedCountry.code)}
        onChange={handleDigitsChange}
        placeholder={placeholder}
        autoComplete="tel-national"
        className={s.input}
      />
    </div>
  )
}
