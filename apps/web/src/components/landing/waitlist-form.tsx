import { Button } from '@findsports_oficial/ui/components/button'
import {
  Field,
  FieldGroup,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@findsports_oficial/ui/components/input-group'
import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Location from 'reicon-react/icons/Location'
import Store from 'reicon-react/icons/Store'
import { analytics } from '../../lib/analytics'
import { useTRPCClient } from '../../utils/trpc'

const igCn =
  'h-auto rounded-xl border-2 border-zinc-200 bg-white transition-colors has-[[data-slot=input-group-control]:focus-visible]:border-brand-orange has-[[data-slot=input-group-control]:focus-visible]:ring-0'

const iiCn = 'h-auto py-4 pr-6 text-sm placeholder:text-zinc-400'

export function WaitlistForm() {
  const [role, setRole] = useState<'fan' | 'pub'>('fan')
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pubName, setPubName] = useState('')

  const client = useTRPCClient()

  type JoinPayload =
    | { role: 'fan'; email: string; city: string }
    | { role: 'pub'; email: string; city: string; pubName: string }

  const { mutate, isPending } = useMutation({
    mutationFn: (data: JoinPayload) => client.waitlist.join.mutate(data),
    onSuccess: () => {
      setSuccess(true)
      setErrorMsg(null)
      analytics.waitlistSubmitted(role)
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)

    const form = e.currentTarget
    const email = (
      form.elements.namedItem('email') as HTMLInputElement
    ).value.trim()
    const city = (
      form.elements.namedItem('city') as HTMLInputElement | null
    )?.value.trim()

    if (!email) return
    if (!city || city.length < 2) {
      setErrorMsg('Informe a cidade.')
      return
    }

    if (role === 'pub') {
      const normalizedPubName = pubName.replace(/\s+/g, ' ').trim()
      if (normalizedPubName.length < 2) {
        setErrorMsg('Informe o nome do bar.')
        return
      }
      mutate({
        email,
        city,
        role: 'pub',
        pubName: normalizedPubName
      })
      return
    }

    mutate({
      email,
      city,
      role: 'fan'
    })
  }

  return (
    <section
      id="waitlist"
      className="bg-gradient-to-b from-white to-zinc-50 px-6 py-24 md:px-8 md:py-32"
      aria-labelledby="waitlist-title"
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center md:mb-12">
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
            Lista de espera
          </span>
          <h2
            id="waitlist-title"
            className="mt-3 mb-4 font-bold font-heading text-4xl md:text-5xl"
          >
            ENTRE NO TIME TITULAR.
          </h2>
          <p className="text-zinc-600 md:text-lg">
            Mais de 1.800 torcedores já reservaram sua vaga. Acesso antecipado e
            condições exclusivas para quem entrar agora.
          </p>
        </div>

        {success ? (
          <div className="rounded-xl bg-zinc-100 px-6 py-8 text-center">
            <p className="mb-2 font-bold text-lg text-zinc-800">
              Você está no time!
            </p>
            <p className="text-sm text-zinc-500">
              Compartilhe com torcedores da sua cidade — quanto mais pessoas se
              inscreverem, mais rápido chegamos até você.
            </p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-5"
            noValidate
            onSubmit={handleSubmit}
          >
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel className="sr-only">E-mail</FieldLabel>
                  <InputGroup className={igCn}>
                    <InputGroupAddon className="pl-4">
                      <Envelope
                        size={16}
                        color="currentColor"
                        className="text-zinc-400"
                      />
                    </InputGroupAddon>
                    <InputGroupInput
                      type="email"
                      name="email"
                      placeholder="seu@email.com"
                      autoComplete="email"
                      maxLength={255}
                      required
                      className={iiCn}
                    />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel className="sr-only">Cidade</FieldLabel>
                  <InputGroup className={igCn}>
                    <InputGroupAddon className="pl-4">
                      <Location
                        size={16}
                        color="currentColor"
                        className="text-zinc-400"
                      />
                    </InputGroupAddon>
                    <InputGroupInput
                      type="text"
                      name="city"
                      placeholder="Sua cidade"
                      autoComplete="address-level2"
                      maxLength={100}
                      required
                      className={iiCn}
                    />
                  </InputGroup>
                </Field>
              </div>
            </FieldGroup>

            <ToggleGroup
              value={[role]}
              onValueChange={(values) => {
                if (values.length > 0) {
                  const newRole = values[values.length - 1] as 'fan' | 'pub'
                  setRole(newRole)
                }
              }}
              className="relative grid w-full grid-cols-2 rounded-xl bg-zinc-100 p-1"
            >
              <ToggleGroupItem
                value="fan"
                className="relative cursor-pointer rounded-lg px-4 py-3 font-bold text-sm text-zinc-500 uppercase tracking-wider transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-orange aria-pressed:shadow-sm"
              >
                Sou Torcedor
              </ToggleGroupItem>
              <ToggleGroupItem
                value="pub"
                className="relative cursor-pointer rounded-lg px-4 py-3 font-bold text-sm text-zinc-500 uppercase tracking-wider transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-blue aria-pressed:shadow-sm"
              >
                Tenho um Bar
              </ToggleGroupItem>
            </ToggleGroup>

            {role === 'pub' && (
              <Field>
                <FieldLabel className="sr-only">Nome do bar</FieldLabel>
                <InputGroup className={igCn}>
                  <InputGroupAddon className="pl-4">
                    <Store
                      size={16}
                      color="currentColor"
                      className="text-zinc-400"
                    />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="text"
                    placeholder="Nome do bar"
                    autoComplete="organization"
                    maxLength={100}
                    value={pubName}
                    onChange={(e) => setPubName(e.target.value)}
                    required
                    className={iiCn}
                  />
                </InputGroup>
              </Field>
            )}

            {errorMsg && (
              <p className="text-center text-red-500 text-sm">{errorMsg}</p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              onClick={() => analytics.landingCtaClicked('waitlist_submit')}
              className="w-full cursor-pointer rounded-xl bg-black py-5 font-bold text-sm text-white uppercase tracking-[0.2em] ring-offset-white transition-all duration-300 will-change-transform hover:bg-brand-orange hover:ring-4 hover:ring-brand-orange/50 hover:ring-offset-2 focus-visible:border-transparent focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-black disabled:hover:ring-0"
            >
              {isPending ? 'Aguarde...' : 'Garantir acesso antecipado'}
            </Button>

            <p className="text-center text-xs text-zinc-500">
              Mais de 1.800 torcedores já na fila · Sem spam · Um e-mail no
              lançamento
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
