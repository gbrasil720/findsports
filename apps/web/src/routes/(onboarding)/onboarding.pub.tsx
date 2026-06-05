/** biome-ignore-all lint/suspicious/noArrayIndexKey: <> */
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Beer,
  Check,
  MapPin,
  Search
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/landing/logo'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/pub')({
  head: () => ({
    meta: [
      { title: 'Bem-vindo ao Painel — FindSports' },
      {
        name: 'description',
        content: 'Configure seu bar no FindSports em poucos passos.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PubOnboarding
})

const STEPS = ['Boas-vindas', 'Seu estabelecimento', 'Pronto']

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
      onSuccess: () => navigate({ to: '/login' }),
      onError: (err) => setError(err.message)
    })
  )

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
            <span className="size-2 rounded-full bg-brand-blue" />
            Conta de bar
          </div>
        </div>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-brand-blue' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
            <span>
              Passo {step + 1} de {STEPS.length}
            </span>
            <span className="text-brand-blue">{STEPS[step]}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white/4 backdrop-blur-md ring-1 ring-brand-blue/40 p-7 md:p-10 min-h-[420px]">
          {step === 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-blue mb-3">
                Bem-vindo ao painel do bar
              </p>
              <h1 className="font-heading text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-5">
                Vamos lotar sua casa nos{' '}
                <span className="text-brand-blue">próximos clássicos</span>.
              </h1>
              <p className="text-white/70 text-lg max-w-xl">
                Em 1 passo rápido a gente prepara seu painel: dados do bar e
                pronto.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-8">
                {[
                  { i: Beer, t: 'Anuncie seus jogos' },
                  { i: Search, t: 'Apareça nas buscas' },
                  { i: Check, t: 'Mais clientes' }
                ].map(({ i: Icon, t }) => (
                  <div
                    key={t}
                    className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-3 text-sm"
                  >
                    <Icon className="size-4 text-brand-blue" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-heading text-3xl font-bold mb-2">
                Conta um pouco do seu bar.
              </h2>
              <p className="text-white/70 mb-6">
                Isso é o que vai aparecer pros torcedores.
              </p>
              <div className="space-y-4 max-w-md">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                    Nome do estabelecimento *
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Bar do Zé"
                    className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                    Endereço *
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: Rua Aspicuelta, 123"
                    className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                      Bairro *
                    </span>
                    <input
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Ex: Vila Madalena"
                      className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                      Cidade
                    </span>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="São Paulo"
                      className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                    Telefone
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2 block">
                    Descrição
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Bar esportivo com 4 TVs e transmissão de todos os jogos"
                    rows={3}
                    className="w-full bg-white/5 ring-1 ring-white/10 focus:ring-brand-blue/60 rounded-xl px-4 py-3 outline-none transition resize-none"
                  />
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center py-6">
              <div className="mx-auto mb-6 grid place-items-center size-20 rounded-full bg-brand-blue">
                <Check className="size-10" />
              </div>
              <h2 className="font-heading text-4xl md:text-5xl font-bold leading-tight mb-3">
                Tudo pronto!
              </h2>
              <p className="text-white/70 max-w-md mx-auto mb-8">
                Seu painel está pronto. Bora cadastrar os próximos jogos e
                atrair torcedores.
              </p>
              <div className="inline-flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold">
                  {name}
                </span>
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold flex items-center gap-1">
                  <MapPin className="size-3" /> {neighborhood}
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
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all bg-brand-blue text-white disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.03]"
          >
            {completeMutation.isPending
              ? 'Salvando...'
              : step === 0
                ? 'Começar'
                : step === STEPS.length - 1
                  ? 'Abrir painel'
                  : 'Continuar'}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
