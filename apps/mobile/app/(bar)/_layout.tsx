import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { initials } from '@/components/explore'
import { OWNER_TAB_ICONS } from '@/components/owner-tabs'
import { useSoon } from '@/components/soon'
import { type MenuItem, YouMenu } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import { ACID, INK, Text, text } from '@/components/ui'
import { delta } from '@/lib/bar-owner'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * A barra do dono do bar (rodada 10, tela 1): a mesma cápsula de vidro do
 * torcedor, com Hoje, Jogos e Bar; o círculo da direita, que no torcedor é
 * a IA, é Validar código, a ação do turno, a um toque de qualquer tela.
 * "Bar" abre o menu de vidro (30m/30n), como o "Você" do torcedor.
 */

export default function OwnerTabs() {
  const router = useRouter()
  const palette = usePalette()
  const soon = useSoon()
  const pathname = usePathname()
  const owner = useOwnerBar()
  const [menu, setMenu] = useState(false)
  // Trocar de tela fecha o menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage à rota
  useEffect(() => setMenu(false), [pathname])
  const icons = OWNER_TAB_ICONS[palette.dark ? 'dark' : 'light']
  // O que o menu diz de cada item, buscado antes de ele abrir.
  const month = useQuery(
    trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(last30())
  )
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const inReview =
    photos.data?.filter((photo) => photo.status === 'pending').length ?? 0
  const growth = delta(month.data?.uniqueVisitorsChange)
  const bar = owner.bar

  const go = (path: '/casa' | '/jogos') => {
    setMenu(false)
    router.navigate(path)
  }
  const items: MenuItem[] = [
    {
      key: 'casa',
      icon: 'calendar',
      label: 'Hoje na casa',
      soon: '',
      open: () => go('/casa')
    },
    {
      key: 'desempenho',
      icon: 'ranking',
      label: 'Desempenho',
      soon: 'Desempenho chega ao app em breve; ele está no painel em onside.sh.',
      meta: growth
        ? `${growth.startsWith('−') ? '▼' : '▲'} ${growth.replace(/[+−]/, '')}`
        : undefined,
      metaHot: growth !== null && !growth.startsWith('−')
    },
    {
      key: 'quem-vai',
      icon: 'people',
      label: 'Quem vai',
      soon: 'Quem vai chega ao app em breve; ele está no painel em onside.sh.'
    },
    {
      key: 'espaco',
      icon: 'beer',
      label: 'Meu espaço',
      soon: 'Meu espaço chega ao app em breve; ele está no painel em onside.sh.'
    },
    {
      key: 'fotos',
      icon: 'camera',
      label: 'Fotos',
      soon: 'Fotos chega ao app em breve; ele está no painel em onside.sh.',
      badge: inReview ? `${inReview} em revisão` : undefined
    },
    {
      key: 'plano',
      icon: 'star',
      label: 'Plano',
      soon: 'O plano chega ao app em breve; ele está no painel em onside.sh.',
      meta: owner.planName ?? undefined
    },
    {
      key: 'config',
      icon: 'gear',
      label: 'Configurações',
      soon: 'As configurações do bar chegam ao app em breve; elas estão no painel em onside.sh.'
    }
  ]
  // "BZ" de "Bar do Zé": a primeira e a última palavra.
  const words = (bar?.name ?? '').trim().split(/\s+/)
  const mark = `${words[0]?.charAt(0) ?? ''}${words.length > 1 ? (words.at(-1)?.charAt(0) ?? '') : ''}`

  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        minimizeBehavior="never"
        tintColor={palette.ink}
        unstable_nativeProps={{ rejectStaleNavStateUpdates: true }}
      >
        <NativeTabs.Trigger name="casa">
          <NativeTabs.Trigger.Icon src={icons.hoje} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Hoje</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="jogos">
          <NativeTabs.Trigger.Icon src={icons.jogos} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Jogos</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="bar"
          disabled
          accessibilityLabel="Bar, abre o menu"
          listeners={{ tabPress: () => setMenu((open) => !open) }}
        >
          <NativeTabs.Trigger.Icon
            src={menu ? icons.bar.selected : icons.bar.default}
            renderingMode="original"
          />
          <NativeTabs.Trigger.Label hidden>Bar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="validar"
          role="search"
          disabled
          accessibilityLabel="Validar código"
          listeners={{
            tabPress: () => {
              setMenu(false)
              router.push('/validar-codigo')
            }
          }}
        >
          <NativeTabs.Trigger.Icon src={icons.qr} renderingMode="original" />
          <NativeTabs.Trigger.Label>Validar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {menu ? (
        <YouMenu
          wide
          name={bar?.name ?? ''}
          initials={initials(bar?.name ?? '')}
          items={items}
          current={pathname === '/casa' ? 'casa' : undefined}
          onClose={() => setMenu(false)}
          onItem={(item) => (item.open ? item.open() : soon.show(item.soon))}
          onSettings={() =>
            soon.show('As configurações do bar chegam em breve.')
          }
          head={
            <>
              <View style={styles.mark}>
                <Text style={styles.markText}>{mark}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={[text(16, 'Bold', 1.2), { color: palette.ink }]}
                >
                  {bar?.name}
                </Text>
                {owner.planName ? (
                  <View style={styles.plan}>
                    <View style={styles.planDot}>
                      <Text style={styles.planLetter}>
                        {owner.planName.charAt(0)}
                      </Text>
                    </View>
                    <Text style={styles.planText}>
                      {`Plano ${owner.planName}${owner.trial ? ' · teste' : ''} · ${bar?.isActive ? 'no ar' : 'fora do ar'}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          }
        />
      ) : null}
      {soon.toast}
    </View>
  )
}

/** Os últimos 30 dias, como o "Seu bar nos últimos 30 dias" do painel. */
function last30() {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  return { from: day(-29), to: day(0) }
}

const styles = StyleSheet.create({
  mark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText: {
    fontFamily: 'Anton',
    fontSize: 24,
    color: ACID,
    textTransform: 'uppercase'
  },
  plan: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: ACID
  },
  planDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  planLetter: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, color: ACID },
  planText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5, color: INK }
})
