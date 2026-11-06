import { Button } from '@findsports_oficial/ui/components/button'
import { Checkbox } from '@findsports_oficial/ui/components/checkbox'
import {
  Field,
  FieldError,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import Key from 'reicon-react/icons/Key'
import Shield from 'reicon-react/icons/Shield'
import { type AuthPanel, AuthShell } from '@/components/entrada/auth-shell'
import { TwoFactorCodeInput } from '@/components/two-factor-code-input'
import { authClient } from '@/lib/auth-client'
import { pageHead } from '@/lib/page-head'
import {
  isTwoFactorChallengeCurrent,
  TWO_FACTOR_CHALLENGE_KEY,
  type TwoFactorChallenge
} from '@/lib/two-factor-challenge'
import { getUserFacingError } from '@/lib/user-facing-error'

const PANEL: AuthPanel = {
  kind: 'caption',
  led: 'hero',
  title: (
    <>
      Conta <span>protegida.</span>
    </>
  ),
  items: ['Sua senha passou. Falta o código que só você tem']
}

export const Route = createFileRoute('/(auth)/two-factor')({
  head: () =>
    pageHead({
      path: '/two-factor',
      title: 'Confirmar acesso — Onside',
      description:
        'Confirme o acesso à sua conta Onside com o código de verificação.',
      indexable: false
    }),
  component: TwoFactorPage
})

function TwoFactorPage() {
  const navigate = useNavigate()
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null)
  const [method, setMethod] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stored: unknown = null
    try {
      const raw = sessionStorage.getItem(TWO_FACTOR_CHALLENGE_KEY)
      stored = raw ? JSON.parse(raw) : null
    } catch {
      stored = null
    }
    if (!isTwoFactorChallengeCurrent(stored)) {
      sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_KEY)
      navigate({ to: '/login', replace: true })
      return
    }
    setChallenge(stored)
    setChecking(false)
  }, [navigate])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!challenge) return
    setSubmitting(true)
    setError(null)
    const result =
      method === 'totp'
        ? await authClient.twoFactor.verifyTotp({
            code: code.trim(),
            trustDevice
          })
        : await authClient.twoFactor.verifyBackupCode({
            code: code.trim(),
            trustDevice,
            disableSession: false
          })
    setSubmitting(false)
    if (result.error) {
      const feedback = getUserFacingError(
        result.error,
        method === 'totp'
          ? 'Código inválido. Digite o código atual do autenticador.'
          : 'Código de recuperação inválido ou já utilizado.'
      )
      setError(
        feedback.retryable
          ? 'Não foi possível confirmar o código. Tente novamente.'
          : feedback.message
      )
      return
    }
    sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_KEY)
    navigate({ to: challenge.callbackUrl })
  }

  return (
    <AuthShell panel={PANEL}>
      <div className="w-full">
        <p className="onside-kicker">Confirmar acesso</p>
        <h1 className="onside-display text-[42px] sm:text-5xl">
          FALTA UM{' '}
          <span className="text-[var(--onside-live-text)]">CÓDIGO.</span>
        </h1>
        <p className="mt-3 text-[var(--onside-muted)] text-sm">
          Use o autenticador ou um dos códigos de recuperação guardados.
        </p>

        {checking ? (
          <div
            className="mt-8 space-y-5"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            <span className="sr-only">Verificando desafio…</span>
            <div className="grid grid-cols-2 gap-2" aria-hidden="true">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <form
            method="post"
            className="mt-8 flex flex-col gap-5"
            onSubmit={submit}
            noValidate
          >
            <ToggleGroup
              value={[method]}
              onValueChange={(values) => {
                const selected = values.at(-1)
                if (selected === 'totp' || selected === 'backup') {
                  setMethod(selected)
                  setCode('')
                  setError(null)
                }
              }}
              className="grid w-full grid-cols-2 gap-2"
              aria-label="Forma de confirmação"
            >
              <ToggleGroupItem
                value="totp"
                className="min-h-11 border border-[var(--onside-ink)] aria-pressed:bg-[var(--onside-acid)]"
              >
                <Shield data-icon="inline-start" /> Autenticador
              </ToggleGroupItem>
              <ToggleGroupItem
                value="backup"
                className="min-h-11 border border-[var(--onside-ink)] aria-pressed:bg-[var(--onside-acid)]"
              >
                <Key data-icon="inline-start" /> Recuperação
              </ToggleGroupItem>
            </ToggleGroup>

            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="two-factor-login-code">
                {method === 'totp'
                  ? 'Código de 6 dígitos'
                  : 'Código de recuperação'}
              </FieldLabel>
              {method === 'totp' ? (
                <TwoFactorCodeInput
                  id="two-factor-login-code"
                  value={code}
                  onChange={setCode}
                  invalid={Boolean(error)}
                  describedBy={
                    error ? 'two-factor-login-code-error' : undefined
                  }
                  autoFocus
                  disabled={submitting}
                />
              ) : (
                <Input
                  id="two-factor-login-code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? 'two-factor-login-code-error' : undefined
                  }
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoFocus
                />
              )}
              <FieldError id="two-factor-login-code-error">{error}</FieldError>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="trust-device"
                checked={trustDevice}
                onCheckedChange={setTrustDevice}
              />
              <FieldLabel htmlFor="trust-device">
                Confiar neste dispositivo por 30 dias
              </FieldLabel>
            </Field>

            <Button
              type="submit"
              size="lg"
              disabled={
                submitting ||
                (method === 'totp' ? code.length !== 6 : !code.trim())
              }
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? 'Confirmando…' : 'Confirmar e entrar'}
            </Button>
            <p className="text-center text-[var(--onside-muted)] text-xs">
              Perdeu o autenticador e todos os códigos? Procure o suporte.
            </p>
            <p className="ent-alt">
              <Link to="/login">Voltar para o login</Link>
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
