import { Button } from '@findsports_oficial/ui/components/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { analytics } from '../../lib/analytics'
import { useTRPCClient } from '../../utils/trpc'

type WaitlistRole = 'fan' | 'pub'
type WaitlistStep = 'signup' | 'details'

export function OnsideWaitlist() {
  const [step, setStep] = useState<WaitlistStep>('signup')
  const [role, setRole] = useState<WaitlistRole>('fan')
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pubName, setPubName] = useState('')
  const [bairro, setBairro] = useState('')
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null)
  const client = useTRPCClient()

  useEffect(() => {
    if (step === 'details') {
      detailsHeadingRef.current?.focus()
    }
  }, [step])

  const { mutate, isPending } = useMutation({
    mutationFn: (data: {
      name: string
      email: string
      role: WaitlistRole
      pubName?: string
      bairro?: string
    }) => client.waitlist.join.mutate(data),
    onSuccess: () => {
      setSuccess(true)
      setErrorMessage(null)
      analytics.waitlistSubmitted(role)
    },
    onError: (error: Error) => setErrorMessage(error.message)
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (step === 'signup') {
      analytics.landingCtaClicked('waitlist_continue')
      setStep('details')
      return
    }

    const normalizedName = name.trim()
    if (normalizedName.length < 2) {
      setErrorMessage('Informe seu nome para concluir o cadastro.')
      return
    }

    analytics.landingCtaClicked('waitlist_submit')
    mutate({
      name: normalizedName,
      email: email.trim(),
      role,
      ...(role === 'pub'
        ? {
            pubName: pubName.trim() || undefined,
            bairro: bairro.trim() || undefined
          }
        : {})
    })
  }

  if (success) {
    return (
      <div className="onside-form-card onside-success" role="status">
        <span>Cadastro confirmado</span>
        <strong>Você está no time.</strong>
        <p>
          Avisaremos por e-mail quando o Onside abrir na sua cidade. Até o
          apito.
        </p>
      </div>
    )
  }

  return (
    <form className="onside-form-card" onSubmit={handleSubmit}>
      <div className="onside-form-stage" key={step}>
        {step === 'signup' ? (
          <>
            <span className="onside-form-label">Entre na lista</span>
            <FieldGroup className="onside-field-group">
              <Field>
                <FieldLabel className="sr-only" htmlFor="waitlist-email">
                  Seu e-mail
                </FieldLabel>
                <Input
                  id="waitlist-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  maxLength={255}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="onside-input"
                />
              </Field>
              <Field>
                <FieldLabel className="sr-only" id="waitlist-role-label">
                  Qual é o seu perfil?
                </FieldLabel>
                <ToggleGroup
                  aria-labelledby="waitlist-role-label"
                  value={[role]}
                  onValueChange={(values) => {
                    const nextRole = values.at(-1)
                    if (nextRole === 'fan' || nextRole === 'pub') {
                      setRole(nextRole)
                    }
                  }}
                  className="onside-role-group"
                >
                  <ToggleGroupItem value="fan" className="onside-role-option">
                    Sou torcedor
                  </ToggleGroupItem>
                  <ToggleGroupItem value="pub" className="onside-role-option">
                    Tenho um bar
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Button type="submit" className="onside-submit">
                Quero entrar
              </Button>
            </FieldGroup>
            <p className="onside-form-note">
              Um e-mail no lançamento · cancele quando quiser
            </p>
          </>
        ) : (
          <>
            <div className="onside-details-head">
              <span className="onside-form-label">Último passe</span>
              <Button
                type="button"
                variant="ghost"
                className="onside-form-back"
                onClick={() => {
                  setErrorMessage(null)
                  setStep('signup')
                }}
              >
                ← Voltar
              </Button>
            </div>
            <h3
              ref={detailsHeadingRef}
              className="onside-details-title"
              tabIndex={-1}
            >
              Complete seu cadastro
            </h3>
            <p className="onside-email-summary">{email}</p>
            <FieldGroup className="onside-field-group onside-details-fields">
              <Field data-invalid={Boolean(errorMessage)}>
                <FieldLabel className="sr-only" htmlFor="waitlist-name">
                  Seu nome
                </FieldLabel>
                <Input
                  id="waitlist-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  placeholder="Como podemos te chamar?"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  aria-invalid={Boolean(errorMessage)}
                  className="onside-input"
                />
              </Field>
              {role === 'pub' && (
                <div className="onside-pub-fields">
                  <Field>
                    <FieldLabel className="sr-only" htmlFor="waitlist-pub">
                      Nome do bar
                    </FieldLabel>
                    <Input
                      id="waitlist-pub"
                      type="text"
                      autoComplete="organization"
                      maxLength={100}
                      value={pubName}
                      onChange={(event) => setPubName(event.target.value)}
                      placeholder="Nome da casa"
                      className="onside-input"
                    />
                  </Field>
                  <Field>
                    <FieldLabel className="sr-only" htmlFor="waitlist-bairro">
                      Bairro
                    </FieldLabel>
                    <Input
                      id="waitlist-bairro"
                      type="text"
                      autoComplete="address-level3"
                      maxLength={100}
                      value={bairro}
                      onChange={(event) => setBairro(event.target.value)}
                      placeholder="Onde fica?"
                      className="onside-input"
                    />
                  </Field>
                </div>
              )}
              {errorMessage && (
                <FieldError className="onside-form-error">
                  {errorMessage}
                </FieldError>
              )}
              <Button
                type="submit"
                disabled={isPending}
                className="onside-submit"
              >
                {isPending ? 'Entrando…' : 'Confirmar cadastro'}
              </Button>
            </FieldGroup>
            <p className="onside-form-note">
              Seus dados ficam protegidos · sem spam
            </p>
          </>
        )}
      </div>
    </form>
  )
}
