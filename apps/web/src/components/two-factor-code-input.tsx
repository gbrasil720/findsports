import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot
} from '@findsports_oficial/ui/components/input-otp'

const OTP_SLOTS = [
  { id: 'otp-slot-1', index: 0 },
  { id: 'otp-slot-2', index: 1 },
  { id: 'otp-slot-3', index: 2 },
  { id: 'otp-slot-4', index: 3 },
  { id: 'otp-slot-5', index: 4 },
  { id: 'otp-slot-6', index: 5 }
] as const

export function TwoFactorCodeInput({
  id,
  value,
  onChange,
  onComplete,
  invalid = false,
  autoFocus = false,
  disabled = false
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  invalid?: boolean
  autoFocus?: boolean
  disabled?: boolean
}) {
  return (
    <InputOTP
      id={id}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      pattern="^[0-9]+$"
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-invalid={invalid}
      autoFocus={autoFocus}
      disabled={disabled}
      required
      containerClassName="w-full"
    >
      <InputOTPGroup className="grid w-full grid-cols-6 gap-1.5 sm:gap-2">
        {OTP_SLOTS.map((slot) => (
          <InputOTPSlot
            key={slot.id}
            index={slot.index}
            aria-invalid={invalid}
            className="h-12 w-full border border-[var(--onside-ink)] bg-[var(--onside-paper)] font-bold font-[family-name:var(--onside-mono)] text-lg shadow-none transition-[background-color,border-color,box-shadow] first:border-l data-[active=true]:border-[var(--onside-ink)] data-[active=true]:bg-[var(--onside-acid)] data-[active=true]:ring-0 data-[active=true]:shadow-[3px_3px_0_var(--onside-ink)] sm:h-14 sm:text-xl"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
