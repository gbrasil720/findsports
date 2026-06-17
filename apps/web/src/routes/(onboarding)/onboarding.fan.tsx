import {
  Car01Icon,
  FireIcon,
  MapPinIcon,
  MedalFirstPlaceIcon,
  RadioButtonIcon,
  TargetDollarIcon,
  Tick01Icon,
  VolleyballIcon,
  WeightIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { OnboardingStep } from '@/components/onboarding/onboarding-step'
import { RadiusSelector } from '@/components/onboarding/radius-selector'
import { SportSelector } from '@/components/onboarding/sport-selector'
import { StepProgress } from '@/components/onboarding/step-progress'
import { WelcomeStep } from '@/components/onboarding/welcome-step'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/fan')({
  head: () => ({
    meta: [
      { title: 'Configure sua conta de torcedor — FindSports' },
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

const SPORT_ICONS: Record<string, IconSvgElement> = {
  futebol: MedalFirstPlaceIcon,
  basquete: RadioButtonIcon,
  volei: VolleyballIcon,
  'futebol-americano': WeightIcon,
  'formula-1': Car01Icon,
  'mma-ufc': TargetDollarIcon
}

const STEPS = [
  'Boas-vindas',
  'Seus esportes',
  'Onde você assiste',
  'Pronto'
] as const
const RADIUS_OPTIONS = [1, 3, 5, 10] as const
type RadiusKm = (typeof RADIUS_OPTIONS)[number]

const WELCOME_FEATURES = [
  { icon: FireIcon, text: 'Veja jogos ao vivo perto de você' },
  { icon: MapPinIcon, text: 'Bares dentro do seu raio' },
  { icon: Tick01Icon, text: 'Leve a galera junto' }
]

function FanOnboarding() {
  const navigate = useNavigate()
  const trpc = useTRPC()

  const [step, setStep] = useState(0)
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
  const [radius, setRadius] = useState<RadiusKm>(3)
  const [error, setError] = useState<string | null>(null)

  const { data: sports = [], isLoading: loadingSports } = useQuery(
    trpc.pubs.getSports.queryOptions()
  )

  const completeMutation = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: () => {
        analytics.fanOnboardingCompleted(
          sports
            .filter((s) => selectedSportIds.includes(s.id))
            .map((s) => s.slug),
          radius
        )
        navigate({ to: '/dashboard' })
      },
      onError: (err) => setError(err.message)
    })
  )

  // Dispara started uma única vez ao montar
  useEffect(() => {
    analytics.fanOnboardingStarted()
  }, [])

  const canAdvance = (() => {
    if (step === 0) return true
    if (step === 1) return selectedSportIds.length > 0
    if (step === 2) return radius > 0
    return true
  })()

  const next = () => {
    setError(null)

    // Evento por step
    if (step === 0) analytics.fanOnboardingStepCompleted(1)
    if (step === 1) {
      analytics.fanOnboardingStepCompleted(2)
      analytics.fanOnboardingSportsSelected(
        sports.filter((s) => selectedSportIds.includes(s.id)).map((s) => s.slug)
      )
    }
    if (step === 2) {
      analytics.fanOnboardingStepCompleted(3)
      analytics.fanOnboardingRadiusSelected(radius)
    }

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
      <OnboardingHeader label="Conta de torcedor" accent="orange" />
      <StepProgress step={step} steps={STEPS} accent="orange" />

      <OnboardingStep accent="orange">
        {step === 0 && (
          <WelcomeStep
            eyebrow="É torcedor? Chegou no lugar certo."
            title={
              <>
                Vamos achar os{' '}
                <span className="text-brand-orange">melhores bares</span> pro
                seu jogo.
              </>
            }
            subtitle="Em 2 passos a gente calibra sua busca: esportes favoritos e raio de localização."
            features={WELCOME_FEATURES}
            accent="orange"
          />
        )}

        {step === 1 && (
          <div>
            <h2 className="font-heading text-3xl font-bold mb-2">
              Quais esportes você curte?
            </h2>
            <p className="text-white/70 mb-6">
              Marque tudo que você acompanha — a gente filtra os bares pra você.
            </p>
            <SportSelector
              sports={sports}
              selectedIds={selectedSportIds}
              onToggle={toggleSport}
              isLoading={loadingSports}
              iconMap={SPORT_ICONS}
            />
            <p className="text-xs text-white/40 mt-6">
              {selectedSportIds.length} selecionado
              {selectedSportIds.length === 1 ? '' : 's'} — escolha pelo menos 1.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-heading text-3xl font-bold mb-2">
              Quão longe você topa ir?
            </h2>
            <p className="text-white/70 mb-6">
              A distância define quais bares aparecem pra você.
            </p>
            <RadiusSelector
              value={radius}
              options={RADIUS_OPTIONS}
              onChange={(km) => setRadius(km as RadiusKm)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-6">
            <div className="mx-auto mb-6 grid place-items-center size-20 rounded-full bg-brand-orange">
              <HugeiconsIcon
                icon={Tick01Icon}
                size={40}
                color="currentColor"
                strokeWidth={1.5}
              />
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-bold leading-tight mb-3">
              Tudo pronto, torcedor!
            </h2>
            <p className="text-white/70 max-w-md mx-auto mb-8">
              Seu feed já tá calibrado. Bora ver quais bares estão com jogo
              agora.
            </p>
            <div className="inline-flex flex-wrap gap-2 justify-center">
              {sports
                .filter((s) => selectedSportIds.includes(s.id))
                .map((s) => (
                  <span
                    key={s.id}
                    className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold"
                  >
                    {s.name}
                  </span>
                ))}
              <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold">
                {radius} km
              </span>
            </div>
          </div>
        )}
      </OnboardingStep>

      {error && (
        <p className="text-center text-sm text-red-400 mt-4">{error}</p>
      )}

      <OnboardingNavigation
        step={step}
        totalSteps={STEPS.length}
        canAdvance={canAdvance}
        isPending={completeMutation.isPending}
        onBack={back}
        onNext={next}
        accent="orange"
        lastLabel="Encontrar bares perto de mim"
      />
    </OnboardingLayout>
  )
}
