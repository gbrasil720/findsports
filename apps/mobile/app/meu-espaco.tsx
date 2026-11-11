import {
  AMENITIES,
  HIDDEN_AMENITY_IDS
} from '@findsports_oficial/api/lib/amenities'
import {
  type OpeningHours,
  openingStatus,
  weekdayName
} from '@findsports_oficial/api/lib/opening-hours'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import {
  alertFailure,
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  PlanNudge
} from '@/components/bar-owner'
import { HardShadow, Photo } from '@/components/explore'
import { haptic } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  Icon,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { brasiliaWeekday, profileChecklist } from '@/lib/bar-owner'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Meu espaço (rodada 10, tela 5, 28a): a capa com "aberto agora", o anel
 * "Perfil N de 7" dizendo o que falta e por quê, "Ver como torcedor" (a
 * página pública), e as abas Dados, Horário (a régua da semana, hoje em
 * destaque), Código (na hora ou pela comanda, do Elite) e Características.
 *
 * Editar dados, horário e características continua no painel do site; o
 * que muda aqui é como o código é conferido. Movimento: as abas trocam
 * seco; a escolha do código troca o contorno seco, com o háptico.
 */

type Tab = 'dados' | 'horario' | 'codigo' | 'caracteristicas'
const DAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
// A régua começa na segunda, como no desenho.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function MeuEspaco() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const soon = useSoon()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const bar = owner.bar
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const [tab, setTab] = useState<Tab>('horario')
  const confirm = useMutation(
    trpc.pub.updateCodeConfirmation.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: alertFailure('Não deu para trocar como o código é conferido')
    })
  )
  if (!bar)
    return (
      <View
        style={[styles.center, { backgroundColor: palette.bg }]}
        accessibilityLabel="Carregando o bar"
      >
        {owner.error ? (
          <ErrorState
            title="Não deu para abrir o seu bar."
            error={owner.error}
            onRetry={() => owner.refetch()}
          />
        ) : (
          <ActivityIndicator color={palette.muted} />
        )}
      </View>
    )

  const hours = (bar.openingHours ?? null) as
    | ({ opens: string; closes: string } | null)[]
    | null
  const today = brasiliaWeekday(Date.now())
  // A mesma regra da página do bar: depois da meia-noite, a faixa de ontem
  // que passa da virada ainda vale ("aberto · fecha 02:00").
  const status = openingStatus(hours as OpeningHours | null, new Date())
  const approved = (photos.data ?? []).filter((p) => p.status === 'approved')
  const checklist = profileChecklist({
    cover: Boolean(bar.photoUrl),
    description: Boolean(bar.description || bar.descriptionPending),
    hours: Boolean(hours?.some(Boolean)),
    phone: Boolean(bar.phone),
    amenities: (bar.amenities ?? []).length > 0,
    gallery: approved.length >= 3,
    offer: !owner.elite || Boolean(bar.houseOffer)
  })
  const done = checklist.filter((item) => item.done).length
  const missing = checklist.find((item) => !item.done)
  const later = bar.confirmsCodesLater

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <BackButton />
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: palette.muted }]}>
              {bar.name.toLocaleUpperCase('pt-BR')}
            </Text>
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel="Meu espaço"
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.title, { color: palette.ink }]}
              >
                Meu
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.title, { color: palette.ink }]}
              >
                espaço
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/bar/[id]',
                params: {
                  id: bar.id,
                  name: bar.name,
                  photo: bar.photoUrl ?? undefined
                }
              })
            }
            style={[
              styles.see,
              { borderColor: palette.line, backgroundColor: palette.card }
            ]}
          >
            <Icon name="eye" size={18} color={palette.ink} />
            <Text style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}>
              Ver como torcedor
            </Text>
          </Pressable>
        </View>

        <View>
          <HardShadow color={palette.drop} offset={4} radius={24} />
          <View style={[styles.cover, { backgroundColor: palette.card }]}>
            <View style={styles.coverPhoto}>
              <Photo
                uri={bar.photoUrl}
                name={bar.name}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['transparent', 'rgba(12,12,10,.85)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.open}>
                <View
                  style={[
                    styles.openDot,
                    { backgroundColor: status?.open ? ACID : '#aaa9a4' }
                  ]}
                />
                <Text
                  style={[
                    styles.openText,
                    { color: status?.open ? ACID : PAPER }
                  ]}
                >
                  {!status
                    ? 'sem horário informado'
                    : status.open
                      ? `aberto agora · fecha ${status.closes}`
                      : status.opens
                        ? `fechado agora · abre ${status.opens.day === 'hoje' ? '' : `${status.opens.day} `}${status.opens.time}`
                        : 'fechado hoje'}
                </Text>
              </View>
            </View>
            <View style={styles.profile}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={[text(18, 'Bold', 1.2), { color: palette.ink }]}>
                  {`Perfil ${done} de ${checklist.length}`}
                </Text>
                <Text
                  style={[
                    text(14.5, 'Regular', 1.45),
                    { color: palette.muted }
                  ]}
                >
                  {missing
                    ? `Falta ${missing.label}: ${missing.why}`
                    : 'Perfil completo. O torcedor vê tudo o que precisa.'}
                </Text>
              </View>
              <Ring done={done} total={checklist.length} />
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            [
              ['dados', 'Dados'],
              ['horario', 'Horário'],
              ['codigo', 'Código'],
              ['caracteristicas', 'Características']
            ] as const
          ).map(([key, label]) => {
            const on = tab === key
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  setTab(key)
                }}
                style={[
                  styles.tab,
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
          })}
        </ScrollView>

        {tab === 'dados' ? (
          <OwnerCard>
            {[
              ['Nome', bar.name],
              [
                'Endereço',
                [bar.address, bar.neighborhood, bar.city]
                  .filter(Boolean)
                  .join(' · ')
              ],
              ['Telefone', bar.phone ?? 'não informado'],
              [
                'Descrição',
                bar.descriptionPending
                  ? `em revisão: ${bar.descriptionPending}`
                  : (bar.description ?? 'sem descrição')
              ]
            ].map(([label, value], index) => (
              <OwnerRow key={label} first={index === 0}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[styles.rowLabel, { color: palette.muted }]}>
                    {label.toUpperCase()}
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={[text(15.5, 'Regular', 1.4), { color: palette.ink }]}
                  >
                    {value}
                  </Text>
                </View>
              </OwnerRow>
            ))}
          </OwnerCard>
        ) : tab === 'horario' ? (
          <OwnerCard pad={14}>
            <View
              style={styles.week}
              accessible
              accessibilityLabel={`Horário da semana: ${WEEK_ORDER.map(
                (day) => {
                  const slot = hours?.[day]
                  return `${weekdayName(day)}, ${slot ? `das ${slot.opens} às ${slot.closes}` : 'fechado'}`
                }
              ).join('; ')}`}
            >
              {WEEK_ORDER.map((day) => {
                const slot = hours?.[day] ?? null
                const length = slot ? openLength(slot.opens, slot.closes) : 0
                const on = day === today
                return (
                  <View key={day} style={styles.weekDay}>
                    <Text style={[styles.weekLetter, { color: palette.muted }]}>
                      {DAY_LETTERS[day]}
                    </Text>
                    <View style={styles.weekTrack}>
                      <View
                        style={[
                          styles.weekBar,
                          {
                            height: slot
                              ? Math.min(96, Math.max(18, (length / 16) * 96))
                              : 4,
                            backgroundColor: !slot
                              ? palette.mark
                              : on
                                ? palette.dark
                                  ? ACID
                                  : '#7f9a12'
                                : palette.ink
                          }
                        ]}
                      />
                    </View>
                    <Text style={[styles.weekHours, { color: palette.muted }]}>
                      {slot
                        ? `${shortHour(slot.opens)}\n${shortHour(slot.closes)}`
                        : '—'}
                    </Text>
                  </View>
                )
              })}
            </View>
            {!hours ? (
              <Text
                style={[
                  text(14, 'Regular', 1.4),
                  { color: palette.muted, paddingBottom: 14 }
                ]}
              >
                Sem horário informado. Bares com horário aparecem com “aberto
                agora” no Explorar.
              </Text>
            ) : null}
          </OwnerCard>
        ) : tab === 'codigo' ? (
          <>
            <OwnerLabel>Como o código é conferido</OwnerLabel>
            {owner.elite ? (
              <View style={styles.choices}>
                {(
                  [
                    [false, 'Na hora', 'na porta ou no balcão'],
                    [true, 'Pela comanda', 'lança depois do jogo']
                  ] as const
                ).map(([value, title, sub]) => {
                  const on = later === value
                  return (
                    <Pressable
                      key={title}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      disabled={confirm.isPending}
                      onPress={() => {
                        if (on) return
                        haptic.select()
                        confirm.mutate({ later: value })
                      }}
                      style={{ flex: 1 }}
                    >
                      <HardShadow color={palette.drop} offset={3} radius={20} />
                      <View
                        style={[
                          styles.choice,
                          {
                            backgroundColor: palette.card,
                            borderColor: on ? palette.ink : 'transparent'
                          }
                        ]}
                      >
                        <Text
                          style={[
                            text(17, 'Bold', 1.2),
                            { color: palette.ink }
                          ]}
                        >
                          {title}
                        </Text>
                        <Text
                          style={[
                            text(13.5, 'Regular', 1.3),
                            { color: palette.muted }
                          ]}
                        >
                          {sub}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ) : (
              <PlanNudge
                to="elite"
                title="O código do balcão"
                body="Quem marca “Vou assistir aqui” recebe um código; no balcão você valida, libera a oferta da casa e sabe quem veio pela Onside."
              />
            )}
          </>
        ) : (
          <View style={styles.chips}>
            {!(bar.amenities ?? []).some(
              (id) => !HIDDEN_AMENITY_IDS.includes(id)
            ) ? (
              <Text
                style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
              >
                Nenhuma característica marcada. Elas são os filtros da busca:
                telão, som, área externa…
              </Text>
            ) : null}
            {AMENITIES.filter(
              (item) =>
                (bar.amenities ?? []).includes(item.id) &&
                !HIDDEN_AMENITY_IDS.includes(item.id)
            ).map((item) => (
              <View
                key={item.id}
                style={[styles.chip, { backgroundColor: palette.mark }]}
              >
                <Text
                  style={[text(14, 'SemiBold', 1.2), { color: palette.ink }]}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            soon.show(
              'Para editar dados, horário e características, use o painel do bar em onside.sh.'
            )
          }
          style={styles.editHint}
        >
          <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
            {'Editar dados, horário e características: '}
            <Text
              style={[
                text(14, 'Bold', 1.4),
                { color: palette.ink, textDecorationLine: 'underline' }
              ]}
            >
              painel do site
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
      {soon.toast}
    </View>
  )
}

/** "18" para 18:00, "18:30" com minutos: cabe na coluna do dia. */
function shortHour(value: string) {
  return value.endsWith(':00') ? value.slice(0, 2) : value.slice(0, 5)
}

/** Horas abertas (fechar antes de abrir passa da meia-noite). */
function openLength(opens: string, closes: string) {
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const span = (minutes(closes) - minutes(opens) + 1440) % 1440
  return span / 60
}

function Ring({ done, total }: { done: number; total: number }) {
  const size = 76
  const stroke = 8
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  const palette = usePalette()
  return (
    <View
      accessible
      accessibilityLabel={`${done} de ${total}`}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.mark}
          strokeWidth={stroke}
          fill="none"
        />
        {done > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ACID}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${(length * done) / total} ${length}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text
        style={[text(17, 'Bold', 1.1), { color: palette.ink }]}
      >{`${done}/${total}`}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 8
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    marginVertical: -13
  },
  see: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    borderWidth: 1.5,
    marginBottom: 6
  },
  cover: { borderRadius: 24, overflow: 'hidden' },
  coverPhoto: { height: 140, justifyContent: 'flex-end' },
  open: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  openDot: { width: 8, height: 8, borderRadius: 4 },
  openText: { fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  tab: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    justifyContent: 'center'
  },
  rowLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 1
  },
  week: { flexDirection: 'row', gap: 6, paddingVertical: 14 },
  weekDay: { flex: 1, alignItems: 'center', gap: 6 },
  weekLetter: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  weekTrack: {
    height: 100,
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    alignItems: 'center'
  },
  weekBar: { width: '86%', borderRadius: 8 },
  weekHours: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    textAlign: 'center'
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  choices: { flexDirection: 'row', gap: 10 },
  choice: { borderRadius: 20, borderWidth: 2.5, padding: 14, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center'
  },
  editHint: { paddingVertical: 4 }
})
