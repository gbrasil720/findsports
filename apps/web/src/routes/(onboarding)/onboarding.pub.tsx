import { cidadeLiberada } from '@findsports_oficial/api/lib/city-match'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Location from 'reicon-react/icons/Location'
import Search from 'reicon-react/icons/Search'
import Store from 'reicon-react/icons/Store'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { OnboardingStep } from '@/components/onboarding/onboarding-step'
import { PubInfoForm } from '@/components/onboarding/pub-info-form'
import { StepProgress } from '@/components/onboarding/step-progress'
import { WelcomeStep } from '@/components/onboarding/welcome-step'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/pub')({
  head: () => ({
    meta: [
      { title: 'Cadastre seu bar — Onside' },
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

const STEPS = ['Boas-vindas', 'Seu estabelecimento', 'Revisão'] as const

const WELCOME_FEATURES = [
  { icon: Store, text: 'Divulgue sua programação de jogos' },
  { icon: Search, text: 'Apareça pra torcedores perto de você' },
  { icon: Check, text: 'Lote nos dias de clássico' }
]

function PubOnboarding() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('São Paulo')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // ESC-19: lançamento cidade a cidade. Quem recusa de verdade é
  // `onboarding.completePub`; aqui a tela só evita que o dono do bar preencha
  // o cadastro inteiro para descobrir no fim que a cidade dele não abriu.
  //
  // Lista vazia — inclusive enquanto carrega, ou se a leitura falhar —
  // significa "todas liberadas", que é o padrão da flag. Errar para o lado de
  // deixar passar devolve a mensagem do servidor; errar para o outro
  // bloquearia cadastro válido.
  const configQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const cidadesAbertas = configQuery.data?.['launch.pub_cities'] ?? []
  const cidadePermitida = cidadeLiberada(city, cidadesAbertas)

  const completeMutation = useMutation(
    trpc.onboarding.completePub.mutationOptions({
      onSuccess: async () => {
        analytics.onboardingCompleted({ role: 'pub' })
        // `onboardingCompleted` mudou no banco por fora do better-auth; sem
        // regravar o cache de sessão o guard da rota devolveria o usuário
        // para cá. Se a releitura falhar, seguimos assim mesmo — o guard
        // revalida no servidor e o pior caso é ver o onboarding de novo.
        await refreshSessionCache().catch(() => {})
        navigate({ to: '/plan' })
      },
      onError: (err) => setError(err.message)
    })
  )

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: step === 0 })
  }, [step])

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
        address.trim().length > 4 &&
        cidadePermitida
      )
    return true
  })()

  const next = () => {
    setError(null)

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      completeMutation.mutate({
        name: name.trim(),
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim() || undefined,
        phone: phone.trim() || undefined,
        description: description.trim() || undefined
      })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  return (
    <OnboardingLayout variant="pub">
      <OnboardingHeader label="Conta de bar" />
      <StepProgress step={step} steps={STEPS} />

      <OnboardingStep>
        {step === 0 && (
          <WelcomeStep
            eyebrow="Seu bar no radar dos torcedores."
            title={
              <>
                Vamos lotar sua casa nos{' '}
                <span className="text-[var(--onside-acid)]">
                  próximos clássicos
                </span>
                .
              </>
            }
            subtitle="Cadastre seu bar em 1 minuto. Torcedores da região já podem te encontrar."
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
              Conta um pouco do seu bar.
            </h2>
            <p className="onside-text-muted-on-ink mb-6">
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

            {!cidadePermitida ? (
              <div
                className="onside-callout onside-callout-warn mt-6"
                role="status"
              >
                <p className="text-sm font-semibold">
                  A Onside ainda não abriu em {city.trim() || 'sua cidade'}.
                </p>
                <p className="text-sm">
                  Por enquanto atendemos: {cidadesAbertas.join(', ')}. Estamos
                  abrindo cidade a cidade — assim que chegarmos aí, avisamos.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="py-4 text-center md:py-6">
            <div className="onside-panel-acid mx-auto mb-6 grid size-20 place-items-center">
              <Check size={40} color="currentColor" aria-hidden="true" />
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="onside-display mb-3 text-4xl text-[var(--onside-paper)] outline-none md:text-5xl"
            >
              Pronto para escolher o plano
            </h2>
            <p className="onside-text-muted-on-ink mx-auto mb-8 max-w-md">
              Revise os dados do bar. Ao continuar, salvamos o cadastro e você
              escolhe o plano.
            </p>
            <div className="inline-flex flex-wrap justify-center gap-2">
              <span className="onside-badge border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_10%)] text-[var(--onside-paper)]">
                {name.trim() || '…'}
              </span>
              <span className="onside-badge inline-flex items-center gap-1 border-[rgb(241_238_230_/_30%)] bg-[rgb(241_238_230_/_10%)] text-[var(--onside-paper)]">
                <Location size={12} color="currentColor" aria-hidden="true" />
                {neighborhood.trim() || '…'}
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
        lastLabel="Escolher meu plano"
      />
    </OnboardingLayout>
  )
}
