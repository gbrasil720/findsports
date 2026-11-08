import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { Add, Logo } from '@/components/landing/v3/icons'
import type { PubOnboardingDraft } from '@/lib/pub-onboarding-draft'
import { useTRPC } from '@/utils/trpc'

export type PubReceiptData = {
  bar: {
    name: string
    address: string
    neighborhood: string
    city: string
    uf?: string
  }
  /** Fim do teste, como o servidor gravou na assinatura. */
  until: string | Date
  issuedAt: Date
}

const BARS = Array.from(
  { length: 38 },
  (_, i) => [1, 2, 1, 3, 1, 2, 2, 1][i % 8]
)

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

/**
 * Comprovante do cadastro do bar (WEB-501; `recibo()` do protótipo do painel):
 * a impressora térmica solta o papel linha a linha, com os dados reais do bar
 * e do teste. Não é documento fiscal, e nada é cobrado hoje. Sem plano: o
 * dono escolhe o do teste logo depois do primeiro jogo, que vem em seguida.
 */
export function PubReceipt({
  data,
  continueLabel,
  pending,
  onContinue
}: {
  data: PubReceiptData
  continueLabel: string
  pending: boolean
  onContinue: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  // A chave da impressora e do papel: trocar remonta os dois e a impressão
  // recomeça do zero.
  const [printRun, setPrintRun] = useState(0)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  const { bar } = data
  const lines: [string, ReactNode][] = []
  const row = (cls: string, left: ReactNode, right?: ReactNode) =>
    lines.push([
      cls,
      <>
        <span>{left}</span>
        {right === undefined ? null : <span>{right}</span>}
      </>
    ])
  const cut = () => lines.push(['rl-cut', null])

  lines.push([
    'rl-logo',
    <>
      <Logo size={30} />
      <b>ONSIDE</b>
    </>
  ])
  row('rl-c', 'COMPROVANTE DE CADASTRO')
  row(
    'rl-m',
    date(data.issuedAt),
    data.issuedAt.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  )
  cut()
  row('rl-b', bar.name.toUpperCase())
  row('rl-m', bar.address)
  row('rl-m', `${bar.neighborhood} · ${bar.city}${bar.uf ? `/${bar.uf}` : ''}`)
  cut()
  row('rl-b', 'TESTE GRÁTIS', 'R$ 0,00')
  row('rl-m', `${ONBOARDING_TRIAL.days} dias`, `até ${date(data.until)}`)
  row('rl-m', 'Cartão', 'não pedido')
  row('rl-m', 'Plano', 'você escolhe já já')
  row('rl-m', '', 'depois do primeiro jogo')
  cut()
  row('rl-b', 'PRIMEIRO JOGO', 'por conta da Onside')
  row('rl-m', 'Não conta no limite', 'de nenhum plano')
  lines.push([
    'rl-note',
    'Nada é cobrado no teste. O plano você escolhe logo depois do primeiro jogo, antes de entrar no painel; só cobra se você contratar.'
  ])
  cut()
  row('rl-tot', 'TOTAL HOJE', 'R$ 0,00')
  lines.push([
    'rl-bars',
    BARS.map((width, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: código de barras decorativo, fixo.
      <i key={i} style={{ width }} />
    ))
  ])
  row('rl-c rl-m', 'obrigado por torcer com a gente')

  return (
    <div className="ob-rcpt">
      <span className="ob-k">Pronto. Saiu o seu comprovante</span>
      <h1 ref={headingRef} className="ob-h" tabIndex={-1}>
        {bar.name} está no ar
      </h1>
      <div
        key={`printer-${printRun}`}
        className="ob-printer"
        aria-hidden="true"
      >
        <span className="slot" />
        <span className="ob-led" />
      </div>
      <div
        key={`paper-${printRun}`}
        className="ob-paper"
        role="document"
        aria-label="Comprovante de cadastro"
      >
        {lines.map(([cls, content], i) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: as linhas são fixas e saem na ordem do papel.
            key={i}
            className={`rl ${cls}`}
            style={{ animationDelay: `${i * 95}ms` }}
            aria-hidden={
              cls === 'rl-bars' || cls === 'rl-cut' ? true : undefined
            }
          >
            {content}
          </p>
        ))}
      </div>
      <div className="ob-cta">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPrintRun((n) => n + 1)}
        >
          Imprimir de novo
        </button>
        <button
          type="button"
          className="btn btn-acid"
          onClick={onContinue}
          disabled={pending}
        >
          {pending ? (
            <Loader
              size={18}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Add size={18} />
          )}
          {continueLabel}
        </button>
      </div>
      <p className="ob-note">
        O bar já está no mapa; com um jogo na grade, aparece nas buscas do dia.
        O fim do teste fica também em Plano e cobrança, no painel.
      </p>
    </div>
  )
}

/**
 * Depois do `completePub`: o comprovante sai do que o servidor gravou (o fim
 * do teste), não do rascunho. Sem a assinatura não há comprovante de verdade:
 * devolve `null` e quem chamou segue sem ele.
 */
export function useFinishPubSignup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  // Estável: entra nas dependências do `continueVerified` de `/verify-email`,
  // que roda num efeito.
  return useCallback(
    async (draft: PubOnboardingDraft): Promise<PubReceiptData | null> => {
      try {
        const subscription = await queryClient.fetchQuery(
          trpc.pub.getMySubscription.queryOptions()
        )
        if (!subscription?.currentPeriodEnd) return null
        return {
          bar: {
            name: draft.name,
            address: draft.address,
            neighborhood: draft.neighborhood,
            city: draft.city ?? 'São Paulo',
            uf: draft.uf
          },
          until: subscription.currentPeriodEnd,
          issuedAt: new Date()
        }
      } catch {
        return null
      }
    },
    [queryClient, trpc]
  )
}
