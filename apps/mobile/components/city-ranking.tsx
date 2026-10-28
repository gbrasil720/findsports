import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View
} from 'react-native'
import Svg, { Line } from 'react-native-svg'
import { Card } from '@/components/card'
import { Avatar } from '@/components/friends'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  Title,
  Toggle,
  text
} from '@/components/ui'
import { fansLabel, unit } from '@/lib/ranking'
import { trpc } from '@/lib/trpc'

/*
 * O ranking da cidade (27a–27c, WEB-465): as peças que a aba Global e a
 * lista inteira dividem. A conta e quem aparece são do servidor
 * (`ranking.city`, `packages/api/src/lib/ranking-read.ts`); só aparecem nome,
 * `@` e número de quem ligou "Aparecer no ranking global".
 */

export type CityPage = inferRouterOutputs<AppRouter>['ranking']['city']
export type CityBoard = Extract<NonNullable<CityPage>, { listed: true }>
export type CityOff = Extract<NonNullable<CityPage>, { listed: false }>
export type Place = CityBoard['rows'][number]
export type CityMetric = CityBoard['metric']

/** As páginas da cidade, por posição; a aba Global e a lista usam a mesma. */
export function useCityBoard(metric: CityMetric, enabled = true) {
  return useInfiniteQuery({
    ...trpc.ranking.city.infiniteQueryOptions(
      { metric },
      {
        initialCursor: 0,
        getNextPageParam: (last) => (last?.listed ? last.nextCursor : null)
      }
    ),
    enabled
  })
}

/** Largura da coluna da posição: cabe "1.284" sem empurrar o nome. */
export const placeWidth = (rows: Place[]) =>
  Math.max(
    28,
    (rows.at(-1)?.position ?? 1).toLocaleString('pt-BR').length * 11 + 8
  )

/** Uma linha da lista (27a): posição, quadrinho, nome, `@` e o número. */
export function PlaceRow({
  row,
  metric,
  width,
  first
}: {
  row: Place
  metric: CityMetric
  width: number
  first?: boolean
}) {
  const palette = usePalette()
  const label = `${row.position}º, ${row.me ? 'você' : row.name}, ${row.value} ${unit(metric, row.value)}`
  const body = (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.row,
        row.me
          ? styles.meRow
          : !first && { borderTopWidth: 1, borderTopColor: palette.line }
      ]}
    >
      <Text
        style={[
          styles.place,
          { width },
          {
            color: row.me ? INK : row.position <= 3 ? palette.hot : palette.ink
          }
        ]}
      >
        {row.position.toLocaleString('pt-BR')}
      </Text>
      <Avatar id={row.id} name={row.name} me={row.me} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(15, 'Bold', 1.3), { color: row.me ? INK : palette.ink }]}
        >
          {row.me ? 'Você' : row.name}
        </Text>
        {row.username ? (
          <Text
            numberOfLines={1}
            style={[
              text(12.5, 'Regular', 1.3),
              { color: row.me ? INK : palette.muted }
            ]}
          >
            @{row.username}
          </Text>
        ) : null}
      </View>
      <View style={styles.score}>
        <Text style={[styles.value, { color: row.me ? INK : palette.ink }]}>
          {row.value}
        </Text>
        <Text
          style={[
            text(11, 'Regular', 1.2),
            { color: row.me ? INK : palette.muted }
          ]}
        >
          {unit(metric, row.value)}
        </Text>
      </View>
    </View>
  )
  if (!row.me) return body
  // Você: o bloco acid com a sombra dura de tinta (no escuro ela some).
  return (
    <View style={{ marginVertical: 4 }}>
      {palette.dark ? null : <View style={styles.meShadow} />}
      {body}
    </View>
  )
}

/**
 * O corte "1.273 TORCEDORES" (27a): quantos não estão na tela. Tocar traz a
 * próxima página por posição; sem mais nada, só desenha.
 */
export function Cut({
  count,
  loading,
  onPress
}: {
  count: number
  loading: boolean
  onPress?: () => void
}) {
  const palette = usePalette()
  const dash = (
    <Svg height={2} style={{ flex: 1 }}>
      <Line
        x1={0}
        y1={1}
        x2="100%"
        y2={1}
        stroke={palette.dash}
        strokeWidth={1}
        strokeDasharray="4,4"
      />
    </Svg>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count.toLocaleString('pt-BR')} torcedores entre um trecho e outro`}
      accessibilityHint="Mostra mais posições"
      accessibilityState={{ busy: loading, disabled: !onPress }}
      disabled={!onPress || loading}
      hitSlop={10}
      onPress={() => {
        haptic.select()
        onPress?.()
      }}
      style={({ pressed }) => [styles.cut, pressed && { opacity: 0.6 }]}
    >
      {dash}
      <Text style={[styles.cutLabel, { color: palette.muted }]}>
        {fansLabel(count)}
      </Text>
      {/* A seta dá lugar ao giro enquanto a página chega; a largura não muda. */}
      {onPress ? (
        <View style={styles.cutIcon}>
          {loading ? (
            <ActivityIndicator size="small" color={palette.muted} />
          ) : (
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="next" size={11} color={palette.muted} />
            </View>
          )}
        </View>
      ) : null}
      {dash}
    </Pressable>
  )
}

/**
 * Fora do ranking global (27c): o cartão de tinta com o interruptor, a
 * lista apagada atrás do aviso e o atalho para Privacidade. Ligar grava
 * `user.ranking_global` e a aba vira a da cidade.
 */
export function OffGlobal({ data }: { data: CityOff }) {
  const palette = usePalette()
  const router = useRouter()
  const queryClient = useQueryClient()
  // O interruptor anda no toque; volta se o servidor recusar.
  const [on, setOn] = useState(data.rankingGlobal)
  const save = useMutation(
    trpc.friends.updatePrivacy.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({ queryKey: trpc.friends.me.queryKey() })
        return queryClient.invalidateQueries({
          queryKey: trpc.ranking.city.pathKey()
        })
      },
      onError: () => {
        haptic.error()
        setOn(data.rankingGlobal)
        Alert.alert('Não foi possível salvar', 'Tente de novo.')
      }
    })
  )
  const flip = () => {
    if (save.isPending) return
    haptic.select()
    setOn(!on)
    save.mutate({ rankingGlobal: !on })
  }
  return (
    <View style={{ gap: 12 }}>
      <Card fill={INK} shadow={ACID} offset={6}>
        <View style={styles.off}>
          <Text style={styles.kicker}>PRIVACIDADE</Text>
          <Title
            lines={[
              [
                data.nobody
                  ? 'Você está fora do ranking global.'
                  : 'Você escolheu não aparecer no ranking global.'
              ]
            ]}
            size={30}
            color={PAPER}
          />
          <Text style={[text(15, 'Regular', 1.45), styles.offBody]}>
            {data.nobody
              ? 'Em Privacidade, quem vê os bares que você validou está em Ninguém. Assim você fica fora da lista da cidade, mesmo com o ranking global ligado.'
              : 'Seus amigos continuam vendo você. Na lista da cidade, ninguém vê seu nome, e você também não vê a sua posição.'}
          </Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel="Aparecer no ranking global"
            onPress={flip}
            style={({ pressed }) => [
              styles.offRow,
              pressed && { opacity: 0.85 }
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text(16, 'Bold', 1.3), { color: PAPER }]}>
                Aparecer no ranking global
              </Text>
              <Text style={[text(13, 'Regular', 1.35), styles.offSub]}>
                Só nome, @usuário e número
              </Text>
            </View>
            <Toggle on={on} off="#2c2c27" track={ACID} knob={INK} />
          </Pressable>
        </View>
      </Card>
      <Card soft>
        <View
          style={styles.preview}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {PREVIEW.map((tone, index) => (
            <View
              key={tone}
              style={[
                styles.ghostRow,
                index > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
              ]}
            >
              <View
                style={[
                  styles.ghostPlace,
                  { backgroundColor: index < 3 ? palette.hot : palette.ink }
                ]}
              />
              <View
                style={[
                  styles.ghostFace,
                  {
                    backgroundColor:
                      tone === 'acid'
                        ? ACID
                        : tone === 'live'
                          ? LIVE
                          : palette.mark
                  }
                ]}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <View
                  style={[
                    styles.ghostLine,
                    { width: '70%', backgroundColor: palette.mark }
                  ]}
                />
                <View
                  style={[
                    styles.ghostLine,
                    { width: '40%', backgroundColor: palette.mark }
                  ]}
                />
              </View>
              <View
                style={[styles.ghostValue, { backgroundColor: palette.mark }]}
              />
            </View>
          ))}
          <View style={styles.pillWrap} pointerEvents="none">
            <View style={[styles.pill, { backgroundColor: palette.card }]}>
              <Icon name="eye" size={18} color={palette.ink} />
              <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                Você está fora do global
              </Text>
            </View>
          </View>
        </View>
      </Card>
      <Text
        style={[
          text(13.5, 'Regular', 1.4),
          { color: palette.muted, textAlign: 'center' }
        ]}
      >
        Também dá para mudar em{' '}
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/configuracoes?aba=privacidade' as Href)}
          style={[text(13.5, 'SemiBold', 1.4), { color: palette.ink }]}
        >
          Configurações › Privacidade
        </Text>
        .
      </Text>
    </View>
  )
}

// A lista apagada atrás do aviso: quatro linhas como as do top, sem dado.
const PREVIEW = ['acid', 'plain-1', 'live', 'plain-2'] as const

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14
  },
  meRow: { backgroundColor: ACID, borderRadius: 4 },
  meShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 4,
    backgroundColor: INK
  },
  place: { fontFamily: 'Anton', fontSize: 22 },
  score: { alignItems: 'center', minWidth: 36 },
  value: { fontFamily: 'Anton', fontSize: 22 },
  cut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6
  },
  cutLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6
  },
  cutIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4
  },
  off: { padding: 20, gap: 14 },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: ACID
  },
  offBody: { color: 'rgba(241,238,230,.82)' },
  offRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 6,
    backgroundColor: 'rgba(241,238,230,.07)'
  },
  offSub: { color: 'rgba(241,238,230,.6)' },
  preview: { paddingHorizontal: 14, opacity: 1 },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    opacity: 0.22
  },
  ghostPlace: { width: 12, height: 22, borderRadius: 3 },
  ghostFace: { width: 38, height: 38, borderRadius: 6 },
  ghostLine: { height: 10, borderRadius: 5 },
  ghostValue: { width: 22, height: 24, borderRadius: 4 },
  pillWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }
  }
})
