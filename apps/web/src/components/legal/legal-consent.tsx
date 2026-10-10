import { Link } from '@tanstack/react-router'

type LegalConsentProps = {
  /** O que a pessoa está fazendo: "criar a conta", "continuar". */
  action: string
}

/** Aviso de aceite, junto do botão que envia dado pessoal (WEB-240). */
export function LegalConsent({ action }: LegalConsentProps) {
  return (
    <p className="onside-legal-consent">
      Ao {action}, você concorda com os <Link to="/termos">Termos de Uso</Link>{' '}
      e a <Link to="/privacidade">Política de Privacidade</Link>.
    </p>
  )
}
