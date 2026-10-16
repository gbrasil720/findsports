import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Alert, View } from 'react-native'
import { initials, usePalette } from '@/components/explore'
import { ExploreStateProvider } from '@/components/explore-state'
import { useSoon } from '@/components/soon'
import { type MenuItem, YouMenu } from '@/components/tab-bar'
import { authClient } from '@/lib/auth-client'
import { useFavorites } from '@/lib/favorites'
import { trpc } from '@/lib/trpc'

/*
 * As abas do torcedor ("02 Navbar glass"): Explorar, Ranking e Você, com a
 * busca com IA no círculo à direita. É a barra nativa do iOS 26
 * (UITabBarController, pelo `NativeTabs`): o vidro distorce o que passa por
 * baixo e o destaque da aba se arrasta de uma para outra, como no sistema.
 * Ranking e IA ainda não existem (avisam "em breve"); "Você" mostra o
 * mesmo Explorar com o menu de vidro (2c) por cima.
 */

const TAB_ICONS = {
  light: {
    map: require('../../assets/images/tabs/map-light.png'),
    ranking: require('../../assets/images/tabs/ranking-light.png'),
    you: require('../../assets/images/tabs/you-light.png'),
    sparkle: require('../../assets/images/tabs/sparkle-light.png')
  },
  dark: {
    map: require('../../assets/images/tabs/map-dark.png'),
    ranking: require('../../assets/images/tabs/ranking-dark.png'),
    you: require('../../assets/images/tabs/you-dark.png'),
    sparkle: require('../../assets/images/tabs/sparkle-dark.png')
  }
}

export default function FanTabs() {
  const router = useRouter()
  const palette = usePalette()
  const soon = useSoon()
  const session = authClient.useSession()
  // "Você" é uma aba de verdade (a barra a mantém marcada) que mostra o
  // mesmo Explorar com o menu por cima; fechar o menu volta para Explorar.
  const pathname = usePathname()
  const menuOpen = pathname === '/voce'
  const closeMenu = () => router.navigate('/explore')
  const favorites = useFavorites()
  const pending = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    retry: false,
    meta: { errorToast: false }
  })
  const icons = TAB_ICONS[palette.dark ? 'dark' : 'light']
  const user = session.data?.user

  const items: MenuItem[] = [
    {
      key: 'perfil',
      icon: 'you',
      label: 'Perfil',
      soon: 'O perfil chega em breve'
    },
    {
      key: 'conquistas',
      icon: 'medal',
      label: 'Conquistas',
      soon: 'As conquistas chegam em breve'
    },
    {
      key: 'jogos',
      icon: 'ticket',
      label: 'Meus jogos',
      soon: 'Meus jogos chega em breve'
    },
    {
      key: 'favoritos',
      icon: 'fan',
      label: 'Favoritos',
      soon: 'A lista de favoritos chega em breve',
      meta: favorites.count ? String(favorites.count) : undefined
    },
    {
      key: 'avaliacoes',
      icon: 'star',
      label: 'Avaliações',
      soon: 'As avaliações chegam em breve',
      meta: pending.data?.length
        ? `${pending.data.length} ${pending.data.length === 1 ? 'pendente' : 'pendentes'}`
        : undefined
    },
    {
      key: 'preferencias',
      icon: 'sliders',
      label: 'Preferências',
      soon: 'As preferências chegam em breve'
    }
  ]
  // ponytail: Configurações é a seção 11; até lá a engrenagem só oferece "Sair".
  const settings = () =>
    Alert.alert(user?.name ?? 'Conta', user?.email, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await authClient.signOut()
          router.replace('/intro')
        }
      }
    ])

  return (
    <ExploreStateProvider>
      <View style={{ flex: 1 }}>
        <NativeTabs minimizeBehavior="never" tintColor={palette.ink}>
          <NativeTabs.Trigger name="explore">
            <NativeTabs.Trigger.Icon src={icons.map} renderingMode="original" />
            <NativeTabs.Trigger.Label>Explorar</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger
            name="ranking"
            disabled
            listeners={{
              tabPress: () => soon.show('O ranking chega em breve')
            }}
          >
            <NativeTabs.Trigger.Icon
              src={icons.ranking}
              renderingMode="original"
            />
            <NativeTabs.Trigger.Label>Ranking</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger
            name="voce"
            // Tocar de novo com o menu aberto fecha.
            listeners={{ tabPress: () => menuOpen && closeMenu() }}
          >
            <NativeTabs.Trigger.Icon src={icons.you} renderingMode="original" />
            <NativeTabs.Trigger.Label>Você</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger
            name="ia"
            role="search"
            disabled
            accessibilityLabel="Busca com IA"
            listeners={{
              tabPress: () => soon.show('A busca com IA chega em breve')
            }}
          >
            <NativeTabs.Trigger.Icon
              src={icons.sparkle}
              renderingMode="original"
            />
            <NativeTabs.Trigger.Label>IA</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
        {menuOpen ? (
          <YouMenu
            palette={palette}
            name={user?.name ?? ''}
            initials={initials(user?.name ?? '')}
            items={items}
            onClose={closeMenu}
            onItem={(item) => soon.show(item.soon)}
            onChat={() => soon.show('A conversa com a Onside chega em breve')}
            onSettings={settings}
          />
        ) : null}
        {soon.toast}
      </View>
    </ExploreStateProvider>
  )
}
