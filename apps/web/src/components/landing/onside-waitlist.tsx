import { Button } from '@findsports_oficial/ui/components/button'
import {
  Field,
  FieldError,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'

import { analytics } from '../../lib/analytics'
import { useTRPCClient } from '../../utils/trpc'

type WaitlistSubmitFailureCategory =
  | 'conflict'
  | 'network'
  | 'server'
  | 'unknown'

type FanPayload = {
  role: 'fan'
  city: string
  email: string
  phone?: string
}

type PubPayload = {
  role: 'pub'
  pubName: string
  city: string
  email: string
  phone?: string
}

const GENERIC_ERROR =
  'Não foi possível registrar agora. Verifique sua conexão e tente novamente.'
const CONFLICT_ERROR =
  'Este e-mail já está cadastrado para esta cidade. Se precisar de ajuda, fale com a gente.'

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function classifyJoinError(error: Error): WaitlistSubmitFailureCategory {
  const message = error.message.toLowerCase()
  if (
    message.includes('já cadastrado') ||
    message.includes('conflict') ||
    message.includes('already')
  ) {
    return 'conflict'
  }
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  ) {
    return 'network'
  }
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('internal')
  ) {
    return 'server'
  }
  return 'unknown'
}

function mapJoinError(error: Error) {
  if (classifyJoinError(error) === 'conflict') return CONFLICT_ERROR
  return GENERIC_ERROR
}

export function OnsideFanWaitlistForm() {
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'city' | 'email', string>>
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const [successCity, setSuccessCity] = useState<string | null>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const client = useTRPCClient()

  const { mutate, isPending } = useMutation({
    mutationFn: (data: FanPayload) => client.waitlist.join.mutate(data),
    onSuccess: (_data, variables) => {
      setSuccessCity(variables.city)
      setFormError(null)
      analytics.waitlistSubmitted('fan')
    },
    onError: (error: Error) => {
      setFormError(mapJoinError(error))
    }
  })

  function validate() {
    const next: Partial<Record<'city' | 'email', string>> = {}
    const normalizedCity = collapseSpaces(city)
    const normalizedEmail = email.trim().toLowerCase()

    if (normalizedCity.length < 2) {
      next.city = 'Informe a cidade (mínimo 2 caracteres).'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      next.email = 'Informe um e-mail válido.'
    }

    setFieldErrors(next)

    if (next.city) {
      cityRef.current?.focus()
      return null
    }
    if (next.email) {
      emailRef.current?.focus()
      return null
    }

    return {
      role: 'fan' as const,
      city: normalizedCity,
      email: normalizedEmail
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const payload = validate()
    if (!payload || isPending) return
    mutate(payload)
  }

  if (successCity) {
    return (
      <div className="onside-form-success" role="status" aria-live="polite">
        <span aria-hidden="true">
          <Check size={22} aria-hidden="true" focusable="false" />
        </span>
        <div>
          <b>Cidade registrada: {successCity}.</b>
          <small>
            Vamos avisar pelo e-mail informado quando a Onside avançar por
            perto.
          </small>
        </div>
      </div>
    )
  }

  return (
    <form
      className="onside-waitlist-form"
      aria-busy={isPending}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="onside-form-number">01 — SUA CIDADE</div>
      <Field data-invalid={Boolean(fieldErrors.city)}>
        <FieldLabel htmlFor="fan-city">
          Em qual cidade você quer usar a Onside?
        </FieldLabel>
        <div className="onside-input-wrap">
          <Input
            ref={cityRef}
            id="fan-city"
            name="city"
            type="text"
            autoComplete="address-level2"
            maxLength={100}
            placeholder="Ex.: São Paulo"
            value={city}
            onChange={(event) => {
              setCity(event.target.value)
            }}
            aria-invalid={Boolean(fieldErrors.city)}
            required
            className="onside-input"
          />
          <span aria-hidden="true">⌖</span>
        </div>
        {fieldErrors.city ? (
          <FieldError className="onside-field-error">
            {fieldErrors.city}
          </FieldError>
        ) : null}
      </Field>

      <div className="onside-form-number">02 — SEU E-MAIL</div>
      <Field data-invalid={Boolean(fieldErrors.email)}>
        <FieldLabel htmlFor="fan-email">
          Onde avisamos quando a Onside chegar?
        </FieldLabel>
        <div className="onside-input-wrap">
          <Input
            ref={emailRef}
            id="fan-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={255}
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            required
            className="onside-input"
          />
          <span aria-hidden="true">@</span>
        </div>
        {fieldErrors.email ? (
          <FieldError className="onside-field-error">
            {fieldErrors.email}
          </FieldError>
        ) : null}
      </Field>

      {formError ? (
        <FieldError className="onside-form-error" role="alert">
          {formError}
        </FieldError>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="onside-button onside-button-acid onside-full-button"
      >
        {isPending ? 'Registrando…' : 'Quero na minha cidade'}
        {!isPending ? (
          <span className="onside-inline-icon" aria-hidden="true">
            <ArrowRight size={16} aria-hidden="true" focusable="false" />
          </span>
        ) : null}
      </Button>
      <p className="onside-form-note">
        Cadastro gratuito · seus dados não entram em uma newsletter
      </p>
    </form>
  )
}

export function OnsideBarInterestForm() {
  const [pubName, setPubName] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'pubName' | 'city' | 'email', string>>
  >({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const pubNameRef = useRef<HTMLInputElement>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const client = useTRPCClient()

  const { mutate, isPending } = useMutation({
    mutationFn: (data: PubPayload) => client.waitlist.join.mutate(data),
    onSuccess: () => {
      setSuccess(true)
      setFormError(null)
      analytics.waitlistSubmitted('pub')
    },
    onError: (error: Error) => {
      setFormError(mapJoinError(error))
    }
  })

  function validate() {
    const next: Partial<Record<'pubName' | 'city' | 'email', string>> = {}
    const normalizedPubName = collapseSpaces(pubName)
    const normalizedCity = collapseSpaces(city)
    const normalizedEmail = email.trim().toLowerCase()

    if (normalizedPubName.length < 2) {
      next.pubName = 'Informe o nome do bar.'
    }
    if (normalizedCity.length < 2) {
      next.city = 'Informe a cidade.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      next.email = 'Informe um e-mail válido.'
    }

    setFieldErrors(next)

    if (next.pubName) {
      pubNameRef.current?.focus()
      return null
    }
    if (next.city) {
      cityRef.current?.focus()
      return null
    }
    if (next.email) {
      emailRef.current?.focus()
      return null
    }

    return {
      role: 'pub' as const,
      pubName: normalizedPubName,
      city: normalizedCity,
      email: normalizedEmail
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const payload = validate()
    if (!payload || isPending) return
    mutate(payload)
  }

  if (success) {
    return (
      <div className="onside-bar-form-success" role="status" aria-live="polite">
        <b>Interesse recebido.</b>
        <small>
          Vamos entrar em contato pelo e-mail informado quando o piloto avançar
          na sua cidade.
        </small>
      </div>
    )
  }

  return (
    <form
      className="onside-bar-form"
      aria-busy={isPending}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="onside-bar-form-fields">
        <Field data-invalid={Boolean(fieldErrors.pubName)}>
          <FieldLabel className="sr-only" htmlFor="bar-pub-name">
            Nome do bar
          </FieldLabel>
          <Input
            ref={pubNameRef}
            id="bar-pub-name"
            name="pubName"
            type="text"
            autoComplete="organization"
            maxLength={100}
            placeholder="Nome do bar"
            value={pubName}
            onChange={(event) => {
              setPubName(event.target.value)
            }}
            aria-invalid={Boolean(fieldErrors.pubName)}
            required
            className="onside-bar-input"
          />
          {fieldErrors.pubName ? (
            <FieldError className="onside-field-error">
              {fieldErrors.pubName}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(fieldErrors.city)}>
          <FieldLabel className="sr-only" htmlFor="bar-city">
            Cidade
          </FieldLabel>
          <Input
            ref={cityRef}
            id="bar-city"
            name="city"
            type="text"
            autoComplete="address-level2"
            maxLength={100}
            placeholder="Cidade"
            value={city}
            onChange={(event) => {
              setCity(event.target.value)
            }}
            aria-invalid={Boolean(fieldErrors.city)}
            required
            className="onside-bar-input"
          />
          {fieldErrors.city ? (
            <FieldError className="onside-field-error">
              {fieldErrors.city}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(fieldErrors.email)}>
          <FieldLabel className="sr-only" htmlFor="bar-email">
            E-mail
          </FieldLabel>
          <Input
            ref={emailRef}
            id="bar-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={255}
            placeholder="E-mail"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            required
            className="onside-bar-input"
          />
          {fieldErrors.email ? (
            <FieldError className="onside-field-error">
              {fieldErrors.email}
            </FieldError>
          ) : null}
        </Field>
      </div>

      {formError ? (
        <FieldError className="onside-form-error" role="alert">
          {formError}
        </FieldError>
      ) : null}

      <Button type="submit" disabled={isPending} className="onside-bar-submit">
        {isPending ? 'Cadastrando…' : 'Cadastrar meu bar no piloto'}
        {!isPending ? (
          <span className="onside-inline-icon" aria-hidden="true">
            <ArrowRight size={16} aria-hidden="true" focusable="false" />
          </span>
        ) : null}
      </Button>
      <p className="onside-form-note onside-bar-form-note">
        Sem compromisso · entraremos em contato pelo e-mail informado
      </p>
    </form>
  )
}

/** @deprecated Prefer OnsideFanWaitlistForm / OnsideBarInterestForm */
export function OnsideWaitlist() {
  return <OnsideFanWaitlistForm />
}
