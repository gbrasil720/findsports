import { Button } from '@findsports_oficial/ui/components/button'
import Chart from 'reicon-react/icons/Chart'
import {
  type AnalyticsConsent,
  analyticsConfigured,
  setAnalyticsConsent,
  useAnalyticsConsent
} from '@/lib/analytics-consent'
import { AccountActionRow } from './account-action-row'

type Choice = AnalyticsConsent | 'unset'

const COPY: Record<Choice, { title: string; description: string }> = {
  granted: {
    title: 'Cookies de análise aceitos',
    description:
      'Medimos o uso do produto neste navegador, de forma pseudonimizada, para melhorar a Onside.'
  },
  denied: {
    title: 'Cookies de análise recusados',
    description:
      'Nada de análise é carregado nem gravado neste navegador. A Onside funciona igual.'
  },
  unset: {
    title: 'Cookies de análise sem escolha',
    description:
      'Enquanto você não escolher, nada de análise é carregado neste navegador.'
  }
}

/**
 * Onde quem está logado revê a escolha de cookies (WEB-244). O aviso e o
 * botão do rodapé só existem nas páginas públicas; aqui a mesma escolha fica
 * ao lado das outras preferências da conta. A fonte da verdade é a mesma do
 * aviso, então mudar aqui liga ou desliga a análise na hora.
 */
export function PrivacySettings() {
  const consent = useAnalyticsConsent()

  // Só há o que escolher onde a análise existe, e a escolha mora no navegador.
  if (!analyticsConfigured() || consent === 'ssr') return null

  return (
    <PrivacySettingsSection consent={consent} onChange={setAnalyticsConsent} />
  )
}

export function PrivacySettingsSection({
  consent,
  onChange
}: {
  consent: Choice
  onChange: (value: AnalyticsConsent) => void
}) {
  const copy = COPY[consent]

  return (
    <section className="border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5 sm:p-6">
      <p className="onside-kicker mb-2">Privacidade</p>
      <h2 className="onside-display text-2xl">Cookies</h2>
      <p className="mt-1 text-[var(--onside-muted)] text-sm">
        Os essenciais mantêm você na conta e não dependem de escolha. Os de
        análise, só com a sua permissão. Detalhes na{' '}
        <a className="underline underline-offset-2" href="/privacidade#s-8">
          Política de Privacidade
        </a>
        .
      </p>

      <AccountActionRow
        icon={Chart}
        title={copy.title}
        description={copy.description}
        action={
          <div className="flex flex-wrap gap-2">
            {consent !== 'denied' ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => onChange('denied')}
              >
                Recusar
              </Button>
            ) : null}
            {consent !== 'granted' ? (
              <Button size="lg" onClick={() => onChange('granted')}>
                Aceitar
              </Button>
            ) : null}
          </div>
        }
      />
    </section>
  )
}
