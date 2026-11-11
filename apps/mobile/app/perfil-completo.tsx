import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HardShadow } from '@/components/explore'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { dayMonth, gameState, shortDate } from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'
import { Plate } from './cadastro-bar'

/*
 * Tudo pronto (rodada 10, tela 6): a placa completa e o que já foi feito,
 * pelo dado real (bar no ar, primeiro jogo, capa e descrição, horário e
 * oferta, plano do teste). Falta só o primeiro código, no dia do jogo, pelo
 * círculo da barra.
 */

export default function PerfilCompleto() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  useStatusBar('light')
  const owner = useOwnerBar()
  const bar = owner.bar
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const sub = useQuery(trpc.pub.getMySubscription.queryOptions())
  const now = Date.now()
  const next = (events.data ?? []).find(
    (g) => gameState(g, now) === 'upcoming' || gameState(g, now) === 'live'
  )
  const end = sub.data?.currentPeriodEnd
    ? new Date(sub.data.currentPeriodEnd)
    : null
  const hasCover =
    Boolean(bar?.photoUrl) ||
    (photos.data ?? []).some((p) => p.status !== 'rejected')
  const hasAbout = Boolean(bar?.description || bar?.descriptionPending)
  const hours = (bar?.openingHours ?? null) as unknown[] | null
  const rows: [boolean, string, string][] = [
    [Boolean(bar?.isActive), 'Bar no ar', bar?.neighborhood ?? ''],
    [
      Boolean(next),
      'Primeiro jogo',
      next
        ? `${gameTitle(next)} · ${shortDate(next.startsAt).split(' ')[0]?.toLowerCase()} ${formatTime(next.startsAt)}`
        : 'publique em Jogos'
    ],
    [
      hasCover && hasAbout,
      'Capa e descrição',
      hasCover || hasAbout ? 'em revisão · até 24 h' : 'em Meu espaço'
    ],
    [
      Boolean(hours?.some(Boolean)),
      'Horário e oferta',
      bar?.houseOffer ?? 'em Meu espaço'
    ],
    [
      Boolean(owner.planName),
      'Plano do teste',
      owner.planName
        ? `${owner.planName}${end ? ` · grátis até ${dayMonth(end)}` : ''}`
        : ''
    ]
  ]
  const amenities = bar?.amenities ?? []
  const tags = [
    ...(amenities.includes(1) ? [`TELÃO ×${bar?.screenCount ?? 1}`] : []),
    ...amenities
      .filter((id) => id !== 1)
      .map((id) =>
        id === 2
          ? 'SOM'
          : (AMENITIES.find((a) => a.id === id)?.label ?? '').toUpperCase()
      )
      .filter(Boolean)
  ]

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 18,
          gap: 14
        }}
      >
        <Text style={styles.kicker}>PERFIL COMPLETO</Text>
        <Plate
          name={bar?.name ?? ''}
          address={bar ? `${bar.address} · ${bar.neighborhood}` : null}
          tags={tags}
          today={
            next
              ? `${gameTitle(next)
                  .split(' × ')
                  .map((s) => s.slice(0, 3))
                  .join(' × ')} ${formatTime(next.startsAt)}`
              : undefined
          }
          plan={owner.planName ? `${owner.planName} · teste` : undefined}
        />
        <View style={styles.list}>
          {rows.map(([ok, title, sub], i) => (
            <View key={title} style={[styles.row, i > 0 && styles.line]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: ok ? ACID : 'rgba(241,238,230,.1)' }
                ]}
              >
                {ok ? <Icon name="check" size={16} color={INK} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[text(16.5, 'Bold', 1.3), { color: PAPER }]}>
                  {title}
                </Text>
                {sub ? (
                  <Text
                    style={[text(14, 'Regular', 1.3), { color: '#aaa9a4' }]}
                  >
                    {sub}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          <View style={[styles.row, styles.line]}>
            <View
              style={[styles.dot, { backgroundColor: 'rgba(241,238,230,.1)' }]}
            >
              <Icon name="qr" size={14} color={PAPER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[text(16.5, 'Bold', 1.3), { color: PAPER }]}>
                Validar o primeiro código
              </Text>
              <Text style={[text(14, 'Regular', 1.3), { color: '#aaa9a4' }]}>
                no dia do jogo, pelo círculo da barra
              </Text>
            </View>
          </View>
          {/* A porta principal do passeio do bar (rodada 11): oferecido,
              nunca forçado. */}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace({ pathname: '/casa', params: { passeio: '1' } })
            }
            style={[styles.row, styles.line]}
          >
            <View style={[styles.dot, { backgroundColor: ACID }]}>
              <Icon name="sparkle" size={16} color={INK} accent={INK} />
            </View>
            <Text style={[text(16.5, 'Bold', 1.3), { color: PAPER, flex: 1 }]}>
              Passeio de 30 s pelo app do bar
            </Text>
            <Text style={[text(15, 'Bold', 1.2), { color: ACID }]}>Ver</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/casa')}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={styles.cta}>
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              Ir para Hoje na casa
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.6,
    color: ACID,
    textAlign: 'center'
  },
  list: { backgroundColor: '#1c1c18', borderRadius: 24, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14
  },
  line: { borderTopWidth: 1, borderTopColor: 'rgba(241,238,230,.1)' },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: INK
  },
  cta: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
