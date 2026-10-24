import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AuthSplit, Disp, entradaHead } from '@/components/entrada/auth'
import { Botao, Campo, Seg } from '@/components/painel'
import { TwoFactorCodeInput } from '@/components/two-factor-code-input'
import { authClient } from '@/lib/auth-client'
import {
  isTwoFactorChallengeCurrent,
  TWO_FACTOR_CHALLENGE_KEY,
  type TwoFactorChallenge
} from '@/lib/two-factor-challenge'
import { getUserFacingError } from '@/lib/user-facing-error'

export const Route = createFileRoute('/(auth)/two-factor')({
  head: () =>
    entradaHead({
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
    <AuthSplit
      foto={
        <>
          <Disp
            nivel={0}
            tamanho={64}
            linhas={[{ texto: 'Proteção' }, { texto: 'em campo.', tint: true }]}
            className="entrada-foto-titulo"
          />
          <p>Sua senha passou. Agora confirme o código que só você possui.</p>
        </>
      }
    >
      <p className="entrada-kicker">Confirmar acesso</p>
      <Disp
        tamanho={56}
        linhas={[{ texto: 'Falta um' }, { texto: 'código.', tint: true }]}
      />
      <p className="entrada-linha">
        Use o autenticador ou um dos códigos de recuperação guardados.
      </p>

      {checking ? (
        <div
          className="entrada-campos"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Verificando desafio…</span>
          <Skeleton className="h-11 w-full bg-[var(--painel-sub)]" />
          <Skeleton className="h-14 w-full bg-[var(--painel-sub)]" />
          <Skeleton className="h-12 w-full bg-[var(--painel-sub)]" />
        </div>
      ) : (
        <form
          method="post"
          style={{ marginTop: 6 }}
          onSubmit={submit}
          noValidate
        >
          <Seg
            rotulo="Forma de confirmação"
            valor={method}
            onChange={(selected) => {
              setMethod(selected)
              setCode('')
              setError(null)
            }}
            itens={[
              { valor: 'totp', rotulo: 'Autenticador' },
              { valor: 'backup', rotulo: 'Recuperação' }
            ]}
          />

          {method === 'totp' ? (
            <div className="painel-campo">
              <div className="painel-campo-topo">
                <label htmlFor="two-factor-login-code">
                  Código de 6 dígitos
                </label>
              </div>
              <div className="entrada-codigo">
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
            </div>
          ) : (
            <Campo
              id="two-factor-login-code"
              rotulo="Código de recuperação"
              className={error ? 'entrada-campo-erro' : undefined}
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
          {error ? (
            <span
              id="two-factor-login-code-error"
              className="entrada-erro"
              role="alert"
            >
              {error}
            </span>
          ) : null}

          <label className="entrada-aceite">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            <span>Confiar neste dispositivo por 30 dias</span>
          </label>

          <Botao
            type="submit"
            variante="acid"
            className="entrada-cta"
            disabled={
              submitting ||
              (method === 'totp' ? code.length !== 6 : !code.trim())
            }
          >
            {submitting ? 'Confirmando…' : 'Confirmar e entrar'}
          </Botao>
          <p className="entrada-nota">
            Perdeu o autenticador e todos os códigos? Procure o suporte.
          </p>
        </form>
      )}
    </AuthSplit>
  )
}
