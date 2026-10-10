import { Checkbox } from '@findsports_oficial/ui/components/checkbox'
import { Field, FieldLabel } from '@findsports_oficial/ui/components/field'
import { Link } from '@tanstack/react-router'

type LegalConsentProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * Aceite dos Termos e da Política, marcado antes do botão que envia dado
 * pessoal (WEB-240). Os links abrem em outra aba para não perder o formulário.
 */
export function LegalConsent({ checked, onCheckedChange }: LegalConsentProps) {
  return (
    <Field orientation="horizontal" className="onside-legal-consent">
      <Checkbox
        id="legal-consent"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <FieldLabel htmlFor="legal-consent">
        <span>
          Declaro que li e concordo com os{' '}
          <Link to="/termos" target="_blank" rel="noopener">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link to="/privacidade" target="_blank" rel="noopener">
            Política de Privacidade
          </Link>
          .
        </span>
      </FieldLabel>
    </Field>
  )
}
