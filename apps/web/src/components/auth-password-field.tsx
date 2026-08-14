import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@findsports_oficial/ui/components/input-group'
import type { AnyFieldApi } from '@tanstack/form-core'
import type { ReactNode } from 'react'
import Eye from 'reicon-react/icons/Eye'
import EyeSlash from 'reicon-react/icons/EyeSlash'
import Lock from 'reicon-react/icons/Lock'

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
  const errorId = `${resolvedId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={resolvedId} className="onside-label mb-0">
          {label}
        </label>
        {extraLabel}
      </div>
      <InputGroup className={AUTH_INPUT_GROUP_CLASS}>
        <InputGroupAddon align="inline-start" className="pl-4">
          <Lock
            size={16}
            color="currentColor"
            className="text-[var(--onside-muted)]"
            aria-hidden="true"
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
          aria-invalid={hasErrors || undefined}
          aria-describedby={hasErrors ? errorId : undefined}
        />
        <InputGroupAddon align="inline-end" className="pr-2">
          <button
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={onToggle}
            className="grid min-h-11 min-w-11 place-items-center text-[var(--onside-muted)] transition-colors hover:text-[var(--onside-ink)]"
          >
            {showPassword ? (
              <EyeSlash size={16} color="currentColor" aria-hidden="true" />
            ) : (
              <Eye size={16} color="currentColor" aria-hidden="true" />
            )}
          </button>
        </InputGroupAddon>
      </InputGroup>
      {hasErrors && (
        <p id={errorId} className="onside-field-error" role="alert">
          {field.state.meta.errors[0]}
        </p>
      )}
    </div>
  )
}
