import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CityField,
  cityFieldValue,
  cityLabel,
  isCityPending
} from '@/components/app/city-field'
import { type AuthPanel, AuthShell } from '@/components/entrada/auth-shell'
import { People, Pin, Tv } from '@/components/landing/v3/icons'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { RadiusSelector } from '@/components/onboarding/radius-selector'
import { SportSelector } from '@/components/onboarding/sport-selector'
import {
  confirmDroppingTeams,
  type FavoriteTeam,
  TeamPicker
} from '@/components/sports/team-picker'
import { type RadiusKm, SEARCH_RADII } from '@/domain/discovery'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { getCallbackUrl } from '@/utils/callback-url'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/fan')({
  head: () => ({
    meta: [
      { title: 'Configure sua conta de torcedor — Onside' },
      {
        name: 'description',
        content:
          'Personalize sua experiência: escolha seus esportes, quem você acompanha e o raio de busca. Leva menos de 1 minuto.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: FanOnboarding
})

const STEPS = ['Boas-vindas', 'Esportes', 'Times', 'Lugar', 'Pronto'] as const

const WELCOME_FEATURES: [ReactNode, string, string][] = [
  [
    <Tv key="tv" size={22} />,
    'Veja jogos ao vivo perto de você',
    'Com telão, som e o jogo marcado.'
  ],
  [
    <Pin key="pin" size={22} />,
    'Bares dentro do seu raio',
    'Você escolhe até onde topa ir.'
  ],
  [
    <People key="people" size={22} />,
    'Leve a galera junto',
    'Mande o bar e o jogo pro grupo.'
  ]
]

/** O telão à direita, com uma legenda curta por passo (design do torcedor). */
const PANELS: AuthPanel[] = [
  { kind: 'caption', led: 'hero', title: 'Onde vai ser o jogo?' },
  { kind: 'caption', led: 'crowd', title: 'O jogo certo' },
  { kind: 'caption', led: 'scarf', title: 'No bar certo' },
  { kind: 'caption', led: 'crowd', title: 'Perto de você' },
  {
    kind: 'caption',
    led: 'hero',
    title: (
      <>
        Bora<span>?</span>
      </>
    )
  }
]

function FanOnboarding() {
  const navigate = useNavigate()
  const callbackUrl = getCallbackUrl(useLocation().href)
  const trpc = useTRPC()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstName = Route.useRouteContext({
    select: (context) => context.session?.user.name.trim().split(/\s+/)[0]
  })

  const [step, setStep] = useState(0)
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([])
  const [selectedTeams, setSelectedTeams] = useState<FavoriteTeam[]>([])
  const [radius, setRadius] = useState<RadiusKm>(3)
  const [city, setCity] = useState(() => cityFieldValue(null))
  const [error, setError] = useState<string | null>(null)

  const sportsQuery = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })
  const sports = sportsQuery.data ?? []
  const selectedSports = sports.filter((s) => selectedSportIds.includes(s.id))

  const seguirParaDestino = async () => {
    // `onboardingCompleted` e `searchRadiusKm` mudaram no banco por fora
    // do better-auth; sem regravar o cache de sessão o guard da rota
    // devolveria o usuário para cá.
    await refreshSessionCache()
    // Cadastro pela página do bar volta para ela (WEB-211). O `await` segura
    // o "Salvando…" do botão até a próxima tela abrir: sem ele a revisão
    // voltava a parecer parada, com a URL já trocada (WEB-286).
    await navigate({ to: callbackUrl })
  }

  const completeMutation = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        analytics.onboardingCompleted({
          role: 'fan',
          sports: selectedSports.map((s) => s.slug),
          radius_km: radius
        })
        await seguirParaDestino()
      },
      onError: async (err) => {
        const concluido = mensagemOnboardingJaConcluido(err)
        if (!concluido) {
          setError(
            getUserFacingMessage(
              err,
              'Não foi possível salvar suas preferências. Tente novamente.'
            )
          )
          return
        }
        toast.info(concluido)
        await seguirParaDestino()
      }
    })
  )

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: step === 0 })
  }, [step])

  const canAdvance = (() => {
    if (step === 0) return true
    if (step === 1) return selectedSportIds.length > 0
    // Cidade é opcional, mas texto digitado sem escolher na lista não é
    // cidade: seguir assim salvaria o perfil sem ela, em silêncio (WEB-319).
    if (step === 3) return radius > 0 && !isCityPending(city)
    return true
  })()

  const next = () => {
    setError(null)

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      completeMutation.mutate({
        sportIds: selectedSportIds,
        searchRadiusKm: radius,
        teamIds: selectedTeams.map((t) => t.id),
        city: city.city ?? undefined
      })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  const toggleSport = (id: string) => {
    if (selectedSportIds.includes(id)) {
      if (!confirmDroppingTeams(selectedTeams.filter((t) => t.sportId === id)))
        return
      setSelectedTeams((prev) => prev.filter((t) => t.sportId !== id))
      setSelectedSportIds((prev) => prev.filter((x) => x !== id))
    } else {
      setSelectedSportIds((prev) => [...prev, id])
    }
  }

  const heading = (content: ReactNode) => (
    <h1
      ref={step === 0 ? undefined : headingRef}
      tabIndex={-1}
      className="ob-h"
    >
      {content}
    </h1>
  )

  return (
    <AuthShell panel={PANELS[step] ?? PANELS[0]} className="ob3">
      <ol className="ob-seg" aria-hidden="true">
        {STEPS.map((name, i) => (
          <li key={name} className={i <= step ? 'on' : undefined} />
        ))}
      </ol>
      <p className="ob-stepk" aria-live="polite">
        {step + 1} de {STEPS.length} · {STEPS[step]}
      </p>

      <div key={step} className="ob-step-body">
        {step === 0 && (
          <>
            {heading(
              <>
                Vamos achar os melhores bares{' '}
                <span className="hl">pra você</span>
              </>
            )}
            <p className="ob-sub">
              Leva um minuto. Dá para mudar tudo depois no seu perfil.
            </p>
            <ul className="ob-ben">
              {WELCOME_FEATURES.map(([icon, title, text]) => (
                <li key={title}>
                  <i aria-hidden="true">{icon}</i>
                  <span>
                    <b>{title}</b>
                    <span>{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            {heading('Quais esportes você curte?')}
            <p className="ob-sub">
              Escolha pelo menos 1.{' '}
              <span className="ob-count">
                {selectedSportIds.length} selecionado
                {selectedSportIds.length === 1 ? '' : 's'}
              </span>
              .
            </p>
            <SportSelector
              sports={sports}
              selectedIds={selectedSportIds}
              onToggle={toggleSport}
              isLoading={sportsQuery.isLoading}
              isError={sportsQuery.isError}
              retryable={isRetryableError(sportsQuery.error)}
              onRetry={() => sportsQuery.refetch()}
            />
          </>
        )}

        {step === 2 && (
          <>
            {heading('Quem você acompanha?')}
            <p className="ob-sub">
              Times, seleções, pilotos e atletas. Opcional: marque quantos
              quiser em cada esporte, ou pule.
            </p>
            <div className="ob-teams">
              <TeamPicker
                sports={selectedSports}
                selected={selectedTeams}
                onChange={setSelectedTeams}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {heading('Quão longe você topa ir?')}
            <p className="ob-sub">
              Sua cidade e a distância definem quais bares aparecem pra você.
            </p>
            <div className="ob-city">
              <CityField
                label="Sua cidade"
                value={city}
                onChange={setCity}
                hint="Opcional. Sem a localização do navegador, a busca parte do centro dela."
              />
            </div>
            <RadiusSelector
              value={radius}
              options={SEARCH_RADII}
              onChange={setRadius}
            />
          </>
        )}

        {step === 4 && (
          <>
            {heading(
              firstName ? (
                <>
                  Tudo pronto, <span className="hl">{firstName}</span>
                </>
              ) : (
                'Tudo pronto'
              )
            )}
            <p className="ob-sub">
              Confira e salve. Em seguida abrimos os bares do seu raio.
            </p>
            <div className="ob-card">
              {[
                {
                  label: 'Esportes',
                  to: 1,
                  items: selectedSports.map((s) => ({ id: s.id, name: s.name }))
                },
                {
                  label: 'Times',
                  to: 2,
                  items: selectedTeams.map((t) => ({ id: t.id, name: t.name })),
                  empty: 'Nenhum por enquanto'
                },
                {
                  label: 'Raio',
                  to: 3,
                  items: [
                    { id: 'raio', name: `${radius} km` },
                    ...(city.city
                      ? [{ id: 'cidade', name: cityLabel(city.city) }]
                      : [])
                  ]
                }
              ].map((row) => (
                <div key={row.label} className="ob-ln">
                  <span>
                    <b>{row.label}</b>
                    {row.items.length ? (
                      <span className="ob-tags">
                        {row.items.map((item) => (
                          <span key={item.id} className="ob-tag">
                            {item.name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>{row.empty}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost ob-sm"
                    onClick={() => setStep(row.to)}
                    aria-label={`Editar ${row.label.toLowerCase()}`}
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="ob-error" role="alert">
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
        nextLabel={
          step === 2 && selectedTeams.length === 0 ? 'Pular' : undefined
        }
      />
    </AuthShell>
  )
}
