import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HardShadow, Photo } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  Text,
  TextInput,
  text,
  useStatusBar
} from '@/components/ui'
import { pickBarPhoto, uploadBarPhoto } from '@/lib/bar-photo'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Completar o perfil (rodada 10, tela 6, 1 a 3): a capa (aparece no mapa, na
 * busca e no topo da página), a descrição (passa pela revisão da Onside) e
 * quando abre e o que oferece (horário da semana e a oferta da casa). Cada
 * passo tem "Depois"; no fim vem a rotina, a última pergunta.
 */

type Step = 0 | 1 | 2
const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const IDEAS = [
  'Quantas telas',
  'Prato da casa',
  'Para qual torcida',
  'Música no intervalo'
]
const IDEA_TEXT: Record<string, string> = {
  'Quantas telas': 'Tem telas espalhadas pela casa e o som do jogo ligado.',
  'Prato da casa': 'O petisco que sai rápido mesmo lotado é ',
  'Para qual torcida': 'Casa de torcida de ',
  'Música no intervalo': 'No intervalo, música ao vivo.'
}
const OFFERS = ['Chopp em dobro', '10% no 1º pedido', 'Porção grátis']
const UNTIL = ['até o intervalo', 'o jogo todo']
type Day = { opens: string; closes: string } | null
const DEFAULT: Day = { opens: '17:00', closes: '00:00' }

export default function CompletarPerfil() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const bar = owner.bar
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const [step, setStep] = useState<Step>(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [about, setAbout] = useState('')
  // Domingo a sábado (0 = domingo): a segunda nasce fechada, como no desenho.
  const [hours, setHours] = useState<Day[]>(() => [
    DEFAULT,
    null,
    DEFAULT,
    DEFAULT,
    DEFAULT,
    DEFAULT,
    DEFAULT
  ])
  const [offer, setOffer] = useState<string | null>(OFFERS[0] ?? null)
  const [until, setUntil] = useState<string>(UNTIL[0] ?? '')
  const add = useMutation(trpc.pub.addPhoto.mutationOptions())
  const updateMe = useMutation(trpc.pub.updateMe.mutationOptions())
  const saveHours = useMutation(trpc.pub.updateOpeningHours.mutationOptions())
  const saveOffer = useMutation(trpc.pub.updateHouseOffer.mutationOptions())
  const next = () => {
    setProblem(null)
    if (step < 2) return setStep((step + 1) as Step)
    router.replace('/rotina')
  }
  const fail = (error: unknown) => {
    haptic.error()
    setProblem(
      error instanceof Error
        ? error.message
        : 'Não deu para salvar. Tente de novo.'
    )
  }
  const pick = async (source: 'library' | 'camera') => {
    const asset = await pickBarPhoto(source)
    if (!asset) return
    setBusy(true)
    try {
      const url = await uploadBarPhoto(asset, true)
      await add.mutateAsync({ url, category: 'salao', cover: true })
      setCover(asset.uri)
      haptic.success()
      queryClient.invalidateQueries()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    setBusy(true)
    try {
      if (step === 1 && about.trim())
        await updateMe.mutateAsync({ description: about.trim() })
      if (step === 2) {
        await saveHours.mutateAsync({ openingHours: hours })
        if (owner.elite && offer)
          await saveOffer.mutateAsync({ houseOffer: `${offer} ${until}` })
      }
      haptic.success()
      queryClient.invalidateQueries()
      next()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }
  const pending = (photos.data ?? []).some((p) => p.status === 'pending')
  const titles: [string, string][] = [
    ['A CARA', 'DO SEU BAR'],
    ['O QUE TORNA', 'O BAR DIFERENTE?'],
    ['QUANDO ABRE', 'E O QUE OFERECE']
  ]
  const [a, b] = titles[step] ?? ['', '']
  const primary =
    step === 0
      ? cover || pending
        ? 'Continuar'
        : null
      : step === 1
        ? 'Salvar descrição'
        : 'Salvar e continuar'

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 150,
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
              step > 0 ? setStep((step - 1) as Step) : router.back()
            }
          >
            <Icon name="back" size={22} color={palette.ink} />
          </Pressable>
          <Text
            style={[styles.mono, { color: palette.muted }]}
          >{`COMPLETAR · ${step + 1} DE 3`}</Text>
        </View>
        <View style={[styles.progress, { backgroundColor: palette.mark }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${((step + 1) / 3) * 100}%`,
                backgroundColor: palette.ink
              }
            ]}
          />
        </View>
        <View accessible accessibilityRole="header">
          <Text style={[styles.title, { color: palette.ink }]}>{a}</Text>
          <Text
            style={[
              styles.title,
              { color: palette.dark ? ACID : palette.live }
            ]}
          >
            {b}
          </Text>
        </View>

        {step === 0 ? (
          <>
            <Text
              style={[text(15.5, 'Regular', 1.45), { color: palette.muted }]}
            >
              A capa aparece no mapa, na busca e no topo da página. Bar com foto
              recebe mais toques.
            </Text>
            <View style={styles.cover}>
              {cover || bar?.photoUrl ? (
                <Photo
                  uri={cover ?? bar?.photoUrl ?? null}
                  name={bar?.name ?? ''}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.coverEmpty,
                    { backgroundColor: palette.mark }
                  ]}
                >
                  <Icon name="camera" size={32} color={palette.muted} />
                </View>
              )}
              <View style={styles.capa}>
                <Text style={styles.capaText}>CAPA</Text>
              </View>
            </View>
            <View style={styles.pair}>
              <Outline
                icon="camera"
                label="Tirar foto"
                disabled={busy}
                onPress={() => pick('camera')}
              />
              <Outline
                icon="plus"
                label="Da galeria"
                disabled={busy}
                onPress={() => pick('library')}
              />
            </View>
            {[
              ['check', 'O telão ou o salão em dia de jogo'],
              ['check', 'Foto deitada, com luz'],
              ['close', 'Sem pessoas em primeiro plano']
            ].map(([icon, line]) => (
              <View key={line} style={styles.rule}>
                <Icon name={icon as 'check'} size={16} color={palette.muted} />
                <Text
                  style={[text(15, 'Regular', 1.3), { color: palette.ink }]}
                >
                  {line}
                </Text>
              </View>
            ))}
            <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
              {busy
                ? 'Enviando a foto…'
                : 'A Onside revisa em até 24 h antes de aparecer.'}
            </Text>
          </>
        ) : step === 1 ? (
          <>
            <View
              style={[
                styles.area,
                { borderColor: palette.ink, backgroundColor: palette.card }
              ]}
            >
              <TextInput
                multiline
                maxLength={280}
                value={about}
                onChangeText={setAbout}
                placeholder="Dois andares, seis telas e o som do jogo ligado no salão de cima…"
                placeholderTextColor={palette.muted}
                style={[
                  text(16.5, 'Regular', 1.45),
                  { color: palette.ink, minHeight: 110 }
                ]}
              />
              <Text
                style={[styles.count, { color: palette.muted }]}
              >{`${about.length}/280`}</Text>
            </View>
            <Text style={[styles.mono, { color: palette.muted }]}>
              IDEIAS PARA COMEÇAR
            </Text>
            <View style={styles.chips}>
              {IDEAS.map((idea) => (
                <Pressable
                  key={idea}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.select()
                    setAbout((now) =>
                      `${now}${now && !now.endsWith(' ') ? ' ' : ''}${IDEA_TEXT[idea]}`.slice(
                        0,
                        280
                      )
                    )
                  }}
                  style={[styles.chip, { backgroundColor: palette.mark }]}
                >
                  <Icon name="plus" size={14} color={palette.ink} />
                  <Text
                    style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}
                  >
                    {idea}
                  </Text>
                </Pressable>
              ))}
            </View>
            {about.trim() ? (
              <View style={[styles.quote, { backgroundColor: palette.mark }]}>
                <Text style={[styles.mono, { color: palette.muted }]}>
                  NA PÁGINA DO BAR
                </Text>
                <Text
                  numberOfLines={3}
                  style={[text(15, 'Regular', 1.45), { color: palette.ink }]}
                >{`“${about.trim()}”`}</Text>
              </View>
            ) : null}
            <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
              Passa pela revisão da Onside, como as fotos.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.chips}>
              <Pressable
                accessibilityRole="button"
                // Terça em todos os dias, menos a segunda (costuma fechar).
                onPress={() =>
                  setHours((now) =>
                    now.map((d, i) => (i === 1 ? d : (now[2] ?? DEFAULT)))
                  )
                }
                style={[styles.chip, { backgroundColor: palette.ink }]}
              >
                <Text
                  style={[text(15, 'SemiBold', 1.2), { color: palette.bg }]}
                >
                  Copiar terça para a semana
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                // Domingo igual ao sábado.
                onPress={() =>
                  setHours((now) =>
                    now.map((d, i) => (i === 0 ? (now[6] ?? null) : d))
                  )
                }
                style={[styles.chip, { backgroundColor: palette.mark }]}
              >
                <Text
                  style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}
                >
                  Fim de semana igual
                </Text>
              </Pressable>
            </View>
            <View>
              <HardShadow color={palette.drop} offset={4} radius={20} />
              <View style={[styles.week, { backgroundColor: palette.card }]}>
                {ORDER.map((day) => {
                  const slot = hours[day] ?? null
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: Boolean(slot) }}
                      accessibilityLabel={`${LETTERS[day]}: ${slot ? `${slot.opens} às ${slot.closes}` : 'fechado'}`}
                      onPress={() => {
                        haptic.select()
                        setHours((now) =>
                          now.map((d, i) =>
                            i === day ? (d ? null : DEFAULT) : d
                          )
                        )
                      }}
                      style={styles.day}
                    >
                      <Text
                        style={[styles.dayLetter, { color: palette.muted }]}
                      >
                        {LETTERS[day]}
                      </Text>
                      <View
                        style={[
                          styles.dayBar,
                          {
                            height: slot ? 64 : 6,
                            backgroundColor: slot ? palette.ink : palette.mark
                          }
                        ]}
                      />
                      <Text style={[styles.dayHours, { color: palette.muted }]}>
                        {slot
                          ? `${slot.opens.slice(0, 2)}-${slot.closes.slice(0, 2)}`
                          : 'fechado'}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.muted, marginTop: -6 }
              ]}
            >
              Toque num dia para abrir ou fechar. Os horários de cada dia se
              ajustam no painel do site.
            </Text>
            {owner.elite ? (
              <>
                <Text style={[styles.mono, { color: palette.muted }]}>
                  OFERTA DA CASA · PARA QUEM VEM PELA ONSIDE
                </Text>
                <View style={styles.chips}>
                  {OFFERS.map((o) => (
                    <Choice
                      key={o}
                      label={o}
                      on={offer === o}
                      onPress={() => setOffer(offer === o ? null : o)}
                    />
                  ))}
                </View>
                <View style={styles.chips}>
                  {UNTIL.map((u) => (
                    <Choice
                      key={u}
                      label={u}
                      on={until === u}
                      onPress={() => setUntil(u)}
                    />
                  ))}
                </View>
                {offer ? (
                  <View style={styles.offer}>
                    <Icon name="ticket" size={22} color={INK} accent={INK} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerKicker}>O TORCEDOR VÊ</Text>
                      <Text
                        style={[text(17, 'Bold', 1.25), { color: INK }]}
                      >{`${offer} ${until}`}</Text>
                      <Text
                        style={[text(14, 'Regular', 1.3), { color: '#3d4a06' }]}
                      >
                        vale com o código da Onside
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
        {problem ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.live }]}>
            {problem}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
        ]}
      >
        {primary ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => (step === 0 ? next() : save())}
          >
            <HardShadow color="#7f9a12" offset={4} radius={999} />
            <View style={[styles.cta, busy && { opacity: 0.55 }]}>
              <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
                {busy && step > 0 ? 'Salvando…' : primary}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={next}>
          <Text
            style={[
              text(15, 'SemiBold', 1.3),
              { color: palette.ink, textDecorationLine: 'underline' }
            ]}
          >
            Depois
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function Outline({
  icon,
  label,
  onPress,
  disabled
}: {
  icon: 'camera' | 'plus'
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.outline,
        { borderColor: palette.ink, opacity: disabled ? 0.5 : 1 }
      ]}
    >
      <Icon name={icon} size={18} color={palette.ink} />
      <Text style={[text(16.5, 'Bold', 1.2), { color: palette.ink }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function Choice({
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
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[
        styles.chip,
        { backgroundColor: on ? palette.ink : palette.mark }
      ]}
    >
      <Text
        style={[
          text(15.5, 'SemiBold', 1.2),
          { color: on ? palette.bg : palette.ink }
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  title: { fontFamily: 'Anton', fontSize: 40, marginVertical: -9.7 },
  cover: { height: 210, borderRadius: 24, overflow: 'hidden' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  capa: {
    position: 'absolute',
    top: 12,
    left: 12,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 7,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  capaText: { fontFamily: 'GeistMono-SemiBold', fontSize: 12, color: INK },
  pair: { flexDirection: 'row', gap: 10 },
  outline: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  area: { borderRadius: 22, borderWidth: 2.5, padding: 16, gap: 6 },
  count: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    alignSelf: 'flex-end'
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  quote: { borderRadius: 18, padding: 14, gap: 6 },
  week: {
    flexDirection: 'row',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 8
  },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  dayLetter: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  dayBar: { width: '72%', borderRadius: 8, marginTop: 'auto' },
  dayHours: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  offer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 16,
    borderRadius: 22,
    backgroundColor: ACID
  },
  offerKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: '#3d4a06'
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
    alignItems: 'center',
    justifyContent: 'center'
  }
})
