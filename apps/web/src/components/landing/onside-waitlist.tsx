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
import { useState } from 'react'

import { analytics } from '../../lib/analytics'
import { useTRPCClient } from '../../utils/trpc'
import { PhoneInput } from '../phone-input'

type WaitlistRole = 'fan' | 'pub'

export function OnsideWaitlist() {
  const [role, setRole] = useState<WaitlistRole>('fan')
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pubName, setPubName] = useState('')
  const [bairro, setBairro] = useState('')
  const client = useTRPCClient()
  const isPub = role === 'pub'

  const { mutate, isPending } = useMutation({
    mutationFn: (data: {
      name: string
      email: string
      role: WaitlistRole
      phone?: string
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
      phone: phone || undefined,
      ...(isPub
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
    <form
      aria-busy={isPending}
      className="onside-form-card"
      onSubmit={handleSubmit}
    >
      <div className="onside-form-stage">
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
          <Field className="onside-role-field">
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
              <ToggleGroupItem
                aria-controls="waitlist-pub-fields"
                aria-expanded={isPub}
                value="pub"
                className="onside-role-option"
              >
                Tenho um bar
              </ToggleGroupItem>
            </ToggleGroup>
            <div
              id="waitlist-pub-fields"
              aria-hidden={!isPub}
              className="onside-pub-disclosure"
              data-expanded={isPub}
              inert={!isPub}
            >
              <div className="onside-pub-disclosure-inner">
                <FieldGroup className="onside-pub-fields">
                  <Field data-disabled={!isPub || undefined}>
                    <FieldLabel className="sr-only" htmlFor="waitlist-pub">
                      Nome do bar
                    </FieldLabel>
                    <Input
                      id="waitlist-pub"
                      name="pubName"
                      type="text"
                      autoComplete="organization"
                      maxLength={100}
                      value={pubName}
                      onChange={(event) => setPubName(event.target.value)}
                      placeholder="Nome da casa"
                      className="onside-input"
                      disabled={!isPub}
                    />
                  </Field>
                  <Field data-disabled={!isPub || undefined}>
                    <FieldLabel className="sr-only" htmlFor="waitlist-bairro">
                      Bairro do bar
                    </FieldLabel>
                    <Input
                      id="waitlist-bairro"
                      name="bairro"
                      type="text"
                      autoComplete="address-level3"
                      maxLength={100}
                      value={bairro}
                      onChange={(event) => setBairro(event.target.value)}
                      placeholder="Bairro do bar"
                      className="onside-input"
                      disabled={!isPub}
                    />
                  </Field>
                </FieldGroup>
              </div>
            </div>
          </Field>
          <Field>
            <FieldLabel className="sr-only" htmlFor="waitlist-phone">
              Telefone (opcional)
            </FieldLabel>
            <PhoneInput
              id="waitlist-phone"
              name="phone"
              defaultValue={phone}
              onChange={setPhone}
              variant="onside"
            />
          </Field>
          {errorMessage ? (
            <FieldError className="onside-form-error">
              {errorMessage}
            </FieldError>
          ) : null}
          <Button type="submit" disabled={isPending} className="onside-submit">
            {isPending ? 'Entrando…' : 'Entrar na lista'}
          </Button>
        </FieldGroup>
        <p className="onside-form-note">Um e-mail no lançamento · sem spam</p>
      </div>
    </form>
  )
}
