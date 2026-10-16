import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useState } from 'react'
import { Alert, View } from 'react-native'
import { usePalette } from '@/components/explore'
import { useSoon } from '@/components/soon'
import { type MenuItem, YouMenu } from '@/components/tab-bar'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

/*
 * As abas do torcedor ("02 Navbar glass"): Explorar, Ranking e Você, com a
 * busca com IA no círculo à direita. É a barra nativa do iOS 26
 * (UITabBarController, pelo `NativeTabs`): o vidro distorce o que passa por
 * baixo e o destaque da aba se arrasta de uma para outra, como no sistema.
 * Ranking e IA ainda não existem (avisam "em breve"); "Você" não troca de
 * tela, abre o menu de vidro (2c).
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

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

export default function FanTabs() {
  const router = useRouter()
  const palette = usePalette()
  const soon = useSoon()
  const session = authClient.useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const favorites = useQuery(trpc.pubs.getFavorites.queryOptions())
  const pending = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    retry: false,
    meta: { errorToast: false }
  })
  const icons = TAB_ICONS[palette.dark ? 'dark' : 'light']
  const user = session.data?.user

  const items: MenuItem[] = [
    { key: 'perfil', icon: 'you', label: 'Perfil' },
    { key: 'conquistas', icon: 'medal', label: 'Conquistas' },
    { key: 'reservas', icon: 'ticket', label: 'Minhas reservas' },
    {
      key: 'favoritos',
      icon: 'fan',
      label: 'Favoritos',
      meta: favorites.data?.length ? String(favorites.data.length) : undefined
    },
    {
      key: 'avaliacoes',
      icon: 'star',
      label: 'Avaliações',
      meta: pending.data?.length
        ? `${pending.data.length} ${pending.data.length === 1 ? 'pendente' : 'pendentes'}`
        : undefined
    },
    { key: 'preferencias', icon: 'sliders', label: 'Preferências' }
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
    <View style={{ flex: 1 }}>
      <NativeTabs minimizeBehavior="never" tintColor={palette.ink}>
        <NativeTabs.Trigger
          name="explore"
          listeners={{ tabPress: () => setMenuOpen(false) }}
        >
          <NativeTabs.Trigger.Icon src={icons.map} renderingMode="original" />
          <NativeTabs.Trigger.Label>Explorar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="ranking"
          disabled
          listeners={{ tabPress: () => soon.show('O ranking') }}
        >
          <NativeTabs.Trigger.Icon
            src={icons.ranking}
            renderingMode="original"
          />
          <NativeTabs.Trigger.Label>Ranking</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="voce"
          disabled
          listeners={{ tabPress: () => setMenuOpen((open) => !open) }}
        >
          <NativeTabs.Trigger.Icon src={icons.you} renderingMode="original" />
          <NativeTabs.Trigger.Label>Você</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="ia"
          role="search"
          disabled
          accessibilityLabel="Busca com IA"
          listeners={{ tabPress: () => soon.show('A busca com IA') }}
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
          initials={initialsOf(user?.name ?? '')}
          items={items}
          onClose={() => setMenuOpen(false)}
          onItem={(item) => soon.show(item.label)}
          onChat={() => soon.show('A conversa com a Onside')}
          onSettings={settings}
        />
      ) : null}
      {soon.toast}
    </View>
  )
}
