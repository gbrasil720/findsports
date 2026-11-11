import {
  AMENITIES,
  HIDDEN_AMENITY_IDS
} from '@findsports_oficial/api/lib/amenities'
import { useMutation } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthField } from '@/components/auth-shell'
import { HardShadow } from '@/components/explore'
import { DotField } from '@/components/fan-card'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { dayMonth } from '@/lib/bar-owner'
import { type CepAddress, findCep, formatCep } from '@/lib/cep'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Cadastro do bar no app (rodada 10, tela 6): a mesma ordem do cadastro do
 * web (WEB-501) com a placa do bar se preenchendo: boas-vindas,
 * estabelecimento (o CEP acha o endereço), características (com o número de
 * telas), revisão com o teste explicado e o comprovante impresso. Depois
 * vêm o primeiro jogo, completar o perfil, a rotina e o plano do teste.
 *
 * Movimento: o comprovante é um momento raro, uma vez: a fita sai linha a
 * linha (−8 → 0 e opacidade, 350 ms EASE, 95 ms entre linhas), o LED pisca
 * enquanto imprime e o háptico de sucesso sai na última linha. Movimento
 * reduzido: a fita pronta.
 */

type Step = 'welcome' | 'place' | 'features' | 'review' | 'receipt'
const ORDER: Step[] = ['welcome', 'place', 'features', 'review']
const TRIAL_DAYS = 90
const WATCH = AMENITIES.filter((a) => a.group === 'watch')
const OTHERS = AMENITIES.filter(
  (a) => a.group !== 'watch' && !HIDDEN_AMENITY_IDS.includes(a.id)
)
const SHORT: Record<number, string> = {
  1: 'Telão',
  2: 'Som do jogo',
  3: 'Premiere'
}

export default function CadastroBar() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>('welcome')
  useStatusBar(palette.dark || step === 'welcome' ? 'light' : 'dark')
  const [name, setName] = useState('')
  const [cep, setCep] = useState('')
  const [found, setFound] = useState<CepAddress | null>(null)
  const [cepState, setCepState] = useState<'idle' | 'busy' | 'none'>('idle')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [hood, setHood] = useState('')
  const [city, setCity] = useState('')
  const [uf, setUf] = useState('')
  const [phone, setPhone] = useState('')
  const [amenities, setAmenities] = useState<number[]>([])
  const [screens, setScreens] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<{ at: number } | null>(null)
  const complete = useMutation(trpc.onboarding.completePub.mutationOptions())
  const owner = useOwnerBar()

  const address = [street, number].filter(Boolean).join(', ')
  const placeOk =
    name.trim().length >= 2 &&
    address.length >= 5 &&
    hood.trim().length >= 2 &&
    city.trim().length >= 2
  const index = ORDER.indexOf(step)

  const onCep = async (value: string) => {
    const next = formatCep(value)
    setCep(next)
    if (next.length < 9) return setCepState('idle')
    setCepState('busy')
    const address = await findCep(next)
    if (!address) return setCepState('none')
    haptic.success()
    setCepState('idle')
    setFound(address)
    setStreet(address.street)
    setHood(address.neighborhood)
    setCity(address.city)
    setUf(address.uf)
  }

  const submit = async () => {
    setProblem(null)
    try {
      await complete.mutateAsync({
        name: name.trim(),
        address,
        neighborhood: hood.trim(),
        city: city.trim(),
        ...(uf ? { uf: uf as never } : {}),
        ...(cep.length === 9 ? { cep } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        amenities,
        ...(amenities.includes(1) ? { screenCount: screens } : {})
      })
      await refreshSession()
      queryClient.invalidateQueries()
      setDone({ at: Date.now() })
      setStep('receipt')
    } catch (error) {
      haptic.error()
      setProblem(
        error instanceof Error
          ? error.message
          : 'Não deu para colocar o bar no ar. Tente de novo.'
      )
    }
  }

  const toggle = (id: number) =>
    setAmenities((now) =>
      now.includes(id) ? now.filter((a) => a !== id) : [...now, id]
    )

  // Bar já cadastrado (link antigo, app reaberto aqui): Hoje na casa.
  if (owner.bar && !done) return <Redirect href="/casa" />

  if (step === 'receipt' && done)
    return (
      <Receipt
        name={name.trim()}
        street={address}
        hood={hood}
        city={city}
        uf={uf}
        at={done.at}
        onFirstGame={() =>
          router.replace({ pathname: '/novo-jogo', params: { primeiro: '1' } })
        }
      />
    )

  const dark = step === 'welcome'
  const fg = dark ? PAPER : palette.ink
  const bg = dark ? INK : palette.bg
  const tags = [
    ...(amenities.includes(1) ? [`TELÃO ×${screens}`] : []),
    ...amenities
      .filter((id) => id !== 1)
      .map((id) =>
        (
          SHORT[id] ??
          AMENITIES.find((a) => a.id === id)?.label ??
          ''
        ).toUpperCase()
      )
  ]

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 140,
          paddingHorizontal: 20,
          gap: 16
        }}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={10}
            onPress={() =>
              index > 0 ? setStep(ORDER[index - 1] as Step) : router.back()
            }
          >
            <Icon name="back" size={22} color={fg} />
          </Pressable>
          <Text
            style={[styles.mono, { color: dark ? '#aaa9a4' : palette.muted }]}
          >{`${index + 1} DE 4`}</Text>
        </View>
        <View
          style={[
            styles.progress,
            { backgroundColor: dark ? 'rgba(241,238,230,.15)' : palette.mark }
          ]}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${((index + 1) / 4) * 100}%`, backgroundColor: fg }
            ]}
          />
        </View>

        {step === 'welcome' ? (
          <View accessible accessibilityRole="header">
            <Text style={[styles.hero, { color: PAPER }]}>VAMOS LOTAR</Text>
            <Text style={[styles.hero, { color: PAPER }]}>SUA CASA NOS</Text>
            <Text style={[styles.hero, { color: ACID }]}>DIAS DE JOGO</Text>
          </View>
        ) : null}

        <Plate
          name={name.trim() || 'Seu bar'}
          address={address ? `${address}${hood ? ` · ${hood}` : ''}` : null}
          tags={tags}
          lit={
            step === 'place' ? 'address' : step === 'features' ? 'tags' : null
          }
        />

        {step === 'welcome' ? (
          <>
            <Pitch
              icon="tv"
              title="Divulgue sua programação"
              sub="o torcedor procura o jogo e acha o seu bar"
            />
            <Pitch
              icon="pin"
              title="Apareça pra quem está perto"
              sub="quem está no seu raio vê você primeiro"
            />
            <Text
              style={[
                text(14, 'Regular', 1.4),
                { color: '#aaa9a4', textAlign: 'center' }
              ]}
            >
              2 minutos · teste grátis de 90 dias, sem cartão
            </Text>
          </>
        ) : step === 'place' ? (
          <>
            <Title a="SEU " b="ESTABELECIMENTO" />
            <AuthField
              label="Nome do bar"
              value={name}
              onChangeText={setName}
              placeholder="Bar do Zé"
              autoCapitalize="words"
            />
            {found ? (
              <View
                style={[
                  styles.found,
                  { borderColor: ACID, backgroundColor: palette.card }
                ]}
              >
                <View style={styles.foundCheck}>
                  <Icon name="check" size={16} color={INK} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[text(16, 'Bold', 1.25), { color: palette.ink }]}
                  >{`CEP ${cep} encontrado`}</Text>
                  <Text
                    style={[text(14, 'Regular', 1.3), { color: palette.muted }]}
                  >
                    {[found.street, found.neighborhood, found.city]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setFound(null)
                    setCep('')
                  }}
                >
                  <Text
                    style={[
                      text(14, 'Bold', 1.3),
                      { color: palette.ink, textDecorationLine: 'underline' }
                    ]}
                  >
                    Trocar
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <AuthField
                  label="CEP"
                  value={cep}
                  onChangeText={onCep}
                  placeholder="05433-000"
                  keyboardType="number-pad"
                />
                {cepState !== 'idle' ? (
                  <Text
                    style={[
                      text(13.5, 'Regular', 1.3),
                      { color: palette.muted, marginTop: -6 }
                    ]}
                  >
                    {cepState === 'busy'
                      ? 'Buscando o CEP…'
                      : 'Não achamos esse CEP. Preencha o endereço abaixo.'}
                  </Text>
                ) : null}
                <AuthField
                  label="Rua"
                  value={street}
                  onChangeText={setStreet}
                  placeholder="Rua Aspicuelta"
                />
                <View style={styles.pair}>
                  <View style={{ flex: 1 }}>
                    <AuthField
                      label="Bairro"
                      value={hood}
                      onChangeText={setHood}
                      placeholder="Vila Madalena"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AuthField
                      label="Cidade"
                      value={city}
                      onChangeText={setCity}
                      placeholder="São Paulo"
                    />
                  </View>
                </View>
              </>
            )}
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <AuthField
                  label="Número"
                  value={number}
                  onChangeText={setNumber}
                  placeholder="1"
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AuthField
                  label="Telefone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(11) 9..."
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </>
        ) : step === 'features' ? (
          <>
            <Title a="O QUE O TORCEDOR " b="ENCONTRA?" />
            <Label>Para ver o jogo</Label>
            <View style={styles.chips}>
              {WATCH.map((a) => (
                <Chip
                  key={a.id}
                  label={SHORT[a.id] ?? a.label}
                  on={amenities.includes(a.id)}
                  onPress={() => toggle(a.id)}
                />
              ))}
              {amenities.includes(1) ? (
                <View
                  style={[styles.stepper, { backgroundColor: palette.card }]}
                >
                  <Text
                    style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}
                  >
                    Telas
                  </Text>
                  <Pressable
                    accessibilityLabel="Menos telas"
                    hitSlop={8}
                    onPress={() => setScreens((n) => Math.max(1, n - 1))}
                  >
                    <Text
                      style={[text(18, 'Bold', 1.1), { color: palette.ink }]}
                    >
                      −
                    </Text>
                  </Pressable>
                  <Text style={[text(15, 'Bold', 1.2), { color: palette.ink }]}>
                    {screens}
                  </Text>
                  <Pressable
                    accessibilityLabel="Mais telas"
                    hitSlop={8}
                    onPress={() => setScreens((n) => Math.min(99, n + 1))}
                  >
                    <Text
                      style={[text(18, 'Bold', 1.1), { color: palette.ink }]}
                    >
                      +
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <Label>O espaço e o resto</Label>
            <View style={styles.chips}>
              {OTHERS.map((a) => (
                <Chip
                  key={a.id}
                  label={a.label}
                  on={amenities.includes(a.id)}
                  onPress={() => toggle(a.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <ReviewRow
              title="Estabelecimento"
              sub={[address, phone].filter(Boolean).join(' · ')}
              onFix={() => setStep('place')}
            />
            <ReviewRow
              title="Características"
              sub={
                tags.length ? tags.join(' · ').toLowerCase() : 'nenhuma ainda'
              }
              onFix={() => setStep('features')}
            />
            <View style={[styles.trial, { backgroundColor: palette.mark }]}>
              <Icon name="calendar" size={20} color={palette.ink} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[text(16, 'Bold', 1.3), { color: palette.ink }]}
                >{`Teste grátis · ${TRIAL_DAYS} dias`}</Text>
                <Text
                  style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
                >
                  {`até ${dayMonth(new Date(Date.now() + TRIAL_DAYS * 86_400_000))}, sem cartão. O plano você escolhe depois do primeiro jogo.`}
                </Text>
              </View>
            </View>
            <Label>Depois de entrar no ar</Label>
            <View style={[styles.next, { backgroundColor: palette.card }]}>
              {[
                [
                  'Publicar o primeiro jogo',
                  '1 min · o torcedor já acha o seu bar'
                ],
                ['Completar o perfil', 'capa, descrição, horário e oferta'],
                ['Escolher o plano do teste', 'a gente indica pela sua rotina']
              ].map(([title, sub], i) => (
                <View
                  key={title}
                  style={[
                    styles.nextRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
                  ]}
                >
                  <View
                    style={[styles.nextNum, { backgroundColor: palette.mark }]}
                  >
                    <Text
                      style={[text(14, 'Bold', 1.1), { color: palette.ink }]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[text(16, 'Bold', 1.3), { color: palette.ink }]}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[
                        text(14, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            {problem ? (
              <Text
                style={[text(14, 'SemiBold', 1.4), { color: palette.live }]}
              >
                {problem}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: bg }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={(step === 'place' && !placeOk) || complete.isPending}
          onPress={() => {
            haptic.select()
            if (step === 'review') return submit()
            setStep(ORDER[index + 1] as Step)
          }}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View
            style={[
              styles.cta,
              ((step === 'place' && !placeOk) || complete.isPending) && {
                opacity: 0.55
              }
            ]}
          >
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              {step === 'welcome'
                ? 'Começar'
                : step === 'review'
                  ? complete.isPending
                    ? 'Colocando no ar…'
                    : 'Colocar meu bar no ar'
                  : 'Continuar'}
            </Text>
          </View>
        </Pressable>
        {step === 'features' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('review')}
          >
            <Text
              style={[
                text(15, 'SemiBold', 1.3),
                { color: palette.ink, textDecorationLine: 'underline' }
              ]}
            >
              Pular e preencher depois
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/** A placa do bar (`BAR PARCEIRO · TEMPORADA 26`), que se preenche a cada passo. */
export function Plate({
  name,
  address,
  tags,
  lit,
  today,
  plan
}: {
  name: string
  address: string | null
  tags: string[]
  lit?: 'address' | 'tags' | null
  today?: string
  plan?: string
}) {
  return (
    <View>
      <HardShadow color="#000" offset={5} radius={26} />
      <View style={styles.plate}>
        <DotField id="placa" radius={26} />
        <View style={styles.plateTop}>
          <Text style={styles.brand}>ONSIDE</Text>
          <Text style={styles.season}>{'BAR PARCEIRO\nTEMPORADA 26'}</Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.plateName}>
          {name}
        </Text>
        {address ? (
          <View style={[styles.plateLine, lit === 'address' && styles.lit]}>
            <Icon
              name="pin"
              size={15}
              color={lit === 'address' ? INK : '#c9c7c0'}
            />
            <Text
              numberOfLines={1}
              style={[
                text(14.5, 'Regular', 1.3),
                { color: lit === 'address' ? INK : '#c9c7c0', flex: 1 }
              ]}
            >
              {address}
            </Text>
          </View>
        ) : (
          <View style={styles.dashed}>
            <Text style={styles.dashedText}>Endereço</Text>
          </View>
        )}
        {tags.length ? (
          <View
            style={[
              styles.tags,
              lit === 'tags' && [styles.lit, { padding: 6 }]
            ]}
          >
            {tags.slice(0, 5).map((tag) => (
              <View
                key={tag}
                style={[styles.tag, lit === 'tags' && { borderColor: INK }]}
              >
                <Text
                  style={[styles.tagText, lit === 'tags' && { color: INK }]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.dashed}>
            <Text style={styles.dashedText}>O que tem</Text>
          </View>
        )}
        <View style={styles.perf} />
        <View style={styles.plateFoot}>
          <View>
            <Text style={styles.footLabel}>HOJE</Text>
            <Text style={styles.footValue}>{today ?? '—'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.footLabel}>PLANO</Text>
            <Text style={[styles.footValue, plan ? { color: ACID } : null]}>
              {plan ?? '—'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

/** O comprovante que sai da impressora, linha a linha (uma vez). */
function Receipt({
  name,
  street,
  hood,
  city,
  uf,
  at,
  onFirstGame
}: {
  name: string
  street: string
  hood: string
  city: string
  uf: string
  at: number
  onFirstGame: () => void
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const [round, setRound] = useState(0)
  const end = new Date(at + TRIAL_DAYS * 86_400_000)
  const when = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  // Número do comprovante: os segundos do dia em que foi ao ar (não é um
  // registro do servidor, é a fita).
  const number = String(Math.floor(at / 1000) % 1_000_000).padStart(6, '0')
  const lines: [string, string][] = [
    ['TESTE GRÁTIS', 'R$ 0,00'],
    [
      `${TRIAL_DAYS} dias`,
      `até ${pad(end.getDate())}/${pad(end.getMonth() + 1)}/${end.getFullYear()}`
    ],
    ['Cartão', 'não pedido'],
    ['Plano', 'você escolhe depois'],
    ['PRIMEIRO JOGO', 'por conta da Onside']
  ]
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 150,
          paddingHorizontal: 20,
          alignItems: 'center',
          gap: 14
        }}
      >
        <Text style={[styles.mono, { color: palette.muted }]}>
          PRONTO. SAIU O SEU COMPROVANTE
        </Text>
        <View
          accessible
          accessibilityRole="header"
          style={{ alignItems: 'center' }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.receiptTitle, { color: palette.ink }]}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.receiptTitle,
              { color: palette.dark ? ACID : palette.live }
            ]}
          >
            ESTÁ NO AR
          </Text>
        </View>
        <Printer printing={round} reduced={reduced} lines={lines.length + 3} />
        <View key={round} style={styles.paper}>
          <Line i={0} reduced={reduced} last={false}>
            <Text style={styles.paperBrand}>ONSIDE</Text>
            <Text style={styles.paperSmall}>COMPROVANTE DE CADASTRO</Text>
            <View style={styles.paperRow}>
              <Text style={styles.paperMono}>{`Nº ${number}`}</Text>
              <Text
                style={styles.paperMono}
              >{`${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()} · ${pad(when.getHours())}:${pad(when.getMinutes())}`}</Text>
            </View>
          </Line>
          <Line i={1} reduced={reduced} last={false}>
            <View style={styles.paperRule} />
            <Text
              style={[styles.paperMono, { fontFamily: 'GeistMono-SemiBold' }]}
            >
              {name.toUpperCase()}
            </Text>
            <Text style={styles.paperMono}>{street}</Text>
            <Text style={styles.paperMono}>
              {[hood, uf ? `${city}/${uf}` : city].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.paperRule} />
          </Line>
          {lines.map(([a, b], i) => (
            <Line key={a} i={i + 2} reduced={reduced} last={false}>
              <View style={styles.paperRow}>
                <Text
                  style={[
                    styles.paperMono,
                    a === a.toUpperCase() && {
                      fontFamily: 'GeistMono-SemiBold'
                    }
                  ]}
                >
                  {a}
                </Text>
                <Text style={styles.paperMono}>{b}</Text>
              </View>
            </Line>
          ))}
          <Line i={lines.length + 2} reduced={reduced} last>
            <View style={styles.paperRule} />
            <View style={styles.paperRow}>
              <Text style={styles.paperTotal}>TOTAL HOJE</Text>
              <Text style={styles.paperTotal}>R$ 0,00</Text>
            </View>
            <View style={styles.barcode}>
              {Array.from({ length: 34 }, (_, k) => (
                <View
                  key={String(k)}
                  style={{
                    width: (k * 7) % 3 === 0 ? 3 : 1.5,
                    height: 30,
                    backgroundColor: INK,
                    marginRight: 1.5
                  }}
                />
              ))}
            </View>
            <Text style={[styles.paperMono, { textAlign: 'center' }]}>
              obrigado por torcer com a gente
            </Text>
          </Line>
        </View>
      </ScrollView>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
        ]}
      >
        <Pressable accessibilityRole="button" onPress={onFirstGame}>
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={styles.cta}>
            <Icon name="plus" size={20} color={INK} />
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              Publicar o primeiro jogo
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRound((n) => n + 1)}
        >
          <Text
            style={[
              text(15, 'SemiBold', 1.3),
              { color: palette.ink, textDecorationLine: 'underline' }
            ]}
          >
            Imprimir de novo
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function Printer({
  printing,
  reduced,
  lines
}: {
  printing: number
  reduced: boolean
  lines: number
}) {
  const led = useSharedValue(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: pisca a cada impressão
  useEffect(() => {
    if (reduced) return
    led.set(
      withRepeat(
        withSequence(
          withTiming(0.25, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        Math.ceil((lines * 95 + 350) / 1000)
      )
    )
  }, [printing, reduced])
  const style = useAnimatedStyle(() => ({ opacity: led.get() }))
  return (
    <View style={styles.printer}>
      <Animated.View style={[styles.led, style]} />
    </View>
  )
}

function Line({
  i,
  reduced,
  last,
  children
}: {
  i: number
  reduced: boolean
  last: boolean
  children: React.ReactNode
}) {
  const t = useSharedValue(reduced ? 1 : 0)
  const fired = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: uma vez por impressão
  useEffect(() => {
    if (reduced) return
    t.set(withDelay(i * 95, withTiming(1, { duration: 350, easing: EASE })))
    if (last && !fired.current) {
      fired.current = true
      const timer = setTimeout(() => haptic.success(), i * 95 + 350)
      return () => clearTimeout(timer)
    }
  }, [])
  const style = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: [{ translateY: -8 * (1 - t.get()) }]
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

function Title({ a, b }: { a: string; b: string }) {
  const palette = usePalette()
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles.title, { color: palette.ink }]}
    >
      {a}
      <Text style={{ color: palette.dark ? ACID : palette.live }}>{b}</Text>
    </Text>
  )
}

function Label({ children }: { children: string }) {
  const palette = usePalette()
  return (
    <Text style={[styles.mono, { color: palette.muted }]}>
      {children.toUpperCase()}
    </Text>
  )
}

function Chip({
  label,
  on,
  onPress
}: {
  label: string
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[
        styles.chip,
        {
          backgroundColor: on ? palette.card : palette.mark,
          borderColor: on ? palette.ink : 'transparent'
        }
      ]}
    >
      <Text style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function Pitch({
  icon,
  title,
  sub
}: {
  icon: 'tv' | 'pin'
  title: string
  sub: string
}) {
  return (
    <View style={styles.promise}>
      <Icon name={icon} size={20} color={PAPER} accent={ACID} />
      <View style={{ flex: 1 }}>
        <Text style={[text(16, 'Bold', 1.3), { color: PAPER }]}>{title}</Text>
        <Text style={[text(13.5, 'Regular', 1.3), { color: '#aaa9a4' }]}>
          {sub}
        </Text>
      </View>
    </View>
  )
}

function ReviewRow({
  title,
  sub,
  onFix
}: {
  title: string
  sub: string
  onFix: () => void
}) {
  const palette = usePalette()
  return (
    <View style={[styles.review, { backgroundColor: palette.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
          {title}
        </Text>
        <Text style={[text(14, 'Regular', 1.35), { color: palette.muted }]}>
          {sub}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Corrigir ${title}`}
        hitSlop={8}
        onPress={onFix}
      >
        <Text
          style={[
            text(14.5, 'Bold', 1.3),
            { color: palette.ink, textDecorationLine: 'underline' }
          ]}
        >
          Corrigir
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 32
  },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    letterSpacing: 1.1
  },
  progress: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  hero: { fontFamily: 'Anton', fontSize: 46, marginVertical: -11.2 },
  title: { fontFamily: 'Anton', fontSize: 38, marginVertical: -9.2 },
  plate: {
    backgroundColor: INK,
    borderRadius: 26,
    padding: 16,
    gap: 10,
    overflow: 'hidden'
  },
  plateTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  brand: { fontFamily: 'Anton', fontSize: 22, color: PAPER },
  season: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#aaa9a4',
    textAlign: 'right'
  },
  plateName: {
    fontFamily: 'Anton',
    fontSize: 40,
    color: PAPER,
    textTransform: 'uppercase',
    marginVertical: -9.7
  },
  plateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8
  },
  lit: { backgroundColor: ACID, borderRadius: 10 },
  dashed: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.22)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  dashedText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    color: '#6b6a63'
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: -6
  },
  tag: {
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.25)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  tagText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, color: '#c9c7c0' },
  perf: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.18)',
    marginTop: 4
  },
  plateFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  footLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#aaa9a4'
  },
  footValue: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 15,
    color: PAPER,
    marginTop: 4
  },
  promise: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#1c1c18',
    borderRadius: 18,
    padding: 14
  },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 2.5
  },
  foundCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pair: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    borderWidth: 2,
    justifyContent: 'center'
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21
  },
  review: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    padding: 14,
    borderRadius: 18
  },
  trial: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18 },
  next: { borderRadius: 20, paddingHorizontal: 14 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  nextNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12
  },
  cta: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  receiptTitle: {
    fontFamily: 'Anton',
    fontSize: 44,
    textTransform: 'uppercase',
    marginVertical: -10.6,
    textAlign: 'center'
  },
  printer: {
    alignSelf: 'stretch',
    height: 34,
    borderRadius: 12,
    backgroundColor: INK,
    marginTop: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 14
  },
  led: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: ACID },
  paper: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    marginTop: -16,
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  paperBrand: {
    fontFamily: 'Anton',
    fontSize: 20,
    color: INK,
    textAlign: 'center'
  },
  paperSmall: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: INK,
    textAlign: 'center'
  },
  paperRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  paperMono: { fontFamily: 'GeistMono-SemiBold', fontSize: 12, color: INK },
  paperRule: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(18,18,15,.3)',
    marginVertical: 4
  },
  paperTotal: { fontFamily: 'Anton', fontSize: 24, color: INK },
  barcode: { flexDirection: 'row', justifyContent: 'center', marginVertical: 6 }
})
