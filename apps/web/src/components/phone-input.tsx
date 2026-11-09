import { useEffect, useState } from 'react'

import { formatPhone } from '../utils/format-phone'

/**
 * Só Brasil (WEB-115): o bar é no Brasil — o geocoding já restringe a
 * `countrycodes=br` — e o servidor recusa telefone sem +55. O seletor de 18
 * países que ficava aqui só oferecia opções que seriam sempre recusadas.
 */
const DDI = '+55'

/** Aceita o gravado (`+5511…`) e o legado sem código de país (`11…`). */
function nationalDigits(stored: string): string {
  return stored.replace(/^\+55/, '').replace(/\D/g, '').slice(0, 11)
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
  const [digits, setDigits] = useState(nationalDigits(defaultValue))

  useEffect(() => {
    setDigits(nationalDigits(defaultValue))
  }, [defaultValue])

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDigits = e.target.value.replace(/\D/g, '').slice(0, 11)
    setDigits(newDigits)
    onChange(newDigits ? `${DDI}${newDigits}` : '')
  }

  return (
    <div className={TONE_CLASS[tone]} data-invalid={invalid || undefined}>
      <span className="onside-field-part onside-field-part-lead">{DDI}</span>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        value={formatPhone(digits, 'BR')}
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
