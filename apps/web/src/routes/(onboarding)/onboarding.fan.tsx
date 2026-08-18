import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Fire from 'reicon-react/icons/Fire'
import Location from 'reicon-react/icons/Location'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { OnboardingStep } from '@/components/onboarding/onboarding-step'
import { RadiusSelector } from '@/components/onboarding/radius-selector'
import { SportSelector } from '@/components/onboarding/sport-selector'
import { StepProgress } from '@/components/onboarding/step-progress'
import { WelcomeStep } from '@/components/onboarding/welcome-step'
import { type RadiusKm, SEARCH_RADII } from '@/domain/discovery'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/fan')({
  head: () => ({
    meta: [
      { title: 'Configure sua conta de torcedor — Onside' },
      {
        name: 'description',
        content:
          'Personalize sua experiência: escolha seus esportes e defina o raio de busca. Leva menos de 1 minuto.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: FanOnboarding
})

const STEPS = [
  'Boas-vindas',
  'Seus esportes',
  'Onde você assiste',
  'Revisão'
] as const
const WELCOME_FEATURES = [
  { icon: Fire, text: 'Veja jogos ao vivo perto de você' },
  { icon: Location, text: 'Bares dentro do seu raio' },
  { icon: Check, text: 'Leve a galera junto' }
]

function FanOnboarding() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [step, setStep] = useState(0)
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
  const [radius, setRadius] = useState<RadiusKm>(3)
  const [error, setError] = useState<string | null>(null)

  const sportsQuery = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY
  })
  const sports = sportsQuery.data ?? []

  const completeMutation = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        analytics.onboardingCompleted({
          role: 'fan',
          sports: sports
            .filter((s) => selectedSportIds.includes(s.id))
            .map((s) => s.slug),
          radius_km: radius
        })
        // `onboardingCompleted` e `searchRadiusKm` mudaram no banco por fora
        // do better-auth; sem regravar o cache de sessão o guard da rota
        // devolveria o usuário para cá. Se a releitura falhar, seguimos
        // assim mesmo — o guard revalida no servidor.
        await refreshSessionCache().catch(() => {})
        navigate({ to: '/dashboard' })
      },
      onError: (err) => setError(err.message)
    })
  )

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: step === 0 })
  }, [step])

  const canAdvance = (() => {
    if (step === 0) return true
    if (step === 1) return selectedSportIds.length > 0
    if (step === 2) return radius > 0
    return true
  })()

  const next = () => {
    setError(null)

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      completeMutation.mutate({
        sportIds: selectedSportIds,
        searchRadiusKm: radius
      })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  const toggleSport = (id: string) =>
    setSelectedSportIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  return (
    <OnboardingLayout variant="fan">
      <OnboardingHeader label="Conta de torcedor" />
      <StepProgress step={step} steps={STEPS} />

      <OnboardingStep>
        {step === 0 && (
          <WelcomeStep
            eyebrow="É torcedor? Chegou no lugar certo."
            title={
              <>
                Vamos achar os{' '}
                <span className="text-[var(--onside-acid)]">
                  melhores bares
                </span>{' '}
                pro seu jogo.
              </>
            }
            subtitle="Em 2 passos a gente calibra sua busca: esportes favoritos e raio de localização."
            features={WELCOME_FEATURES}
          />
        )}

        {step === 1 && (
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="onside-display mb-2 text-3xl text-[var(--onside-paper)] outline-none"
            >
              Quais esportes você curte?
            </h2>
            <p className="onside-text-muted-on-ink mb-6">
              Marque tudo que você acompanha — a gente filtra os bares pra você.
            </p>
            <SportSelector
              sports={sports}
              selectedIds={selectedSportIds}
              onToggle={toggleSport}
              isLoading={sportsQuery.isLoading}
              isError={sportsQuery.isError}
              onRetry={() => sportsQuery.refetch()}
            />
            <p className="onside-text-muted-on-ink mt-6 text-xs">
              {selectedSportIds.length} selecionado
              {selectedSportIds.length === 1 ? '' : 's'} — escolha pelo menos 1.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="onside-display mb-2 text-3xl text-[var(--onside-paper)] outline-none"
            >
              Quão longe você topa ir?
            </h2>
            <p className="onside-text-muted-on-ink mb-6">
              A distância define quais bares aparecem pra você.
            </p>
            <RadiusSelector
              value={radius}
              options={SEARCH_RADII}
              onChange={setRadius}
            />
          </div>
        )}

        {step === 3 && (
          <div className="py-4 text-center md:py-6">
            <div className="onside-panel-acid mx-auto mb-6 grid size-20 place-items-center">
              <Check size={40} color="currentColor" aria-hidden="true" />
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="onside-display mb-3 text-4xl text-[var(--onside-paper)] outline-none md:text-5xl"
            >
              Pronto para salvar
            </h2>
            <p className="onside-text-muted-on-ink mx-auto mb-8 max-w-md">
              Confira sua seleção. Ao continuar, salvamos preferências e abrimos
              o mapa de bares.
            </p>
            <div className="inline-flex flex-wrap justify-center gap-2">
              {sports
                .filter((s) => selectedSportIds.includes(s.id))
                .map((s) => (
                  <span
                    key={s.id}
                    className="onside-badge border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_10%)] text-[var(--onside-paper)]"
                  >
                    {s.name}
                  </span>
                ))}
              <span className="onside-badge border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_10%)] text-[var(--onside-paper)]">
                {radius} km
              </span>
            </div>
          </div>
        )}
      </OnboardingStep>

      {error && (
        <p
          className="mt-4 text-center text-[var(--onside-live-text)] text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <OnboardingNavigation
        step={step}
        totalSteps={STEPS.length}
        canAdvance={canAdvance}
        isPending={completeMutation.isPending}
        onBack={back}
        onNext={next}
        lastLabel="Salvar e encontrar bares"
      />
    </OnboardingLayout>
  )
}
