import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@findsports_oficial/ui/components/input-group'
import type { AnyFieldApi } from '@tanstack/form-core'
import type { ComponentType, SVGAttributes } from 'react'

import { AUTH_INPUT_CLASS, AUTH_INPUT_GROUP_CLASS } from '@/lib/auth-styles'

type IconProps = SVGAttributes<SVGSVGElement> & {
  size?: number | string
  color?: string
}

interface AuthInputFieldProps {
  label: string
  icon: ComponentType<IconProps>
  field: AnyFieldApi
  id?: string
  type?: string
  placeholder?: string
  autoComplete?: string
  maxLength?: number
  required?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  spellCheck?: boolean
}

export function AuthInputField({
  label,
  icon: Icon,
  field,
  id,
  type,
  placeholder,
  autoComplete,
  maxLength,
  required,
  inputMode,
  spellCheck
}: AuthInputFieldProps) {
  const resolvedId = id ?? field.name
  const hasErrors = field.state.meta.errors.length > 0
  const errorId = `${resolvedId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={resolvedId} className="onside-label mb-0">
        {label}
      </label>
      <InputGroup className={AUTH_INPUT_GROUP_CLASS}>
        <InputGroupAddon className="pl-4">
          <Icon
            size={16}
            color="currentColor"
            className="text-[var(--onside-muted)]"
            aria-hidden="true"
          />
        </InputGroupAddon>
        <InputGroupInput
          id={resolvedId}
          name={field.name}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          required={required}
          inputMode={inputMode}
          spellCheck={spellCheck}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          className={AUTH_INPUT_CLASS}
          aria-invalid={hasErrors || undefined}
          aria-describedby={hasErrors ? errorId : undefined}
        />
      </InputGroup>
      {hasErrors && (
        <p id={errorId} className="onside-field-error" role="alert">
          {field.state.meta.errors[0]}
        </p>
      )}
    </div>
  )
}
