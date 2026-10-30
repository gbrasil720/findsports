import { useQuery } from '@tanstack/react-query'
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useNewAchievement } from '@/components/achievement-watcher'
import { AiCoach, useCoachPending } from '@/components/ai-coach'
import { initials } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { usePendingInvite } from '@/components/friends'
import { useLayout } from '@/components/layout'
import { SideNav } from '@/components/side-nav'
import { useSoon } from '@/components/soon'
import { type MenuItem, YouMenu } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import { authClient } from '@/lib/auth-client'
import { freshCount } from '@/lib/suggestions'
import { trpc } from '@/lib/trpc'

/*
 * As abas do torcedor ("02 Navbar glass"): Explorar, Bares (Seus bares) e Você, com a
 * busca com IA no círculo à direita. O design põe o Ranking no lugar dos
 * Favoritos; o dono trocou (16/10/2026), e o Ranking foi para o menu. É a barra nativa do iOS 26
 * (UITabBarController, pelo `NativeTabs`): o vidro distorce o que passa por
 * baixo e o destaque da aba se arrasta de uma para outra, como no sistema.
 * A IA abre a busca com IA (2h) numa folha; "Você" mostra o
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
  '/voce/meus-jogos': 'jogos',
  '/voce/ranking': 'ranking'
}

// O estado do Explorar (`ExploreStateProvider`) mora em `app/_layout.tsx`:
// a folha de filtros (19d) fica fora das abas e mexe nele também.
export default function FanTabs() {
  const router = useRouter()
  const palette = usePalette()
  const soon = useSoon()
  const session = authClient.useSession()
  useNewAchievement()
  usePendingInvite()
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
  // Primeiro acesso (4o): o coach da busca com IA, uma vez, sobre o Explorar.
  // `?coach=1` mostra de novo (navegador DEV).
  const { coach: forceCoach } = useGlobalSearchParams<{ coach?: string }>()
  const coach = useCoachPending(forceCoach === '1')
  const pending = useQuery({
    ...trpc.postGame.pending.queryOptions(),
    retry: false
  })
  // "Bares pra você · N novos" (2c): a rodada de hoje, criada aqui mesmo se
  // ainda não existe e o aparelho sabe onde está.
  const { device } = useExploreState()
  const suggestions = useQuery({
    ...trpc.recommendations.today.queryOptions({ where: device }),
    enabled: menuOpen,
    retry: false
  })
  const fresh = suggestions.data?.round ? freshCount(suggestions.data.round) : 0
  const icons = TAB_ICONS[palette.dark ? 'dark' : 'light']
  const user = session.data?.user
  const layout = useLayout()
  // O mesmo toque da aba "Você" na barra nativa.
  const pressYou = () => {
    if (menuOpen) closeMenu()
    else if (pathname.startsWith('/voce/')) setOver(true)
    else router.navigate('/voce')
  }

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
      key: 'sugestoes',
      icon: 'sparkle',
      label: 'Bares pra você',
      soon: 'As sugestões chegam em breve',
      badge: fresh ? `${fresh} ${fresh === 1 ? 'novo' : 'novos'}` : undefined,
      // Por cima, sem a barra, como no design (23a).
      open: () => {
        closeMenu()
        router.push('/bares-pra-voce')
      }
    },
    {
      key: 'amigos',
      icon: 'people',
      label: 'Amigos',
      soon: 'Os amigos chegam em breve',
      // No design, Amigos abre pelo botão do Ranking (11e); até ele existir,
      // fica no menu. Por cima, sem a barra, como as Configurações.
      open: () => {
        closeMenu()
        router.push('/amigos')
      }
    },
    {
      key: 'ranking',
      icon: 'ranking',
      label: 'Ranking',
      soon: 'O ranking chega em breve',
      open: () => router.navigate('/voce/ranking')
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
      soon: 'As preferências chegam em breve',
      open: () => {
        closeMenu()
        router.push('/configuracoes')
      }
    }
  ]
  // As Configurações (11f–11i) abrem por cima, sem a barra.
  const settings = () => {
    closeMenu()
    router.push({ pathname: '/configuracoes', params: { aba: 'conta' } })
  }

  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        // Fora do celular a navegação é a do aparelho (`SideNav`); a barra
        // nativa só se esconde, para as abas não remontarem ao abrir o dobrável.
        hidden={layout.nav !== 'tabs'}
        minimizeBehavior="never"
        tintColor={palette.ink}
        // No aparelho, uma renderização do JS feita antes do toque chegava
        // ao nativo depois dele e devolvia a seleção à aba anterior: a lente
        // ia ao "Você", voltava e ia de novo. Recusa o pedido antigo.
        unstable_nativeProps={{ rejectStaleNavStateUpdates: true }}
      >
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Icon src={icons.map} renderingMode="original" />
          <NativeTabs.Trigger.Label hidden>Explorar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {/* Sem o recuo automático: a aba somava o topo seguro ao
            `paddingTop` da tela, e o título descia 48 pt. */}
        <NativeTabs.Trigger name="favoritos" disableAutomaticContentInsets>
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
          // A busca com IA (2h) é uma folha por cima da aba atual.
          listeners={{ tabPress: () => router.push('/busca-ia') }}
        >
          <NativeTabs.Trigger.Icon
            src={icons.sparkle}
            renderingMode="original"
          />
          <NativeTabs.Trigger.Label>IA</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {layout.nav !== 'tabs' && layout.nav !== 'none' ? (
        <SideNav
          kind={layout.nav}
          current={
            menuOpen || pathname.startsWith('/voce')
              ? 'voce'
              : pathname === '/favoritos'
                ? 'favoritos'
                : 'explore'
          }
          onTab={(tab) =>
            tab === 'voce' ? pressYou() : router.navigate(`/${tab}`)
          }
          onAi={() => router.push('/busca-ia')}
          onShortcut={(to) =>
            to === 'avisos'
              ? router.push('/avisos')
              : router.navigate(
                  to === 'jogos' ? '/voce/meus-jogos' : `/voce/${to}`
                )
          }
          initials={initials(user?.name ?? '')}
          left={
            // No Explorar a barra flutua sobre o mapa (04b); nas outras
            // abas, centrada na tela (design T3 e T4).
            pathname === '/explore' &&
            layout.kind === 'split' &&
            layout.nav === 'float'
              ? layout.split + layout.gap
              : 0
          }
        />
      ) : null}
      {menuOpen ? (
        <YouMenu
          name={user?.name ?? ''}
          initials={initials(user?.name ?? '')}
          image={user?.image}
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
      {/* Na tela de fora do Flip não há botão da IA para apontar. */}
      {coach.pending &&
      pathname === '/explore' &&
      !menuOpen &&
      layout.nav !== 'none' ? (
        <AiCoach
          onClose={coach.done}
          onOpen={() => {
            coach.done()
            router.push('/busca-ia')
          }}
        />
      ) : null}
      {soon.toast}
    </View>
  )
}
