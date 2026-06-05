/** biome-ignore-all lint/suspicious/noArrayIndexKey: <> */
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Car,
  Check,
  CircleDot,
  Dumbbell,
  Flame,
  MapPin,
  Target,
  Trophy,
  Volleyball
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/landing/logo'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/fan')({
  head: () => ({
    meta: [
      { title: 'Bem-vindo, Torcedor — FindSports' },
      {
        name: 'description',
        content: 'Configure sua conta FindSports em poucos passos.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: FanOnboarding
})

const SPORT_ICONS: Record<string, React.ElementType> = {
  futebol: Trophy,
  basquete: CircleDot,
  volei: Volleyball,
  'futebol-americano': Dumbbell,
  'formula-1': Car,
  'mma-ufc': Target
}

const STEPS = ['Boas-vindas', 'Seus esportes', 'Onde você assiste', 'Pronto']
const RADIUS_OPTIONS = [1, 3, 5, 10] as const
type RadiusKm = (typeof RADIUS_OPTIONS)[number]

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
      onSuccess: () => navigate({ to: '/dashboard' }),
      onError: (err) => setError(err.message)
    })
  )

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
    <div className="min-h-screen bg-zinc-950 text-white px-6 py-10 md:py-14 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,90,31,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(22,104,255,0.25),transparent_55%)]" />

      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="font-heading text-xl font-bold tracking-tight">
              FindSports
            </span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">
            <span className="size-2 rounded-full bg-brand-orange" />
            Conta de torcedor
          </div>
        </div>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-brand-orange' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
            <span>
              Passo {step + 1} de {STEPS.length}
            </span>
            <span className="text-brand-orange">{STEPS[step]}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white/4 backdrop-blur-md ring-1 ring-brand-orange/40 p-7 md:p-10 min-h-[420px]">
          {step === 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-orange mb-3">
                Bem-vindo, torcedor
              </p>
              <h1 className="font-heading text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-5">
                Vamos achar os{' '}
                <span className="text-brand-orange">melhores bares</span> pro
                seu jogo.
              </h1>
              <p className="text-white/70 text-lg max-w-xl">
                Em 2 passos rápidos a gente personaliza a sua experiência:
                esportes, raio de busca e pronto.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-8">
                {[
                  { i: Flame, t: 'Jogo ao vivo perto' },
                  { i: MapPin, t: 'Bares no seu raio' },
                  { i: Check, t: 'Marca a galera' }
                ].map(({ i: Icon, t }) => (
                  <div
                    key={t}
                    className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-3 text-sm"
                  >
                    <Icon className="size-4 text-brand-orange" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-heading text-3xl font-bold mb-2">
                Quais esportes você curte?
              </h2>
              <p className="text-white/70 mb-6">
                Marque tudo que você acompanha — a gente filtra os bares pra
                você.
              </p>

              {loadingSports ? (
                <div className="text-white/40 text-sm">
                  Carregando esportes...
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {sports.map((s) => {
                    const on = selectedSportIds.includes(s.id)
                    const Icon = SPORT_ICONS[s.slug] ?? Trophy
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSport(s.id)}
                        className={`relative rounded-2xl p-5 text-left transition-all ring-1 ${
                          on
                            ? 'bg-brand-orange text-white ring-transparent scale-[1.02]'
                            : 'bg-white/5 ring-white/10 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="size-6 mb-3 opacity-90" />
                        <div className="font-heading text-lg font-bold leading-none">
                          {s.name}
                        </div>
                        {on && (
                          <Check className="absolute top-3 right-3 size-4" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              <p className="text-xs text-white/40 mt-6">
                {selectedSportIds.length} selecionado
                {selectedSportIds.length === 1 ? '' : 's'} — escolha pelo menos
                1.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-heading text-3xl font-bold mb-2">
                Quão longe você topa ir?
              </h2>
              <p className="text-white/70 mb-6">
                A gente busca bares dentro do seu raio.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {RADIUS_OPTIONS.map((km) => {
                  const on = radius === km
                  return (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setRadius(km)}
                      className={`relative rounded-2xl p-5 text-left transition-all ring-1 ${
                        on
                          ? 'bg-brand-orange text-white ring-transparent'
                          : 'bg-white/5 ring-white/10 hover:bg-white/10'
                      }`}
                    >
                      <MapPin className="size-5 mb-3 opacity-80" />
                      <div className="font-heading text-2xl font-bold leading-none">
                        {km} km
                      </div>
                      <div className="text-xs mt-1 opacity-80">
                        {km === 1
                          ? 'a pé'
                          : km === 3
                            ? 'bem perto'
                            : km === 5
                              ? 'no bairro'
                              : 'explorar mais'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div className="mx-auto mb-6 grid place-items-center size-20 rounded-full bg-brand-orange">
                <Check className="size-10" />
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
        </div>

        {error && (
          <p className="text-center text-sm text-red-400 mt-4">{error}</p>
        )}

        <div className="flex items-center justify-between mt-7">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowLeft className="size-4" /> Voltar
          </button>

          <button
            type="button"
            onClick={next}
            disabled={!canAdvance || completeMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all bg-brand-orange text-white disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.03]"
          >
            {completeMutation.isPending
              ? 'Salvando...'
              : step === 0
                ? 'Começar'
                : step === STEPS.length - 1
                  ? 'Entrar no app'
                  : 'Continuar'}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
