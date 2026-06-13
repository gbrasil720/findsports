import {
  DrinkIcon,
  MapPinIcon,
  SearchingIcon,
  Tick01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { OnboardingStep } from '@/components/onboarding/onboarding-step'
import { PubInfoForm } from '@/components/onboarding/pub-info-form'
import { StepProgress } from '@/components/onboarding/step-progress'
import { WelcomeStep } from '@/components/onboarding/welcome-step'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/pub')({
  head: () => ({
    meta: [
      { title: 'Cadastre seu bar — FindSports' },
      {
        name: 'description',
        content:
          'Coloque seu bar no radar dos torcedores. Cadastre em 1 minuto e comece a atrair clientes nos dias de jogo.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PubOnboarding
})

const STEPS = ['Boas-vindas', 'Seu estabelecimento', 'Pronto'] as const

const WELCOME_FEATURES = [
  { icon: DrinkIcon, text: 'Divulgue sua programação de jogos' },
  { icon: SearchingIcon, text: 'Apareça pra torcedores perto de você' },
  { icon: Tick01Icon, text: 'Lote nos dias de clássico' }
]

function PubOnboarding() {
  const navigate = useNavigate()
  const trpc = useTRPC()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('São Paulo')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const completeMutation = useMutation(
    trpc.onboarding.completePub.mutationOptions({
      onSuccess: () => navigate({ to: '/plan' }),
      onError: (err) => setError(err.message)
    })
  )

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case 'name':
        setName(value)
        break
      case 'address':
        setAddress(value)
        break
      case 'neighborhood':
        setNeighborhood(value)
        break
      case 'city':
        setCity(value)
        break
      case 'phone':
        setPhone(value)
        break
      case 'description':
        setDescription(value)
        break
    }
  }

  const canAdvance = (() => {
    if (step === 0) return true
    if (step === 1)
      return (
        name.trim().length > 1 &&
        neighborhood.trim().length > 1 &&
        address.trim().length > 4
      )
    return true
  })()

  const next = () => {
    setError(null)
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      completeMutation.mutate({
        name,
        address,
        neighborhood,
        city,
        phone: phone || undefined,
        description: description || undefined
      })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  return (
    <OnboardingLayout variant="pub">
      <OnboardingHeader label="Conta de bar" accent="blue" />
      <StepProgress step={step} steps={STEPS} accent="blue" />

      <OnboardingStep accent="blue">
        {step === 0 && (
          <WelcomeStep
            eyebrow="Seu bar no radar dos torcedores."
            title={
              <>
                Vamos lotar sua casa nos{' '}
                <span className="text-brand-blue">próximos clássicos</span>.
              </>
            }
            subtitle="Cadastre seu bar em 1 minuto. Torcedores da região já podem te encontrar."
            features={WELCOME_FEATURES}
            accent="blue"
          />
        )}

        {step === 1 && (
          <div>
            <h2 className="font-heading text-3xl font-bold mb-2">
              Conta um pouco do seu bar.
            </h2>
            <p className="text-white/70 mb-6">
              Essas informações aparecem para torcedores que buscam bares perto
              deles.
            </p>
            <PubInfoForm
              name={name}
              address={address}
              neighborhood={neighborhood}
              city={city}
              phone={phone}
              description={description}
              onChange={handleFieldChange}
            />
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-6">
            <div className="mx-auto mb-6 grid place-items-center size-20 rounded-full bg-brand-blue">
              <HugeiconsIcon
                icon={Tick01Icon}
                size={40}
                color="currentColor"
                strokeWidth={1.5}
              />
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-bold leading-tight mb-3">
              Bar cadastrado!
            </h2>
            <p className="text-white/70 max-w-md mx-auto mb-8">
              Seu bar já aparece pra torcedores da região. Agora cadastre os
              jogos que você vai transmitir e comece a atrair clientes.
            </p>
            <div className="inline-flex flex-wrap gap-2 justify-center">
              <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold">
                {name}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold flex items-center gap-1">
                <HugeiconsIcon
                  icon={MapPinIcon}
                  size={12}
                  color="currentColor"
                  strokeWidth={1.5}
                />{' '}
                {neighborhood}
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
        accent="blue"
        lastLabel="Ir pro meu painel"
      />
    </OnboardingLayout>
  )
}
