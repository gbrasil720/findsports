import {
  AMENITIES,
  AMENITY_GROUPS,
  declaredAmenityIds,
  findAmenity,
  HOUSE_OFFER_AMENITY_ID,
  MAX_SCREEN_COUNT,
  motivoTelasInvalido
} from '@findsports_oficial/api/lib/amenities'
import {
  ehUf,
  motivoTelefoneInvalido,
  UFS
} from '@findsports_oficial/api/lib/bar-profile-validation'
import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'
import { normalizeHouseOffer } from '@findsports_oficial/db/house-offer'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import {
  Fragment,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { toast } from 'sonner'
import { Horario, OfertaDaCasa } from '@/components/admin/espaco-campos'
import {
  type DiaRascunho,
  diasDoHorario,
  erroDaOferta,
  horarioDoRascunho,
  horarioInvalido,
  MSG_HORARIO_INVALIDO,
  recursoPago
} from '@/components/admin/espaco-model'
import { entradaHead } from '@/components/entrada/auth'
import { MapaPrevia, ObShell, Previa } from '@/components/entrada/onboarding'
import {
  Badge,
  Botao,
  Campo,
  CampoTexto,
  Card,
  Chip,
  Icone,
  type IconeNome
} from '@/components/painel'
import { conciliarUfComCidade } from '@/components/uf-select'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { analytics } from '@/lib/analytics'
import { refreshSessionCache } from '@/lib/auth-client'
import { juntarEndereco, separarNumero, useCep } from '@/lib/cep'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { readPendingEmail } from '@/lib/pending-verification'
import {
  mensagemFalhaCadastroBar,
  PUB_ONBOARDING_DRAFT_KEY,
  type PubOnboardingDraft,
  parsePubOnboardingDraft,
  serializePubOnboardingDraft
} from '@/lib/pub-onboarding-draft'
import {
  getPubOnboardingReview,
  resumoDoHorario
} from '@/lib/pub-onboarding-review'
import { PUB_LIVE_PATH } from '@/utils/auth-guards'
import { getCallbackUrl } from '@/utils/callback-url'
import { formatPhone, formatStoredPhone } from '@/utils/format-phone'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(onboarding)/onboarding/pub')({
  head: () =>
    entradaHead({
      path: '/onboarding/pub',
      title: 'Cadastre seu bar — Onside',
      description:
        'Coloque seu bar no radar dos torcedores. Cadastre em 1 minuto e comece a atrair clientes nos dias de jogo.',
      indexable: false
    }),
  component: PubOnboarding
})

const ULTIMO_PASSO = 3

const BOAS_VINDAS: readonly (readonly [IconeNome, string])[] = [
  ['cal', 'Divulgue sua programação de jogos'],
  ['map', 'Apareça pra torcedores perto de você'],
  ['fire', 'Lote nos dias de clássico']
]

/** "Com oferta da casa" não se marca: é o filtro da busca (ver `amenities.ts`). */
const ITENS = AMENITIES.filter(({ id }) => id !== HOUSE_OFFER_AMENITY_ID)

/**
 * Oferta da casa é do Elite (WEB-448). O bar nasce no teste do cadastro, e a
 * regra de mostrar o campo é a do Meu espaço (`recursoPago`); o
 * `completePub` confere de novo.
 */
const PODE_OFERTA =
  recursoPago(
    { status: 'ready', plan: ONBOARDING_TRIAL.plan, standing: 'current' },
    'elite'
  ).status === 'liberado'

function Titulo({
  linhas,
  tamanho,
  ref
}: {
  linhas: { texto: string; tint?: boolean }[]
  tamanho: number
  ref?: Ref<HTMLHeadingElement>
}) {
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className="entrada-disp"
      style={{ '--entrada-disp': `${tamanho}px`, outline: 'none' } as never}
    >
      {linhas.map((linha, i) => (
        <Fragment key={linha.texto}>
          {i > 0 ? ' ' : null}
          <span className={linha.tint ? 'entrada-tint' : undefined}>
            {linha.texto}
          </span>
        </Fragment>
      ))}
    </h1>
  )
}

function PubOnboarding() {
  const navigate = useNavigate()
  const callbackUrl = getCallbackUrl(useLocation().href)
  const trpc = useTRPC()
  const sair = useSignOut('/')
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
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('São Paulo')
  // Nasce com a UF da cidade que já vem preenchida; trocar a cidade concilia
  // as duas (`conciliarUfComCidade`).
  const [uf, setUf] = useState('SP')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<number[]>([])
  const [screenCount, setScreenCount] = useState<number | null>(null)
  // Horário e oferta se preenchem na Revisão, num painel aberto pelo "Editar"
  // da linha (WEB-448), com as peças do Meu espaço.
  const [hours, setHours] = useState<DiaRascunho[] | null>(null)
  const [houseOffer, setHouseOffer] = useState('')
  const [editando, setEditando] = useState<'horario' | 'oferta' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)

  const {
    cep,
    status: cepStatus,
    mudar: mudarCep,
    definir: setCep
  } = useCep((achado) => {
    if (achado.rua) setRua(achado.rua)
    if (achado.bairro) setNeighborhood(achado.bairro)
    setCity(achado.cidade)
    if (achado.uf) setUf(achado.uf)
  })

  const address = juntarEndereco(rua, numero)
  const openingHours = horarioDoRascunho(hours)
  const oferta = PODE_OFERTA ? normalizeHouseOffer(houseOffer) : null
  const draft = useMemo<PubOnboardingDraft>(
    () => ({
      name: name.trim(),
      address,
      neighborhood: neighborhood.trim(),
      city: city.trim() || undefined,
      uf: ehUf(uf) ? uf : undefined,
      phone: phone.trim() || undefined,
      description: description.trim() || undefined,
      amenities: amenities.length > 0 ? amenities : undefined,
      screenCount: screenCount ?? undefined,
      openingHours: openingHours ?? undefined,
      houseOffer: oferta ?? undefined,
      cep: cep || undefined
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
      screenCount,
      openingHours,
      oferta,
      cep
    ]
  )

  // WEB-238: a revisão diz o que acontece de fato ao continuar. Quem decide o
  // teste é o `completePub`.
  const revisao = getPubOnboardingReview({
    emailVerified: conta?.emailVerified === true,
    goesToPlan: callbackUrl === '/admin'
  })

  const seguir = async () => {
    localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
    // `onboardingCompleted` mudou no banco por fora do better-auth; sem
    // regravar o cache de sessão o guard da rota devolveria o usuário
    // para cá.
    await refreshSessionCache()
    // Deep link que esperou a liberação volta para ele; sem destino, a tela
    // "Seu bar está no ar" (4r). `await`: o botão segue em "salvando" até a
    // próxima tela abrir (WEB-286).
    await navigate(
      callbackUrl === '/admin' ? { to: PUB_LIVE_PATH } : { to: callbackUrl }
    )
  }

  const completeMutation = useMutation(
    trpc.onboarding.completePub.mutationOptions({
      onSuccess: async () => {
        analytics.onboardingCompleted({ role: 'pub' })
        await seguir()
      },
      onError: async (err, draft) => {
        const concluido = mensagemOnboardingJaConcluido(err)
        if (!concluido) {
          setError(mensagemFalhaCadastroBar(err, draft))
          return
        }
        toast.info(concluido)
        await seguir()
      }
    })
  )

  // `/verify-email` manda de volta para cá quando o servidor recusa o
  // rascunho: os campos voltam preenchidos, no passo que dá para corrigir.
  //
  // WEB-262: só o rascunho desta conta volta, e com aviso e saída. O que não
  // serve (outra conta, vencido) sai do navegador aqui. A conta é a da sessão
  // ou, vindo do cadastro ainda sem sessão, o e-mail que a aba cadastrou.
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
    const [salvaRua, salvoNumero] = separarNumero(salvo.address)
    setName(salvo.name)
    setRua(salvaRua)
    setNumero(salvoNumero)
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
    setHours(diasDoHorario(salvo.openingHours ?? null))
    setHouseOffer(salvo.houseOffer ?? '')
    setPhoneError(motivoTelefoneInvalido(salvo.phone))
    setDraftRestored(true)
    setStep(Math.min(salvo.step ?? 1, ULTIMO_PASSO))
  }, [contaEmail, setCep])

  // O rascunho acompanha o preenchimento, com o passo, pela mesma regra da
  // WEB-262 (só com dono); `seguir` o apaga quando o bar é criado. Vem depois
  // do efeito acima de propósito: se a conta mudou, aquele tira o rascunho da
  // anterior e este grava o da atual. Nas boas-vindas não há o que guardar;
  // formulário em branco apaga, para o "Descartar" não voltar como rascunho.
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
  // aba. Em aba sem sessão e sem esse cadastro não há de quem guardar o
  // rascunho: pede o login antes, com o mesmo destino das rotas protegidas.
  // O destino sai de `window.location`: o `useLocation` muda assim que a
  // navegação começa, e o efeito dispararia de novo levando o `/login`.
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
    setCep('')
    setRua('')
    setNumero('')
    setNeighborhood('')
    setCity('São Paulo')
    setUf('SP')
    setPhone('')
    setDescription('')
    setAmenities([])
    setScreenCount(null)
    setHours(null)
    setHouseOffer('')
    setEditando(null)
    setPhoneError(null)
    setError(null)
    setDraftRestored(false)
  }

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: step === 0 })
  }, [step])

  const toggleAmenity = (id: number) => {
    setAmenities((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  // WEB-270: o botão desabilitado diz o que falta. O texto e o `disabled`
  // saem da mesma conta, para um nunca contradizer o outro.
  const blockedHint = (() => {
    if (step === 1) {
      const curto = (valor: string, minimo: number, rotulo: string) =>
        valor.trim().length < minimo &&
        (valor.trim() ? `${rotulo} (pelo menos ${minimo} caracteres)` : rotulo)
      const faltando = [
        curto(name, 2, 'nome do estabelecimento'),
        curto(rua, 3, 'rua'),
        !numero.trim() && 'número',
        curto(neighborhood, 2, 'bairro'),
        !ehUf(uf) && 'estado (UF)'
      ].filter(Boolean)
      return faltando.length > 0
        ? `Para continuar, falta preencher: ${faltando.join(', ')}.`
        : null
    }
    if (step === 2 && motivoTelasInvalido(screenCount) !== null) {
      return 'Para continuar, corrija o número de telas.'
    }
    if (step === ULTIMO_PASSO && horarioInvalido(hours)) {
      return 'Para continuar, corrija o horário: um dia abre e fecha na mesma hora.'
    }
    if (step === ULTIMO_PASSO && PODE_OFERTA && erroDaOferta(houseOffer)) {
      return 'Para continuar, encurte a oferta da casa.'
    }
    return null
  })()

  const next = () => {
    setError(null)
    // Mesma regra do servidor, conferida aqui porque sem e-mail confirmado o
    // cadastro só é enviado depois, de `/verify-email`, longe deste campo.
    if (step === 1) {
      const motivo = motivoTelefoneInvalido(phone)
      setPhoneError(motivo)
      if (motivo) return
    }
    if (step < ULTIMO_PASSO) {
      setStep((s) => s + 1)
      return
    }
    if (conta?.emailVerified) {
      completeMutation.mutate(draft)
      return
    }
    // Sem e-mail confirmado o cadastro só é enviado de `/verify-email`.
    const email = conta?.email ?? readPendingEmail()
    if (email) {
      localStorage.setItem(
        PUB_ONBOARDING_DRAFT_KEY,
        serializePubOnboardingDraft(draft, email)
      )
    }
    navigate({ to: '/verify-email' })
  }

  const back = () => step > 0 && setStep((s) => s - 1)

  const chips = [
    ...amenities.flatMap((id) => findAmenity(id)?.label ?? []),
    ...(screenCount
      ? [`${screenCount} ${screenCount === 1 ? 'tela' : 'telas'}`]
      : [])
  ]
  const lugar = [neighborhood.trim(), city.trim()].filter(Boolean).join(' · ')

  const pe = (rotulo: string, extra?: ReactNode) => (
    <>
      {error ? (
        <p className="entrada-erro" role="alert">
          {error}
        </p>
      ) : null}
      {blockedHint ? (
        <p className="entrada-ob-texto" id="ob-falta" aria-live="polite">
          {blockedHint}
        </p>
      ) : null}
      {extra}
      <div className="entrada-ob-pe">
        {step > 0 ? (
          <Botao variante="sec" onClick={back}>
            Voltar
          </Botao>
        ) : null}
        <Botao
          variante="acid"
          icone={step === 0 ? 'right' : undefined}
          onClick={next}
          disabled={blockedHint !== null || completeMutation.isPending}
          aria-describedby={blockedHint ? 'ob-falta' : undefined}
        >
          {completeMutation.isPending ? 'Salvando…' : rotulo}
        </Botao>
      </div>
    </>
  )

  const acao =
    step === 2 ? (
      <button
        type="button"
        className="entrada-ob-acao"
        onClick={() => setStep(3)}
      >
        Pular
      </button>
    ) : (
      <button type="button" className="entrada-ob-acao" onClick={sair}>
        Sair
      </button>
    )

  const recuperado = draftRestored ? (
    <div className="entrada-ob-aviso" role="status">
      <span>
        Recuperamos o cadastro que você começou neste navegador. Confira os
        dados antes de continuar.
      </span>
      <button type="button" onClick={discardDraft}>
        Descartar e começar do zero
      </button>
    </div>
  ) : null

  if (step === 0) {
    return (
      <ObShell
        passo={0}
        acao={acao}
        ladoFoto
        lado={
          <div className="entrada-ob-pinos" aria-hidden="true">
            <span>Casa 92</span>
            <span>Boteco Sete</span>
            <span>
              <Icone nome="pin" tamanho={18} acento="var(--painel-ink)" />
              Seu bar aqui
            </span>
          </div>
        }
      >
        <p className="entrada-ob-eyebrow">Seu bar no radar dos torcedores.</p>
        <Titulo
          ref={headingRef}
          tamanho={76}
          linhas={[
            { texto: 'Vamos lotar sua casa nos' },
            { texto: 'próximos clássicos.', tint: true }
          ]}
        />
        <p
          className="entrada-ob-texto"
          data-corpo
          style={{ fontSize: 17, maxWidth: 520 }}
        >
          Cadastre seu bar em 1 minuto. Torcedores da região já podem te
          encontrar.
        </p>
        <div className="entrada-ob-itens">
          {BOAS_VINDAS.map(([icone, texto]) => (
            <Card key={texto}>
              <Icone nome={icone} tamanho={22} />
              {texto}
            </Card>
          ))}
        </div>
        {pe('Começar')}
      </ObShell>
    )
  }

  if (step === 1) {
    return (
      <ObShell
        passo={1}
        acao={acao}
        lado={
          <Previa
            nome={name.trim()}
            sub={lugar || 'Seus jogos aparecem aqui'}
            extra={<MapaPrevia />}
          />
        }
      >
        <Titulo
          ref={headingRef}
          tamanho={52}
          linhas={[{ texto: 'Conta um pouco do seu bar.' }]}
        />
        {recuperado}
        <div className="entrada-ob-grade">
          <Campo
            className="entrada-c6"
            id="pub-name"
            name="name"
            rotulo="Nome do estabelecimento *"
            placeholder="Ex: Bar do Zé"
            autoComplete="organization"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Campo
            className="entrada-c3"
            id="pub-cep"
            name="cep"
            rotulo="CEP"
            aside={
              <a
                href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                target="_blank"
                rel="noopener noreferrer"
              >
                Não sei o CEP
              </a>
            }
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => void mudarCep(e.target.value)}
            fim={
              cepStatus === 'achou' ? (
                <Badge tipo="acid">✓ Encontrado</Badge>
              ) : cepStatus === 'buscando' ? (
                <Badge tipo="muted">Buscando…</Badge>
              ) : null
            }
            dica={
              cepStatus === 'nao'
                ? 'Não achamos esse CEP. Preencha o endereço abaixo.'
                : undefined
            }
          />
          <Campo
            className="entrada-c3"
            id="pub-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            rotulo="Telefone"
            placeholder="(11) 90000-0000"
            autoComplete="tel-national"
            value={formatStoredPhone(phone)}
            onChange={(e) => {
              const digitos = e.target.value.replace(/\D/g, '').slice(0, 11)
              setPhone(digitos ? `+55${digitos}` : '')
              setPhoneError(null)
            }}
            aria-invalid={phoneError ? true : undefined}
            dica={
              phoneError ? (
                <span className="entrada-erro" role="alert">
                  {phoneError}
                </span>
              ) : undefined
            }
          />
          {cepStatus === 'achou' ? (
            <div className="entrada-ob-cep entrada-c6">
              <span>
                <Icone nome="bolt" tamanho={14} acento="var(--painel-tint)" />
                Preenchido pelo CEP
              </span>
              <span>Toque para corrigir</span>
            </div>
          ) : null}
          <Campo
            className="entrada-c4"
            id="pub-street"
            name="street"
            rotulo="Rua *"
            placeholder="Ex: Rua Aspicuelta"
            autoComplete="address-line1"
            maxLength={200}
            value={rua}
            onChange={(e) => setRua(e.target.value)}
          />
          <Campo
            className="entrada-c2"
            id="pub-number"
            name="number"
            rotulo="Número *"
            placeholder="Ex: 123"
            autoComplete="address-line2"
            maxLength={20}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Campo
            className="entrada-c3"
            id="pub-neighborhood"
            name="neighborhood"
            rotulo="Bairro *"
            placeholder="Ex: Vila Madalena"
            autoComplete="address-level3"
            maxLength={100}
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
          />
          <Campo
            className="entrada-c2"
            id="pub-city"
            name="city"
            rotulo="Cidade *"
            placeholder="São Paulo"
            autoComplete="address-level2"
            maxLength={100}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onBlur={() => conciliarUfComCidade(city, setUf)}
          />
          <div className="painel-campo entrada-c1">
            <div className="painel-campo-topo">
              <label htmlFor="pub-uf">UF *</label>
            </div>
            <div className="painel-campo-caixa">
              <select
                id="pub-uf"
                name="uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                autoComplete="address-level1"
                aria-label="Estado (UF)"
              >
                <option value="">—</option>
                {Object.entries(UFS).map(([sigla, nomeUf]) => (
                  <option key={sigla} value={sigla} title={nomeUf}>
                    {sigla}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {pe('Continuar')}
      </ObShell>
    )
  }

  if (step === 2) {
    const telas = screenCount ?? 0
    return (
      <ObShell
        passo={2}
        acao={acao}
        lado={
          <Previa
            foto
            nome={name.trim()}
            sub={[neighborhood.trim(), address].filter(Boolean).join(' · ')}
            chips={chips}
          />
        }
      >
        <Titulo
          ref={headingRef}
          tamanho={46}
          linhas={[{ texto: 'O que o torcedor encontra aí?' }]}
        />
        <p className="entrada-ob-texto" style={{ marginTop: -6 }}>
          Marque o que o seu bar tem. É isso que aparece no seu perfil e o que o
          torcedor usa para filtrar a busca. Dá para pular e preencher depois.
        </p>
        <div className="entrada-ob-grupos">
          {AMENITY_GROUPS.map((grupo) => {
            const itens = (
              <fieldset key={grupo.key} className="entrada-ob-grupo">
                <legend>{grupo.label}</legend>
                <div>
                  {ITENS.filter((item) => item.group === grupo.key).map(
                    (item) => (
                      <Chip
                        key={item.id}
                        ativo={amenities.includes(item.id)}
                        onClick={() => toggleAmenity(item.id)}
                      >
                        {item.label}
                      </Chip>
                    )
                  )}
                </div>
              </fieldset>
            )
            if (grupo.key !== 'watch') return itens
            return (
              <div key={grupo.key} className="entrada-ob-telas">
                {itens}
                <div>
                  <span id="ob-telas">Quantas telas?</span>
                  <fieldset
                    className="entrada-stepper"
                    aria-labelledby="ob-telas"
                  >
                    <button
                      type="button"
                      aria-label="Menos uma tela"
                      disabled={telas <= 0}
                      onClick={() =>
                        setScreenCount(telas <= 1 ? null : telas - 1)
                      }
                    >
                      −
                    </button>
                    <b aria-live="polite">{screenCount ?? '—'}</b>
                    <button
                      type="button"
                      aria-label="Mais uma tela"
                      disabled={telas >= MAX_SCREEN_COUNT}
                      onClick={() => setScreenCount(telas + 1)}
                    >
                      +
                    </button>
                  </fieldset>
                </div>
              </div>
            )
          })}
          <CampoTexto
            id="pub-description"
            name="description"
            rotulo="Mais alguma coisa? (opcional)"
            placeholder="Ex: mesa de sinuca no fundo e happy hour até as 20h nos dias de jogo"
            altura={70}
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="entrada-ob-declara">
            Você declara que seu bar oferece o que marcar aqui. A Onside não
            verifica essas informações — elas aparecem no seu perfil como
            declaradas por você.
          </p>
        </div>
        {pe('Continuar')}
      </ObShell>
    )
  }

  const enderecoCompleto = [
    address,
    neighborhood.trim(),
    `${city.trim() || 'São Paulo'}${ehUf(uf) ? `, ${uf}` : ''}`,
    cep
  ]
    .filter(Boolean)
    .join(' · ')
  const contato = [
    phone ? formatPhone(phone.slice(3)) : '',
    conta?.email ?? readPendingEmail()
  ]
    .filter(Boolean)
    .join(' · ')
  const abrir = (painel: 'horario' | 'oferta') => () =>
    setEditando((atual) => (atual === painel ? null : painel))
  const linhas: {
    icone: IconeNome
    rotulo: string
    valor: string | null
    editar: (() => void) | null
    painel?: 'horario' | 'oferta'
  }[] = [
    {
      icone: 'pin',
      rotulo: 'Endereço',
      valor: enderecoCompleto,
      editar: () => setStep(1)
    },
    {
      icone: 'cal',
      rotulo: 'Horário',
      valor: resumoDoHorario(openingHours),
      editar: abrir('horario'),
      painel: 'horario'
    },
    {
      icone: 'phone',
      rotulo: 'Contato',
      valor: contato,
      editar: () => setStep(1)
    },
    {
      icone: 'ticket',
      rotulo: 'Oferta da casa',
      valor: oferta,
      editar: PODE_OFERTA ? abrir('oferta') : null,
      painel: PODE_OFERTA ? 'oferta' : undefined
    }
  ]

  return (
    <ObShell
      passo={3}
      acao={acao}
      lado={
        <Previa
          foto
          nome={name.trim()}
          sub={`${neighborhood.trim()} · ★ novo`}
          chips={[`${PLAN_NAMES[ONBOARDING_TRIAL.plan]} · teste`, ...chips]}
          extra={
            oferta ? (
              <div className="entrada-previa-oferta">
                <Icone nome="ticket" tamanho={18} acento="var(--painel-ink)" />
                <b>{oferta}</b>
              </div>
            ) : null
          }
        />
      }
    >
      <Titulo
        ref={headingRef}
        tamanho={56}
        linhas={[
          { texto: revisao.titulo },
          { texto: revisao.tint, tint: true }
        ]}
      />
      <p className="entrada-ob-texto" data-corpo>
        {revisao.texto}
      </p>
      {recuperado}
      <Card className="entrada-ob-revisao">
        {linhas.map(({ icone, rotulo, valor, editar, painel }) => {
          const aberto = painel !== undefined && editando === painel
          return (
            <Fragment key={rotulo}>
              <div>
                <Icone nome={icone} tamanho={20} />
                <div>
                  {rotulo}
                  {valor ? (
                    <b>{valor}</b>
                  ) : (
                    <b data-vazio>
                      {editar
                        ? 'Não informado'
                        : 'Você preenche depois, em Meu espaço'}
                    </b>
                  )}
                </div>
                {editar ? (
                  <button
                    type="button"
                    onClick={editar}
                    aria-label={`Editar ${rotulo.toLowerCase()}`}
                    aria-expanded={painel ? aberto : undefined}
                    aria-controls={painel ? `ob-painel-${painel}` : undefined}
                    id={painel ? `ob-editar-${painel}` : undefined}
                  >
                    Editar
                  </button>
                ) : null}
              </div>
              {aberto ? (
                <section
                  id={`ob-painel-${painel}`}
                  aria-label={rotulo}
                  className="entrada-ob-painel"
                >
                  {painel === 'horario' ? (
                    <Horario
                      hours={hours}
                      erro={
                        horarioInvalido(hours)
                          ? MSG_HORARIO_INVALIDO
                          : undefined
                      }
                      mudar={setHours}
                    />
                  ) : (
                    <OfertaDaCasa
                      valor={houseOffer}
                      erro={erroDaOferta(houseOffer)}
                      mudar={setHouseOffer}
                    />
                  )}
                  <Botao
                    variante="ink"
                    altura={36}
                    onClick={() => {
                      setEditando(null)
                      // O "Pronto" some com o painel: o foco volta ao "Editar".
                      document.getElementById(`ob-editar-${painel}`)?.focus()
                    }}
                  >
                    Pronto
                  </Botao>
                </section>
              ) : null}
            </Fragment>
          )
        })}
      </Card>
      <p className="entrada-ob-letra">
        Ao continuar você aceita os Termos de Uso.
      </p>
      {pe(revisao.botao)}
    </ObShell>
  )
}
