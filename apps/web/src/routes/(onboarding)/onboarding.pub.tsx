import {
  declaredAmenityIds,
  findAmenity,
  motivoTelasInvalido
} from '@findsports_oficial/api/lib/amenities'
import {
  ehUf,
  motivoTelefoneInvalido
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pin, Star, Tv } from '@/components/landing/v3/icons'
import { OnboardingNavigation } from '@/components/onboarding/onboarding-navigation'
import { PubAmenitiesStep } from '@/components/onboarding/pub-amenities-step'
import { PubInfoForm } from '@/components/onboarding/pub-info-form'
import { PubObShell } from '@/components/onboarding/pub-ob-shell'
import { PubPlanStep } from '@/components/onboarding/pub-plan-step'
import { PubPreview, PubWelcomeTv } from '@/components/onboarding/pub-preview'
import {
  PubReceipt,
  type PubReceiptData,
  useFinishPubSignup
} from '@/components/onboarding/pub-receipt'
import { PubRoutineStep } from '@/components/onboarding/pub-routine-step'
import { conciliarUfComCidade } from '@/components/uf-select'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { juntarEndereco, separarNumero, useCep } from '@/lib/cep'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { readPendingEmail } from '@/lib/pending-verification'
import {
  formatPlanPrice,
  founderCouponFromQuery,
  getPlan,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import {
  mensagemFalhaCadastroBar,
  PUB_ONBOARDING_DRAFT_KEY,
  type PubOnboardingDraft,
  parsePubOnboardingDraft,
  serializePubOnboardingDraft
} from '@/lib/pub-onboarding-draft'
import { getPubOnboardingReview } from '@/lib/pub-onboarding-review'
import {
  DEFAULT_ROUTINE,
  type Routine,
  recommendPlan
} from '@/lib/pub-plan-recommendation'
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
  'Estabelecimento',
  'Características',
  'Sua rotina',
  'Plano',
  'Revisão'
] as const
const PLAN_STEP = 4

const WELCOME_FEATURES: [ReactNode, string, string][] = [
  [
    <Tv key="tv" size={22} />,
    'Divulgue sua programação de jogos',
    'O torcedor procura o jogo e acha o seu bar.'
  ],
  [
    <Pin key="pin" size={22} />,
    'Apareça pra torcedores perto de você',
    'Quem está por perto encontra você na busca.'
  ],
  [
    <Star key="star" />,
    'Lote nos dias de clássico',
    'No Elite, seu bar fica no topo da busca nos clássicos.'
  ]
]

/** A nota abaixo da prévia: na revisão, o que o plano escolhido muda nela. */
const PREVIEW_NOTE: Record<SubscriptionPlan, string> = {
  starter: 'No Starter o bar aparece na busca, sem selo nem destaque.',
  pro: 'No Pro o seu bar ganha selo e destaque na busca por time e liga.',
  elite:
    'No Elite o seu bar sobe pro topo nos clássicos e pode mostrar a oferta da casa.'
}

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
  // Rotina e plano (WEB-501): a rotina só recomenda e não é gravada; o plano
  // fica no rascunho e, com o bar criado, vira `pub.changeTrialPlan`.
  const [routine, setRoutine] = useState<Routine>(DEFAULT_ROUTINE)
  const [pickedPlan, setPickedPlan] = useState<SubscriptionPlan | null>(null)
  const [receipt, setReceipt] = useState<PubReceiptData | null>(null)
  const [leaving, setLeaving] = useState(false)
  const recommendation = recommendPlan(routine)
  const plan = pickedPlan ?? recommendation.plan
  const finishSignup = useFinishPubSignup()

  // O número que o dono já digitou fica: o CEP traz só a rua.
  const {
    cep,
    status: cepStatus,
    mudar: mudarCep,
    definir: setCep
  } = useCep((achado) => {
    if (achado.rua) {
      setAddress((atual) => juntarEndereco(achado.rua, separarNumero(atual)[1]))
    }
    if (achado.bairro) setNeighborhood(achado.bairro)
    setCity(achado.cidade)
    if (achado.uf) setUf(achado.uf)
  })

  const draft = useMemo<PubOnboardingDraft>(
    () => ({
      name: name.trim(),
      address: address.trim(),
      cep: cep || undefined,
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
      cep,
      neighborhood,
      city,
      uf,
      phone,
      description,
      amenities,
      screenCount
    ]
  )

  // WEB-238: a revisão diz o que acontece de fato ao continuar. Quem decide o
  // teste é o `completePub`.
  const revisao = getPubOnboardingReview({
    emailVerified: conta?.emailVerified === true,
    plan
  })

  // Preço de fundador: com sessão, o que o Stripe diz do cupom; sem ela (antes
  // de confirmar o e-mail) a consulta não abre, e vale o preço de fundador da
  // tabela, o mesmo da landing.
  const couponQuery = useQuery({
    ...trpc.pub.getFounderCouponAvailable.queryOptions(),
    enabled: Boolean(user?.email),
    meta: { errorToast: false }
  })
  const founderCoupon = user?.email
    ? (founderCouponFromQuery(couponQuery) ?? true)
    : true

  const seguirParaPlano = async () => {
    localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
    // `onboardingCompleted` mudou no banco por fora do better-auth; sem
    // regravar o cache de sessão o guard da rota devolveria o usuário
    // para cá.
    await refreshSessionCache()
    // Deep link que esperou a liberação volta para ele; sem destino, o plano.
    // `await`: o botão segue em "salvando" até a próxima tela abrir, em vez
    // de voltar ao normal com a revisão ainda na tela (WEB-286).
    await navigate(
      callbackUrl === '/dashboard'
        ? { to: '/plan', search: { trial: 'started' } }
        : { to: callbackUrl }
    )
  }

  const completeMutation = useMutation(
    trpc.onboarding.completePub.mutationOptions({
      onSuccess: async (_, sent) => {
        analytics.onboardingCompleted({ role: 'pub' })
        localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
        // O bar já existe: o plano escolhido e o comprovante vêm agora. Sem a
        // assinatura para o comprovante, segue direto, como antes.
        const data = await finishSignup({ ...sent, plan })
        if (data) setReceipt(data)
        else await seguirParaPlano()
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
    setCep(salvo.cep ?? '')
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
    setPickedPlan(salvo.plan ?? null)
    setDraftRestored(true)
    setStep(Math.min(salvo.step ?? 1, STEPS.length - 1))
  }, [contaEmail, setCep])

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
      serializePubOnboardingDraft(
        { ...draft, step, plan: pickedPlan ?? undefined },
        email
      )
    )
  }, [contaEmail, step, draft, pickedPlan])

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
    setCep('')
    setNeighborhood('')
    setCity('São Paulo')
    setUf('SP')
    setPhone('')
    setDescription('')
    setAmenities([])
    setScreenCount(null)
    setPhoneError(null)
    setError(null)
    setPickedPlan(null)
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
      case 'description':
        setDescription(value)
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
          serializePubOnboardingDraft({ ...draft, plan }, email)
        )
      }
      navigate({ to: '/verify-email' })
    }
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  // "Ver meu bar no ar": o destino de sempre, `/plan` com o aviso de que o
  // teste começou, ou o link de onde o dono veio.
  const sairDoComprovante = async () => {
    setLeaving(true)
    try {
      await seguirParaPlano()
    } finally {
      setLeaving(false)
    }
  }

  if (receipt) {
    return (
      <PubObShell>
        <PubReceipt
          data={receipt}
          pending={leaving}
          onContinue={() => void sairDoComprovante()}
          continueLabel={
            callbackUrl === '/dashboard' ? 'Ver meu bar no ar' : 'Continuar'
          }
        />
      </PubObShell>
    )
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
  const planName = getPlan(plan).name
  const planPrice = planChargeForShowcase(getPlan(plan), founderCoupon)
  const characteristics = [
    ...(screenCount === null
      ? []
      : [screenCount === 1 ? '1 tela' : `${screenCount} telas`]),
    ...amenities.flatMap((id) => findAmenity(id)?.label ?? [])
  ]
  const reviewRows: {
    label: string
    to: number
    values: string[]
    empty?: string
  }[] = [
    {
      label: 'Estabelecimento',
      to: 1,
      values: [name.trim(), address.trim(), neighborhood.trim()].filter(Boolean)
    },
    // WEB-281: cidade vazia aparece como o servidor vai gravar.
    {
      label: 'Cidade',
      to: 1,
      values: [`${city.trim() || 'São Paulo'}, ${uf}`]
    },
    {
      label: 'Telefone',
      to: 1,
      values: phone ? [formatStoredPhone(phone)] : [],
      empty: 'Não informado · você preenche depois no painel'
    },
    {
      label: 'Descrição',
      to: 1,
      values: description.trim() ? [description.trim()] : [],
      empty: 'Sem descrição'
    },
    {
      label: 'Características',
      to: 2,
      values: characteristics,
      empty: 'Nada marcado · você marca depois no painel'
    }
  ]

  return (
    <PubObShell
      steps={STEPS}
      step={step}
      wide={step === PLAN_STEP}
      tv={step === 0}
      aside={
        step === PLAN_STEP ? null : step === 0 ? (
          <PubWelcomeTv />
        ) : (
          <PubPreview
            name={name}
            neighborhood={neighborhood}
            city={city}
            amenities={amenities}
            screenCount={screenCount}
            plan={step === STEPS.length - 1 ? plan : undefined}
            note={
              step === STEPS.length - 1
                ? PREVIEW_NOTE[plan]
                : 'Prévia do card do seu bar. Ela muda enquanto você preenche.'
            }
          />
        )
      }
    >
      <div
        key={step}
        className={`ob-step-body${step === 0 ? ' ob-welcome' : ''}`}
      >
        {step === 0 && (
          <>
            {heading(
              <>
                Vamos lotar sua casa nos{' '}
                <span className="hl">dias de jogo</span>
              </>
            )}
            <p className="ob-sub">
              Coloque seu bar no radar dos torcedores. Leva 2 minutos, e você
              testa {ONBOARDING_TRIAL.days} dias grátis no plano que escolher,
              sem cartão.
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
            <div className="ob-need">
              <p className="ob-k">Tenha à mão</p>
              <ul>
                <li>Nome e CEP do bar</li>
                <li>Telas e o que o bar oferece</li>
                <li>Jogos por mês e gasto médio</li>
              </ul>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {heading('Seu estabelecimento')}
            <p className="ob-sub">
              Conta um pouco do seu bar. O CEP preenche o endereço.
            </p>
            {draftRestored ? (
              <div className="ob-recall" role="status">
                <span>
                  Recuperamos o cadastro que você começou neste navegador.
                  Confira os dados deste passo e dos próximos antes de
                  continuar.
                </span>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="ob-link"
                >
                  Descartar e começar do zero
                </button>
              </div>
            ) : null}
            <PubInfoForm
              name={name}
              cep={cep}
              cepStatus={cepStatus}
              onCepChange={(value) => void mudarCep(value)}
              address={address}
              neighborhood={neighborhood}
              city={city}
              uf={uf}
              phone={phone}
              description={description}
              onChange={handleFieldChange}
              onCityBlur={() => conciliarUfComCidade(city, setUf)}
              errors={phoneError ? { phone: phoneError } : undefined}
            />
          </>
        )}

        {step === 2 && (
          <>
            {heading('O que o torcedor encontra aí?')}
            <p className="ob-sub">
              É o que ele usa para filtrar a busca. Dá para pular e marcar
              depois, no painel do bar.
            </p>
            <PubAmenitiesStep
              amenities={amenities}
              onToggleAmenity={toggleAmenity}
              screenCount={screenCount}
              onScreenCountChange={setScreenCount}
            />
          </>
        )}

        {step === 3 && (
          <>
            {heading(
              <>
                Como é a sua <span className="hl">rotina de jogo?</span>
              </>
            )}
            <p className="ob-sub">
              Duas perguntas rápidas e o que você espera da Onside. Com isso a
              gente mostra o plano que faz mais sentido pro seu bar. Nada disso
              aparece no perfil.
            </p>
            <PubRoutineStep routine={routine} onChange={setRoutine} />
          </>
        )}

        {step === PLAN_STEP && (
          <PubPlanStep
            barName={name}
            recommended={recommendation.plan}
            reasons={recommendation.reasons}
            selected={plan}
            onSelect={setPickedPlan}
            spend={routine.spend}
            founderCoupon={founderCoupon}
            onEditRoutine={() => setStep(3)}
            heading={heading}
          />
        )}

        {step === 5 && (
          <>
            {heading(revisao.titulo)}
            <p className="ob-sub">{revisao.texto}</p>
            <div className="ob-card">
              {reviewRows.map((row) => (
                <div key={row.label} className="ob-ln">
                  <span>
                    <b>{row.label}</b>
                    {row.values.length ? (
                      <span className="ob-tags">
                        {row.values.map((value) => (
                          <span key={value} className="ob-tag">
                            {value}
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
                    aria-label={`Corrigir ${row.label.toLowerCase()}`}
                  >
                    Corrigir
                  </button>
                </div>
              ))}
              <div className="ob-ln">
                <span>
                  <b>Plano</b>
                  <span>
                    {planName} grátis por {ONBOARDING_TRIAL.days} dias, sem
                    cartão. Depois, {formatPlanPrice(planPrice.chargeReais)}
                    /mês só se você contratar.
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost ob-sm"
                  onClick={() => setStep(PLAN_STEP)}
                  aria-label="Trocar o plano"
                >
                  Trocar
                </button>
              </div>
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
        blockedHint={blockedHint}
        isPending={completeMutation.isPending}
        onBack={back}
        onNext={next}
        nextLabel={
          step === 2 && amenities.length === 0 && screenCount === null
            ? 'Pular'
            : step === 3
              ? 'Ver a recomendação'
              : step === PLAN_STEP
                ? `Testar o ${planName} grátis`
                : undefined
        }
        lastLabel={revisao.botao}
      />
    </PubObShell>
  )
}
