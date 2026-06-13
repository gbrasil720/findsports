import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@findsports_oficial/ui/components/input-group'
import {
  EyeIcon,
  LockPasswordIcon,
  ViewOffSlashIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AnyFieldApi } from '@tanstack/form-core'
import type { ReactNode } from 'react'

import { AUTH_INPUT_CLASS, AUTH_INPUT_GROUP_CLASS } from '@/lib/auth-styles'

interface AuthPasswordFieldProps {
  label: string
  field: AnyFieldApi
  showPassword: boolean
  onToggle: () => void
  id?: string
  placeholder?: string
  autoComplete?: string
  required?: boolean
  extraLabel?: ReactNode
}

export function AuthPasswordField({
  label,
  field,
  showPassword,
  onToggle,
  id,
  placeholder,
  autoComplete,
  required,
  extraLabel
}: AuthPasswordFieldProps) {
  const resolvedId = id ?? field.name
  const hasErrors = field.state.meta.errors.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={resolvedId}
          className="font-semibold text-xs text-zinc-700 uppercase tracking-wider"
        >
          {label}
        </label>
        {extraLabel}
      </div>
      <InputGroup className={AUTH_INPUT_GROUP_CLASS}>
        <InputGroupAddon align="inline-start" className="pl-4">
          <HugeiconsIcon
            icon={LockPasswordIcon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            className="text-zinc-400"
          />
        </InputGroupAddon>
        <InputGroupInput
          id={resolvedId}
          name={field.name}
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          className={AUTH_INPUT_CLASS}
        />
        <InputGroupAddon align="inline-end" className="pr-4">
          <button
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={onToggle}
            className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-600"
          >
            <HugeiconsIcon
              icon={showPassword ? ViewOffSlashIcon : EyeIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
          </button>
        </InputGroupAddon>
      </InputGroup>
      {hasErrors && (
        <p className="text-red-500 text-xs">{field.state.meta.errors[0]}</p>
      )}
    </div>
  )
}
