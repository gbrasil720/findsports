import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useRef, useState } from 'react'
import { Alert, View } from 'react-native'
import { useNewAchievement } from '@/components/achievement-watcher'
import { initials, usePalette } from '@/components/explore'
import { useSoon } from '@/components/soon'
import { type MenuItem, YouMenu } from '@/components/tab-bar'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

/*
 * As abas do torcedor ("02 Navbar glass"): Explorar, Bares (Seus bares) e Você, com a
 * busca com IA no círculo à direita. O design põe o Ranking no lugar dos
 * Favoritos; o dono trocou (16/10/2026), e o Ranking foi para o menu. É a barra nativa do iOS 26
 * (UITabBarController, pelo `NativeTabs`): o vidro distorce o que passa por
 * baixo e o destaque da aba se arrasta de uma para outra, como no sistema.
 * A IA ainda não existe (avisa "em breve"); "Você" mostra o
 * mesmo Explorar com o menu de vidro (2c) por cima.
 */

// Fora da aba, só o ícone; selecionada, o ícone com o nome ao lado (e as
// setinhas no Você), como no design. A barra do sistema só põe o nome
// embaixo, então o nome vai dentro da imagem e o rótulo nativo fica oculto.
// O nome sai em 12,5 (o design usa 14): a lente de vidro da seleção desenha
// por dentro a versão selecionada de todas as abas, e uma imagem mais larga
// que a aba aparece na lente da vizinha: cada imagem cabe em ~72 pt ("Seus
// bares" não coube; a aba de Seus bares se chama "Bares").
const TAB_ICONS = {
  light: {
    map: {
      default: require('../../assets/images/tabs/map-light.png'),
      selected: require('../../assets/images/tabs/map-light-on.png')
    },
    fan: {
      default: require('../../assets/images/tabs/fan-light.png'),
      selected: require('../../assets/images/tabs/fan-light-on.png')
    },
    you: {
      default: require('../../assets/images/tabs/you-light.png'),
      selected: require('../../assets/images/tabs/you-light-on.png')
    },
    sparkle: require('../../assets/images/tabs/sparkle-light.png')
  },
  dark: {
    map: {
      default: require('../../assets/images/tabs/map-dark.png'),
      selected: require('../../assets/images/tabs/map-dark-on.png')
    },
    fan: {
      default: require('../../assets/images/tabs/fan-dark.png'),
      selected: require('../../assets/images/tabs/fan-dark-on.png')
    },
    you: {
      default: require('../../assets/images/tabs/you-dark.png'),
      selected: require('../../assets/images/tabs/you-dark-on.png')
    },
    sparkle: require('../../assets/images/tabs/sparkle-dark.png')
  }
}

/** A tela da pilha "Você" e o item do menu que a abre. */
const MENU_SCREENS: Record<string, string> = {
  '/voce/perfil': 'perfil',
  '/voce/conquistas': 'conquistas',
  '/voce/meus-jogos': 'jogos'
}

// O estado do Explorar (`ExploreStateProvider`) mora em `app/_layout.tsx`:
// a folha de filtros (19d) fica fora das abas e mexe nele também.
export default function FanTabs() {
  const router = useRouter()
  const palette = usePalette()
  const soon = useSoon()
  const session = authClient.useSession()
  useNewAchievement()
  // "Você" é uma aba de verdade (a barra a mantém marcada) que mostra o
  // mesmo Explorar com o menu por cima; fechar o menu volta para Explorar.
  // Numa tela da pilha da aba (Conquistas, Meus jogos), tocar em "Você" abre
  // o menu por cima dela (`over`), e fechar deixa a pessoa onde estava.
  const pathname = usePathname()
  const [over, setOver] = useState(false)
  // A última aba fora do "Você": fechar o menu volta para ela.
  const from = useRef<'/explore' | '/favoritos'>('/explore')
  useEffect(() => {
    if (pathname === '/explore' || pathname === '/favoritos')
      from.current = pathname
  }, [pathname])
  // Trocar de tela ou de aba fecha o menu aberto por cima.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage à rota
  useEffect(() => setOver(false), [pathname])
  const menuOpen = pathname === '/voce' || over
  const closeMenu = () =>
    over ? setOver(false) : router.navigate(from.current)
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
      soon: 'O perfil chega em breve',
      open: () => router.navigate('/voce/perfil')
    },
    {
      key: 'conquistas',
      icon: 'medal',
      label: 'Conquistas',
      soon: 'As conquistas chegam em breve',
      open: () => router.navigate('/voce/conquistas')
    },
    {
      key: 'jogos',
      icon: 'ticket',
      label: 'Meus jogos',
      soon: 'Meus jogos chega em breve',
      // Na pilha da própria aba: a barra fica e o menu some sozinho.
      open: () => router.navigate('/voce/meus-jogos')
    },
    {
      key: 'ranking',
      icon: 'ranking',
      label: 'Ranking',
      soon: 'O ranking chega em breve'
    },
    {
      key: 'avaliacoes',
      icon: 'star',
      label: 'Avaliações',
      soon: 'As avaliações chegam em breve',
      // ponytail: sem a lista de avaliações (10), o item abre a mais recente.
      open: pending.data?.[0]
        ? () => {
            closeMenu()
            router.push(`/pos-jogo/${pending.data[0]?.eventId}`)
          }
        : undefined,
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
    <View style={{ flex: 1 }}>
      <NativeTabs minimizeBehavior="never" tintColor={palette.ink}>
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Icon src={icons.map} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Explorar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="favoritos">
          <NativeTabs.Trigger.Icon src={icons.fan} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Bares</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="voce"
          // A troca vem do nativo, sem esperar o JS (a foto sob o menu já
          // está pronta). Tocar de novo com o menu aberto fecha. Numa tela
          // da pilha da aba, o menu abre por cima dela: o sistema voltaria
          // ao começo da pilha (`disablePopToTop` impede). Vindo de outra
          // aba, a pilha já voltou ao menu (`voce/_layout.tsx`).
          disablePopToTop
          listeners={{
            tabPress: () => {
              if (menuOpen) closeMenu()
              else if (pathname.startsWith('/voce/')) setOver(true)
            }
          }}
        >
          <NativeTabs.Trigger.Icon src={icons.you} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Você</NativeTabs.Trigger.Label>
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
          // Destaca a tela de baixo; sobre o Explorar, nenhum item, para não
          // sugerir um toque.
          current={MENU_SCREENS[pathname]}
          onClose={closeMenu}
          onItem={(item) => {
            if (!item.open) return soon.show(item.soon)
            setOver(false)
            item.open()
          }}
          onChat={() => soon.show('A conversa com a Onside chega em breve')}
          onSettings={settings}
        />
      ) : null}
      {soon.toast}
    </View>
  )
}
