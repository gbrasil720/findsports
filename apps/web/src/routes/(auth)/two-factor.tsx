import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
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
        <h1 className="onside-display">
          Confirme que{' '}
          <span className="text-[var(--onside-live-text)]">é você</span>
        </h1>
        <p className="ent-sub">
          {method === 'totp'
            ? 'Digite o código de 6 números do seu app autenticador.'
            : 'Digite um dos códigos de recuperação que você guardou ao ativar.'}
        </p>

        {checking ? null : (
          <form
            method="post"
            className="flex flex-col"
            onSubmit={submit}
            noValidate
          >
            <fieldset className="ent-seg">
              <legend className="sr-only">Forma de confirmação</legend>
              {(
                [
                  ['totp', 'Autenticador'],
                  ['backup', 'Recuperação']
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={method === value}
                  onClick={() => {
                    setMethod(value)
                    setCode('')
                    setError(null)
                  }}
                >
                  {label}
                </button>
              ))}
            </fieldset>

            {method === 'totp' ? (
              <div className="ent-boxes">
                <label htmlFor="two-factor-login-code" className="sr-only">
                  Código de 6 dígitos
                </label>
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
              </div>
            ) : (
              <div className="mt-[22px] flex flex-col gap-1.5">
                <label htmlFor="two-factor-login-code" className="onside-label">
                  Código de recuperação
                </label>
                <div className="onside-input-group flex items-center px-4">
                  <input
                    id="two-factor-login-code"
                    className="onside-input-control w-full bg-transparent font-[family-name:var(--mono)] outline-none"
                    placeholder="xxxx-xxxx"
                    inputMode="text"
                    autoComplete="one-time-code"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? 'two-factor-login-code-error' : undefined
                    }
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    // biome-ignore lint/a11y/noAutofocus: a tela só pede este campo.
                    autoFocus
                  />
                </div>
              </div>
            )}
            <p
              id="two-factor-login-code-error"
              className="onside-field-error"
              role="alert"
            >
              {error}
            </p>

            <label className="ent-trust">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(event) => setTrustDevice(event.target.checked)}
              />
              Confiar neste aparelho por 30 dias
            </label>

            <button
              type="submit"
              className="onside-btn onside-btn-acid onside-btn-full ent-full mt-6"
              disabled={
                submitting ||
                (method === 'totp' ? code.length !== 6 : !code.trim())
              }
            >
              {submitting ? (
                <>
                  <Loader
                    size={16}
                    color="currentColor"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Confirmando…
                </>
              ) : (
                'Confirmar e entrar'
              )}
            </button>
            <p className="ent-hint mt-4 text-center">
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
