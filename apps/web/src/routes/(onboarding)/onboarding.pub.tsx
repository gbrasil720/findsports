import {
  declaredAmenityIds,
  findAmenity,
  motivoTelasInvalido
} from '@findsports_oficial/api/lib/amenities'
import {
  ehUf,
  motivoTelefoneInvalido
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { cidadeLiberada } from '@findsports_oficial/api/lib/city-match'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Location from 'reicon-react/icons/Location'
import Search from 'reicon-react/icons/Search'
import Store from 'reicon-react/icons/Store'
import { toast } from 'sonner'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { OnboardingStep } from '@/components/onboarding/onboarding-step'
import { PubAmenitiesStep } from '@/components/onboarding/pub-amenities-step'
import { PubInfoForm } from '@/components/onboarding/pub-info-form'
import { StepProgress } from '@/components/onboarding/step-progress'
import { WelcomeStep } from '@/components/onboarding/welcome-step'
import { conciliarUfComCidade } from '@/components/uf-select'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { readPendingEmail } from '@/lib/pending-verification'
import {
  mensagemFalhaCadastroBar,
  PUB_ONBOARDING_DRAFT_KEY,
  type PubOnboardingDraft,
  parsePubOnboardingDraft,
  serializePubOnboardingDraft
} from '@/lib/pub-onboarding-draft'
import { roleAccountLabel } from '@/lib/roles'
import { getCallbackUrl } from '@/utils/callback-url'
import { formatStoredPhone } from '@/utils/format-phone'
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

const STEPS = [
  'Boas-vindas',
  'Seu estabelecimento',
  'O que seu bar oferece',
  'Revisão'
] as const

const WELCOME_FEATURES = [
  { icon: Store, text: 'Divulgue sua programação de jogos' },
  { icon: Search, text: 'Apareça pra torcedores perto de você' },
  { icon: Check, text: 'Lote nos dias de clássico' }
]

function PubOnboarding() {
  const navigate = useNavigate()
  const callbackUrl = getCallbackUrl(useLocation().href)
  const trpc = useTRPC()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const user = Route.useRouteContext({
    select: (context) => context.session?.user
  })
  // Conta do rascunho e do envio: a sessão viva do better-auth, que se
  // atualiza quando o dono volta a esta aba. O contexto da rota é de quando a
  // aba carregou: quem se cadastrou aqui como A e entrou como B em outra aba
  // seguia "sem sessão", e o rascunho de B saía no nome de A — na volta era
  // descartado. Havendo sessão o dono é o e-mail dela; o e-mail pendente do
  // cadastro só vale sem sessão.
  const conta = useSession()?.user ?? user

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('São Paulo')
  // Nasce com a UF da cidade que já vem preenchida; trocar a cidade concilia
  // as duas (`conciliarUfComCidade`).
  const [uf, setUf] = useState('SP')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<number[]>([])
  const [screenCount, setScreenCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)

  const draft = useMemo<PubOnboardingDraft>(
    () => ({
      name: name.trim(),
      address: address.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim() || undefined,
      uf: ehUf(uf) ? uf : undefined,
      phone: phone.trim() || undefined,
      description: description.trim() || undefined,
      amenities: amenities.length > 0 ? amenities : undefined,
      screenCount: screenCount ?? undefined
    }),
    [
      name,
      address,
      neighborhood,
      city,
      uf,
      phone,
      description,
      amenities,
      screenCount
    ]
  )

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

  const seguirParaPlano = async () => {
    localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
    // `onboardingCompleted` mudou no banco por fora do better-auth; sem
    // regravar o cache de sessão o guard da rota devolveria o usuário
    // para cá.
    await refreshSessionCache()
    // Deep link que esperou a liberação volta para ele; sem destino, o plano.
    // `await`: o botão segue em "salvando" até a próxima tela abrir, em vez
    // de voltar ao normal com a revisão ainda na tela (WEB-286).
    await navigate({ to: callbackUrl === '/dashboard' ? '/plan' : callbackUrl })
  }

  const completeMutation = useMutation(
    trpc.onboarding.completePub.mutationOptions({
      onSuccess: async () => {
        analytics.onboardingCompleted({ role: 'pub' })
        await seguirParaPlano()
      },
      onError: async (err, draft) => {
        const concluido = mensagemOnboardingJaConcluido(err)
        if (!concluido) {
          setError(mensagemFalhaCadastroBar(err, draft))
          return
        }
        toast.info(concluido)
        await seguirParaPlano()
      }
    })
  )

  // `/verify-email` manda de volta para cá quando o servidor recusa o
  // rascunho: os campos voltam preenchidos, no passo que dá para corrigir.
  //
  // WEB-262: só o rascunho desta conta volta, e com aviso e saída — os campos
  // do passo seguinte também vêm preenchidos, e sem o aviso o dono publicava
  // uma descrição antiga sem ter visto. O que não serve (outra conta, vencido)
  // sai do navegador aqui. A conta é a da sessão ou, vindo do cadastro ainda
  // sem sessão, o e-mail que a aba acabou de cadastrar.
  //
  // O rascunho gravado no meio do wizard volta no passo em que o dono parou;
  // o que passou pela revisão não tem passo e abre no formulário.
  const sessionEmail = user?.email
  const contaEmail = conta?.email
  useEffect(() => {
    const email = contaEmail ?? readPendingEmail()
    if (!email) return
    const salvo = parsePubOnboardingDraft(
      localStorage.getItem(PUB_ONBOARDING_DRAFT_KEY),
      email
    )
    if (!salvo) {
      localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
      return
    }
    setName(salvo.name)
    setAddress(salvo.address)
    setNeighborhood(salvo.neighborhood)
    setCity(salvo.city ?? 'São Paulo')
    // Rascunho de antes do campo vem sem UF (WEB-270): a cidade preenche
    // quando só existe em um estado; senão o dono escolhe.
    setUf(salvo.uf ?? '')
    conciliarUfComCidade(salvo.city ?? 'São Paulo', setUf)
    setPhone(salvo.phone ?? '')
    setDescription(salvo.description ?? '')
    // Rascunho antigo pode trazer "Aceita reserva", que saiu do checklist.
    setAmenities(declaredAmenityIds(salvo.amenities ?? []))
    setScreenCount(salvo.screenCount ?? null)
    setPhoneError(motivoTelefoneInvalido(salvo.phone))
    setDraftRestored(true)
    setStep(Math.min(salvo.step ?? 1, STEPS.length - 1))
  }, [contaEmail])

  // Recarregar a página no meio do wizard zerava os quatro passos: o rascunho
  // só era gravado ao concluir a revisão. Agora ele acompanha o preenchimento,
  // com o passo, pela mesma regra da WEB-262 (só com dono); `seguirParaPlano`
  // o apaga quando o bar é criado. Vem depois do efeito acima de propósito: se
  // a conta mudou, aquele tira o rascunho da anterior e este grava o da atual.
  //
  // Nas boas-vindas não há o que guardar. Formulário em branco apaga em vez de
  // gravar, para o "Descartar" não voltar como rascunho vazio.
  useEffect(() => {
    const email = contaEmail ?? readPendingEmail()
    if (step === 0 || !email) return
    if (!draft.name && !draft.address && !draft.neighborhood && !draft.phone) {
      localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
      return
    }
    localStorage.setItem(
      PUB_ONBOARDING_DRAFT_KEY,
      serializePubOnboardingDraft({ ...draft, step }, email)
    )
  }, [contaEmail, step, draft])

  // WEB-349: a rota é pública por causa de quem acabou de se cadastrar nesta
  // aba. Em aba sem sessão e sem esse cadastro (aba nova, link direto) não há
  // de quem guardar o rascunho: o dono preenchia tudo e, ao concluir, perdia.
  // Pede o login antes, com o mesmo destino das rotas protegidas, e volta.
  //
  // O destino sai de `window.location`, e não do `useLocation`: este muda
  // assim que a navegação começa, com o wizard ainda montado, e o efeito
  // dispararia de novo levando o próprio `/login` como destino.
  useEffect(() => {
    if (sessionEmail || readPendingEmail()) return
    navigate({
      to: '/login',
      search: {
        callbackUrl: window.location.pathname + window.location.search
      },
      replace: true
    })
  }, [sessionEmail, navigate])

  const discardDraft = () => {
    localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
    setName('')
    setAddress('')
    setNeighborhood('')
    setCity('São Paulo')
    setUf('SP')
    setPhone('')
    setDescription('')
    setAmenities([])
    setScreenCount(null)
    setPhoneError(null)
    setError(null)
    setDraftRestored(false)
  }

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
      case 'uf':
        setUf(value)
        break
      case 'phone':
        setPhone(value)
        setPhoneError(null)
        break
    }
  }

  const toggleAmenity = (id: number) => {
    setAmenities((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  // WEB-270: o botão desabilitado diz o que falta, no mesmo tom do "Para
  // salvar, falta preencher: …" do formulário de evento. O texto e o
  // `disabled` saem da mesma conta, para um nunca contradizer o outro.
  const blockedHint = (() => {
    if (step === 1) {
      const curto = (valor: string, minimo: number, rotulo: string) =>
        valor.trim().length < minimo &&
        (valor.trim() ? `${rotulo} (pelo menos ${minimo} caracteres)` : rotulo)
      const faltando = [
        curto(name, 2, 'nome do estabelecimento'),
        curto(address, 5, 'endereço'),
        curto(neighborhood, 2, 'bairro'),
        // O aviso logo acima do botão já explica a cidade fora do lançamento.
        !cidadePermitida && 'uma cidade em que a Onside já abriu',
        !ehUf(uf) && 'estado (UF)'
      ].filter(Boolean)
      return faltando.length > 0
        ? `Para continuar, falta preencher: ${faltando.join(', ')}.`
        : null
    }
    // A regra do número está ao lado do campo, no checklist (WEB-280).
    if (step === 2 && motivoTelasInvalido(screenCount) !== null) {
      return 'Para continuar, corrija o número de telas.'
    }
    return null
  })()
  const canAdvance = blockedHint === null

  const next = () => {
    setError(null)

    // Mesma regra do servidor, conferida aqui porque sem e-mail confirmado o
    // cadastro só é enviado depois, de `/verify-email`, longe deste campo.
    if (step === 1) {
      const motivo = motivoTelefoneInvalido(phone)
      setPhoneError(motivo)
      if (motivo) return
    }

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      if (conta?.emailVerified) {
        completeMutation.mutate(draft)
        return
      }
      // Sem e-mail confirmado o cadastro só é enviado de `/verify-email`. Sem
      // sessão e sem cadastro nesta aba não há de quem guardar o rascunho;
      // `/verify-email` oferece o login.
      const email = conta?.email ?? readPendingEmail()
      if (email) {
        localStorage.setItem(
          PUB_ONBOARDING_DRAFT_KEY,
          serializePubOnboardingDraft(draft, email)
        )
      }
      navigate({ to: '/verify-email' })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  return (
    <OnboardingLayout variant="pub">
      <OnboardingHeader label={roleAccountLabel('pub')} />
      <StepProgress step={step} steps={STEPS} />

      <OnboardingStep step={step}>
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
          <div
            aria-busy={configQuery.isLoading || undefined}
            aria-live={configQuery.isLoading ? 'polite' : undefined}
          >
            {configQuery.isLoading ? (
              <span className="sr-only">Verificando cidades disponíveis…</span>
            ) : null}
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
            {draftRestored ? (
              <div
                className="onside-callout onside-callout-stone mb-6"
                role="status"
              >
                <p className="text-sm">
                  Recuperamos o cadastro que você começou neste navegador.
                  Confira os dados deste passo e do próximo antes de continuar.
                </p>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="font-semibold text-sm underline underline-offset-2"
                >
                  Descartar e começar do zero
                </button>
              </div>
            ) : null}
            <PubInfoForm
              name={name}
              address={address}
              neighborhood={neighborhood}
              city={city}
              uf={uf}
              phone={phone}
              onChange={handleFieldChange}
              onCityBlur={() => conciliarUfComCidade(city, setUf)}
              errors={phoneError ? { phone: phoneError } : undefined}
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
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="onside-display mb-2 text-3xl text-[var(--onside-paper)] outline-none"
            >
              O que o torcedor encontra aí?
            </h2>
            <p className="onside-text-muted-on-ink mb-6">
              Marque o que o seu bar tem. É isso que aparece no seu perfil e o
              que o torcedor usa para filtrar a busca. Dá para pular e preencher
              depois.
            </p>
            <PubAmenitiesStep
              amenities={amenities}
              onToggleAmenity={toggleAmenity}
              screenCount={screenCount}
              onScreenCountChange={setScreenCount}
              description={description}
              onDescriptionChange={setDescription}
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
              {amenities.map((id) => {
                const amenity = findAmenity(id)
                if (!amenity) return null

                return (
                  <span
                    key={amenity.id}
                    className="onside-badge border-[var(--onside-acid)] bg-[color-mix(in_srgb,var(--onside-acid)_18%,transparent)] text-[var(--onside-paper)]"
                  >
                    {amenity.label}
                  </span>
                )
              })}
            </div>
            {/* WEB-281: o que os selos não mostram. Opcional vazio não entra;
                cidade vazia aparece como o servidor vai gravar. */}
            <dl className="mx-auto mt-6 grid max-w-md gap-3 text-left text-sm">
              {[
                ['Endereço', address.trim()],
                ['Cidade', `${city.trim() || 'São Paulo'}, ${uf}`],
                ['Telefone', formatStoredPhone(phone)],
                ['Telas', screenCount === null ? '' : String(screenCount)],
                ['Descrição', description.trim()]
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-[family-name:var(--onside-mono)] text-[10px] text-[color-mix(in_srgb,var(--onside-paper)_55%,transparent)] uppercase tracking-[0.16em]">
                      {label}
                    </dt>
                    <dd className="whitespace-pre-line break-words text-[var(--onside-paper)]">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
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
        blockedHint={blockedHint}
        isPending={completeMutation.isPending}
        onBack={back}
        onNext={next}
        nextLabel={
          step === 2 &&
          amenities.length === 0 &&
          screenCount === null &&
          !description.trim()
            ? 'Pular'
            : undefined
        }
        lastLabel="Escolher meu plano"
      />
    </OnboardingLayout>
  )
}
