import { Button } from '@findsports_oficial/ui/components/button'
import { Checkbox } from '@findsports_oficial/ui/components/checkbox'
import {
  Field,
  FieldError,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import Key from 'reicon-react/icons/Key'
import Shield from 'reicon-react/icons/Shield'
import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { TwoFactorCodeInput } from '@/components/two-factor-code-input'
import { authClient } from '@/lib/auth-client'
import {
  isTwoFactorChallengeCurrent,
  TWO_FACTOR_CHALLENGE_KEY,
  type TwoFactorChallenge
} from '@/lib/two-factor-challenge'

export const Route = createFileRoute('/(auth)/two-factor')({
  head: () => ({
    meta: [
      { title: 'Confirmar acesso — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
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
      setError(
        result.error.status === 429
          ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
          : method === 'totp'
            ? 'Código inválido. Digite o código atual do autenticador.'
            : 'Código de recuperação inválido ou já utilizado.'
      )
      return
    }
    sessionStorage.removeItem(TWO_FACTOR_CHALLENGE_KEY)
    navigate({ to: challenge.callbackUrl })
  }

  return (
    <div className="onside-app flex min-h-dvh">
      <AuthBrandPanel variant="login">
        <div className="mb-3 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
          <span className="onside-live-dot" aria-hidden="true" />
          Segundo tempo
        </div>
        <h2 className="onside-display mb-6 text-4xl text-[var(--onside-paper)] xl:text-5xl">
          PROTEÇÃO <span className="text-[var(--onside-acid)]">EM CAMPO.</span>
        </h2>
        <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
          Sua senha passou. Agora confirme o código que só você possui.
        </p>
      </AuthBrandPanel>

      <main className="flex flex-1 flex-col items-center justify-center bg-[var(--onside-paper)] px-4 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 w-full max-w-[420px] border-[var(--onside-ink)] border-b pb-6 lg:hidden">
          <Link to="/" aria-label="Onside — página inicial">
            <OnsideBrand />
          </Link>
        </div>
        <div className="w-full max-w-[420px]">
          <p className="onside-kicker mb-3">Confirmar acesso</p>
          <h1 className="onside-display text-[42px] sm:text-5xl">
            FALTA UM{' '}
            <span className="text-[var(--onside-live-text)]">CÓDIGO.</span>
          </h1>
          <p className="mt-3 text-[var(--onside-muted)] text-sm">
            Use o autenticador ou um dos códigos de recuperação guardados.
          </p>

          {checking ? (
            <div className="mt-8 flex items-center gap-2" role="status">
              <Spinner /> Verificando desafio…
            </div>
          ) : (
            <form className="mt-8 flex flex-col gap-5" onSubmit={submit}>
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
                    autoFocus
                    disabled={submitting}
                  />
                ) : (
                  <Input
                    id="two-factor-login-code"
                    inputMode="text"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    autoFocus
                  />
                )}
                <FieldError>{error}</FieldError>
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
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
