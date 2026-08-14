import {
  Field,
  FieldError,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@findsports_oficial/ui/components/input-group'
import type { AnyFieldApi } from '@tanstack/form-core'
import { useState } from 'react'
import Eye from 'reicon-react/icons/Eye'
import EyeSlash from 'reicon-react/icons/EyeSlash'

interface AuthFormFieldProps {
  label: string
  type?: string
  field: AnyFieldApi
}

export function AuthFormField({
  label,
  type = 'text',
  field
}: AuthFormFieldProps) {
  const hasErrors = field.state.meta.errors.length > 0
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <Field data-invalid={hasErrors || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {isPassword ? (
        <InputGroup>
          <InputGroupInput
            id={field.name}
            name={field.name}
            type={showPassword ? 'text' : 'password'}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            aria-invalid={hasErrors || undefined}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeSlash
                  size={14}
                  color="currentColor"
                  className="text-muted-foreground"
                />
              ) : (
                <Eye
                  size={14}
                  color="currentColor"
                  className="text-muted-foreground"
                />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input
          id={field.name}
          name={field.name}
          type={type}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={hasErrors || undefined}
        />
      )}
      <FieldError errors={field.state.meta.errors} />
    </Field>
  )
}
