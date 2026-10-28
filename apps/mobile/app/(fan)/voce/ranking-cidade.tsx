import { useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import {
  type CityMetric,
  type CityPage,
  Cut,
  OffGlobal,
  PlaceRow,
  placeWidth,
  useCityBoard
} from '@/components/city-ranking'
import { SWAP } from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  PillButton,
  Text,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import {
  CITY_METRICS,
  cityLayout,
  closesLabel,
  monthLabel
} from '@/lib/ranking'

/*
 * A lista da cidade (27a claro, 27b escuro; WEB-465), pelo "Ver todos" da
 * aba Global. O top, o corte com quantos ficam no meio e a sua vizinhança,
 * fixa embaixo; tocar no corte traz a próxima página por posição até o topo
 * encostar em você, e daí a lista segue numa só. Métricas: "Bares no mês" e
 * "Jogos". O filtro de bairro, as setas e a medalha Cidade do design ficaram
 * para depois (decisão do dono, 28/10/2026).
 */
export default function CityRanking() {
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  useStatusBar('auto')
  const [metric, setMetric] = useState<CityMetric>('bars')
  const board = useCityBoard(metric)
  const pull = usePullRefresh(() => board.refetch())
  const head = board.data?.pages[0]

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 13, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.top}>
          <BackButton />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={[text(13), { color: palette.muted }]}>
              Ranking global
              {head?.listed
                ? ` · ${monthLabel(head.month).toLocaleLowerCase('pt-BR')}`
                : ''}
            </Text>
            {head ? (
              <Title lines={[[head.city]]} size={40} color={palette.ink} />
            ) : null}
          </View>
        </View>

        {board.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : board.isError ? (
          <View style={styles.stack}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir o ranking.
            </Text>
            <PillButton
              label="Tentar de novo"
              onPress={() => board.refetch()}
            />
          </View>
        ) : !head ? (
          <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
            Escolha sua cidade para ver sua posição nela.
          </Text>
        ) : !head.listed ? (
          <OffGlobal data={head} />
        ) : (
          <Board
            pages={board.data.pages}
            metric={metric}
            onMetric={setMetric}
            loading={board.isFetchingNextPage}
            onMore={board.hasNextPage ? () => board.fetchNextPage() : undefined}
          />
        )}
      </ScrollView>
    </View>
  )
}

function Board({
  pages,
  metric,
  onMetric,
  loading,
  onMore
}: {
  pages: CityPage[]
  metric: CityMetric
  onMetric: (metric: CityMetric) => void
  loading: boolean
  onMore?: () => void
}) {
  const palette = usePalette()
  const first = pages[0]
  if (!first?.listed) return null
  const loaded = pages.flatMap((page) => (page?.listed ? page.rows : []))
  const layout = cityLayout(loaded, first.around, first.total)
  return (
    <View style={styles.stack}>
      <View style={styles.chips}>
        {CITY_METRICS.map((m) => (
          <FilterChip
            key={m.key}
            label={m.label}
            raised
            on={metric === m.key}
            onPress={() => onMetric(m.key)}
          />
        ))}
      </View>
      <View style={styles.meta}>
        <Text style={[text(13), { color: palette.muted, flexShrink: 1 }]}>
          <Text style={[text(13, 'Bold'), { color: palette.ink }]}>
            {first.total.toLocaleString('pt-BR')}
          </Text>{' '}
          {first.total === 1 ? 'torcedor contando' : 'torcedores contando'}
        </Text>
        <Text style={[text(13), { color: palette.muted }]}>
          {closesLabel(first.closesInDays)}
        </Text>
      </View>
      {/* Trocar de métrica troca a lista em fade curto, sem salto. */}
      <Animated.View key={first.metric} entering={SWAP} style={styles.stack}>
        <Card shadow={palette.dark ? 'rgba(201,241,53,.32)' : ACID} offset={6}>
          <View style={styles.list}>
            {layout.top.map((row, index) => (
              <PlaceRow
                key={row.id}
                row={row}
                metric={first.metric}
                width={placeWidth(layout.top)}
                first={index === 0}
              />
            ))}
          </View>
        </Card>
        {layout.gap > 0 ? (
          <>
            <Cut count={layout.gap} loading={loading} onPress={onMore} />
            <Card soft>
              <View style={styles.around}>
                {layout.around.map((row, index) => (
                  <PlaceRow
                    key={row.id}
                    row={row}
                    metric={first.metric}
                    width={placeWidth(layout.around)}
                    first={index === 0}
                  />
                ))}
              </View>
            </Card>
          </>
        ) : layout.rest > 0 ? (
          <Cut count={layout.rest} loading={loading} onPress={onMore} />
        ) : null}
      </Animated.View>
      <Text
        style={[
          text(13, 'Regular', 1.45),
          { color: palette.muted, textAlign: 'center' }
        ]}
      >
        Só aparecem nome, @usuário e número. Quem desligou o ranking global não
        entra na lista.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stack: { gap: 14 },
  chips: { flexDirection: 'row', gap: 6 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -2
  },
  list: { paddingHorizontal: 0 },
  // A vizinhança vem recuada, e o seu bloco acid não encosta na borda.
  around: { paddingHorizontal: 10, paddingVertical: 4 }
})
