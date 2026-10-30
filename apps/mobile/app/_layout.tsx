import '@/global.css'
// Ouve os links desde a abertura (ver `lib/latest-url.ts`).
import '@/lib/latest-url'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack, usePathname } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DevTab } from '@/components/dev-tab'
import { ExploreStateProvider } from '@/components/explore-state'
import {
  useLayout,
  usePortraitLock,
  useWindowBackground
} from '@/components/layout'
import { MaintenanceGate } from '@/components/maintenance'
import { OfflineBanner } from '@/components/offline-banner'
import { Splash, SplashDone } from '@/components/splash'
import { PaletteProvider } from '@/components/theme'
import { useAccountSheet } from '@/components/ui'
import { queryClient, trpc } from '@/lib/trpc'

// A splash nativa (cor chapada, `app.json`) fica até as fontes da marca
// carregarem; aí a splash animada assume, já com a tipografia certa.
SplashScreen.preventAutoHideAsync()

/** Quanto a abertura espera pelos jogos de hoje antes de seguir com a agenda de exemplo. */
const AGENDA_WAIT_MS = 600

const kickoff = (startsAt: string) =>
  new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })

/**
 * Os jogos de hoje para as faixas da splash, como `pubs.todayGames` os dá.
 * `undefined` enquanto espera; `null` se não há jogo hoje ou a API não
 * respondeu a tempo (a splash usa então o exemplo, sem contagem).
 */
function useTodayAgenda() {
  const [agenda, setAgenda] = useState<string[] | null>()
  useEffect(() => {
    let settled = false
    const settle = (value: string[] | null) => {
      if (settled) return
      settled = true
      setAgenda(value)
    }
    const timer = setTimeout(() => settle(null), AGENDA_WAIT_MS)
    queryClient.fetchQuery(trpc.pubs.todayGames.queryOptions()).then(
      (games) =>
        settle(
          games.length > 0
            ? games.map(
                (game) =>
                  `${game.title.toLocaleUpperCase('pt-BR')} ${kickoff(game.startsAt)}`
              )
            : null
        ),
      () => settle(null)
    )
    return () => clearTimeout(timer)
  }, [])
  return agenda
}

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Anton: require('../assets/fonts/Anton-Regular.ttf'),
    'Archivo-Regular': require('../assets/fonts/Archivo-Regular.ttf'),
    'Archivo-SemiBold': require('../assets/fonts/Archivo-SemiBold.ttf'),
    'Archivo-Bold': require('../assets/fonts/Archivo-Bold.ttf'),
    'GeistMono-SemiBold': require('../assets/fonts/GeistMono-SemiBold.ttf'),
    'GeistMono-Bold': require('../assets/fonts/GeistMono-Bold.ttf')
  })
  const agenda = useTodayAgenda()
  usePortraitLock()
  useWindowBackground()
  // A busca com IA é folha no celular e tela cheia fora dele (WEB-488): no
  // iPad a folha viraria um cartão no meio da tela.
  // A apresentação não pode mudar com a tela aberta (dobrar o Fold com a busca
  // aberta derrubava o app no Android: "Sheet delegate accepts screen with
  // initialized sheet behaviour only"): só troca quando nenhuma das duas está
  // na tela.
  const { kind, nav } = useLayout()
  const pathname = usePathname()
  const open = pathname.startsWith('/busca-ia') || pathname.startsWith('/vou/')
  const [phone, setPhone] = useState(kind === 'phone')
  if (!open && phone !== (kind === 'phone')) setPhone(kind === 'phone')
  const aiSheet = phone
  // Telas curtas da conta abrem como folha no meio da tela fora do celular
  // (regra 06 da a08, WEB-491); no celular, empilhadas como sempre.
  // O `Screen` desenha a folha (centrada, ou na metade do dobrável aberto).
  const accountSheet = useAccountSheet()
    ? { presentation: 'transparentModal' as const, animation: 'fade' as const }
    : undefined
  const ready = fontsLoaded && agenda !== undefined
  const [splashDone, setSplashDone] = useState(false)
  const endSplash = useCallback(() => setSplashDone(true), [])

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <QueryClientProvider client={queryClient}>
      <PaletteProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SplashDone value={splashDone}>
            <ExploreStateProvider>
              <Stack screenOptions={{ headerShown: false }}>
                {/* "Vou assistir aqui" (3d): folha nativa do iOS, quase alta. Fundo
                transparente: é o que deixa o iOS 26 desenhar o vidro dela. */}
                <Stack.Screen
                  name="vou/[barId]"
                  options={
                    // No iPad a folha de detent vira um cartão pequeno no
                    // meio da tela: lá ela é a folha de página, alta.
                    phone || Platform.OS !== 'ios'
                      ? {
                          presentation: 'formSheet',
                          sheetAllowedDetents: [0.88],
                          sheetGrabberVisible: true,
                          contentStyle: { backgroundColor: 'transparent' }
                        }
                      : {
                          presentation: 'pageSheet',
                          contentStyle: { backgroundColor: 'transparent' }
                        }
                  }
                />
                {/* O código no balcão cobre tudo, no escuro (3f). */}
                <Stack.Screen
                  name="codigo/[eventId]"
                  options={{ presentation: 'fullScreenModal' }}
                />
                <Stack.Screen
                  name="pos-jogo/[eventId]"
                  options={{ presentation: 'fullScreenModal' }}
                />
                {/* A foto do bar em tela cheia (25b), no preto. */}
                <Stack.Screen
                  name="foto/[barId]"
                  options={{
                    presentation: 'fullScreenModal',
                    contentStyle: { backgroundColor: '#0b0b09' }
                  }}
                />
                {/* A medalha (2j, 2k), no escuro como a estante. No tablet,
                    o desbloqueio é um cartão sobre a estante (A06). */}
                <Stack.Screen
                  name="conquista/[id]"
                  options={{
                    // O mesmo `medalCard` de components/medal-detail, que
                    // não entra aqui: a medalha puxa o expo-asset antes de o
                    // app subir ("Cannot find native module 'ExpoAsset'").
                    presentation:
                      (Platform.OS === 'ios' && Platform.isPad) ||
                      nav === 'rail'
                        ? 'transparentModal'
                        : 'fullScreenModal'
                  }}
                />
                {/* Todos os filtros (19d): folha alta sobre o Explorar. */}
                <Stack.Screen
                  name="filtros"
                  options={{
                    presentation: 'formSheet',
                    sheetAllowedDetents: [0.9],
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 30
                  }}
                />
                {/* Busca com IA (2h): folha alta sobre o mapa, aberta pela aba IA. */}
                <Stack.Screen
                  name="busca-ia"
                  options={
                    aiSheet
                      ? {
                          presentation: 'formSheet',
                          sheetAllowedDetents: [1],
                          sheetGrabberVisible: true,
                          sheetCornerRadius: 34,
                          contentStyle: { backgroundColor: 'transparent' }
                        }
                      : { presentation: 'fullScreenModal' }
                  }
                />
                {/* Busca (19a, 19b): tela cheia, sobe sem a barra de abas. */}
                <Stack.Screen
                  name="busca"
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'fade'
                  }}
                />
                {/* Avisos (19c): aberto pelo sino do Explorar, com voltar. */}
                <Stack.Screen name="avisos" />
                {/* Configurações (11f–11i): com voltar, sem a barra de abas.
                Cidade e senha empilham por cima. */}
                <Stack.Screen name="configuracoes" />
                <Stack.Screen name="cidade" options={accountSheet} />
                <Stack.Screen name="senha" options={accountSheet} />
                <Stack.Screen name="duas-etapas" options={accountSheet} />
                {/* Amigos (S1): busca em tela cheia como a do mapa; código,
                contatos e o perfil de amigo empilham com voltar. */}
                <Stack.Screen name="amigos" />
                <Stack.Screen
                  name="amigos-busca"
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'fade'
                  }}
                />
                <Stack.Screen name="meu-codigo" />
                <Stack.Screen name="contatos" />
                <Stack.Screen name="amigo/[id]" />
                <Stack.Screen
                  name="convite/[code]"
                  options={{ animation: 'fade' }}
                />
                {/* Bares pra você (23a–23k): tela cheia, aberta pelo menu Você;
                "Por que esse bar?" (22c) é a folha por cima dela. */}
                <Stack.Screen
                  name="bares-pra-voce"
                  options={{ presentation: 'fullScreenModal' }}
                />
                <Stack.Screen
                  name="por-que"
                  options={{
                    presentation: 'formSheet',
                    sheetAllowedDetents: [0.83],
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 30,
                    contentStyle: { backgroundColor: 'transparent' }
                  }}
                />
                {/* Atalhos do mapa (19e): tela cheia, aberta pelo "Editar". */}
                <Stack.Screen
                  name="atalhos"
                  options={{ presentation: 'fullScreenModal' }}
                />
              </Stack>
            </ExploreStateProvider>
          </SplashDone>
          {/* A manutenção (26d, 26e) cobre as telas; o código de hoje, em tela
          cheia nativa, abre por cima dela. */}
          <MaintenanceGate />
          <OfflineBanner />
          <DevTab />
          {splashDone ? null : (
            <Splash agenda={agenda ?? undefined} onDone={endSplash} />
          )}
        </GestureHandlerRootView>
      </PaletteProvider>
    </QueryClientProvider>
  )
}
