import { Link } from '@tanstack/react-router'

type LegalConsentProps = {
  /** O que a pessoa está fazendo: "criar a conta", "entrar na lista". */
  action: string
  /**
   * Os termos regem o uso da plataforma. Quem só deixa o contato na lista de
   * espera ainda não usa nada: ali vale só a política de privacidade.
   */
  terms?: boolean
}

/** Aviso de aceite, junto do botão que envia dado pessoal (WEB-240). */
export function LegalConsent({ action, terms = true }: LegalConsentProps) {
  return (
    <p className="onside-legal-consent">
      Ao {action}, você concorda com{' '}
      {terms ? (
        <>
          os <Link to="/termos">Termos de Uso</Link> e{' '}
        </>
      ) : null}
      a <Link to="/privacidade">Política de Privacidade</Link>.
    </p>
  )
}
