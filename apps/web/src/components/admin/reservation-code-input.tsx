import {
  normalizeReservationCode,
  RESERVATION_CODE_LENGTH
} from '@findsports_oficial/db/reservation-code'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot
} from '@findsports_oficial/ui/components/input-otp'
import type { Ref } from 'react'

const SLOTS = Array.from({ length: RESERVATION_CODE_LENGTH }, (_, index) => ({
  id: `reservation-code-slot-${index}`,
  index
}))

// Duas metades: é assim que o código é ditado no balcão, "AB3, K9X".
const HALF = Math.ceil(RESERVATION_CODE_LENGTH / 2)
const GROUPS = [SLOTS.slice(0, HALF), SLOTS.slice(HALF)]

type Props = {
  id: string
  ref?: Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
}

/**
 * Campo do código de validação (WEB-126): uma casa por caractere, letras e
 * dígitos. Por baixo é um `<input>` só — rótulo, Enter e colar funcionam como
 * em campo comum.
 */
export function ReservationCodeInput({
  id,
  ref,
  value,
  onChange,
  invalid = false,
  disabled = false,
  describedBy
}: Props) {
  return (
    <InputOTP
      ref={ref}
      id={id}
      name="reservation-code"
      value={value}
      // Minúscula digitada vira maiúscula na casa: caixa não faz parte do
      // código.
      onChange={(next) => onChange(normalizeReservationCode(next))}
      // Código colado do WhatsApp vem com espaço ou hífen no meio.
      pasteTransformer={normalizeReservationCode}
      maxLength={RESERVATION_CODE_LENGTH}
      pattern="^[a-zA-Z0-9]+$"
      inputMode="text"
      autoComplete="off"
      autoCapitalize="characters"
      autoCorrect="off"
      enterKeyHint="search"
      // A tela tem uma tarefa só, e ela começa neste campo.
      autoFocus
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      containerClassName="gap-3"
    >
      {GROUPS.map((group) => (
        <InputOTPGroup key={group[0]?.id} className="gap-1.5">
          {group.map((slot) => (
            <InputOTPSlot
              key={slot.id}
              index={slot.index}
              aria-invalid={invalid || undefined}
              className="size-12 border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] font-[family-name:var(--onside-mono)] font-bold text-xl uppercase shadow-none transition-[background-color,border-color,box-shadow] first:border-l-[1.5px] aria-invalid:border-[var(--onside-live)] data-[active=true]:border-[var(--onside-ink)] data-[active=true]:bg-[var(--onside-acid)] data-[active=true]:shadow-[3px_3px_0_var(--onside-ink)] data-[active=true]:ring-0 sm:size-14 sm:text-2xl"
            />
          ))}
        </InputOTPGroup>
      ))}
    </InputOTP>
  )
}
