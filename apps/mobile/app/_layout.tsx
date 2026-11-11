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
import { ActionDone } from '@/components/action-done'
import { DevTab } from '@/components/dev-tab'
import { ExploreStateProvider } from '@/components/explore-state'
import {
  useLayout,
  usePortraitLock,
  useWindowBackground
} from '@/components/layout'
import { MaintenanceGate } from '@/components/maintenance'
import { OfflineBanner } from '@/components/offline-banner'
import { Splash, SplashDone, type TodayGames } from '@/components/splash'
import { PaletteProvider } from '@/components/theme'
import { useAccountSheet } from '@/components/ui'
import { queryClient, trpc } from '@/lib/trpc'

// A splash nativa (a marca sobre a tinta, `app.json`) fica até as fontes
// carregarem e os jogos de hoje chegarem; aí a animada assume, com a marca
// no mesmo lugar.
SplashScreen.preventAutoHideAsync()

/** Quanto a abertura espera pelos jogos de hoje antes de seguir sem eles. */
const AGENDA_WAIT_MS = 600

/**
 * Quantos jogos há hoje e quantos estão ao vivo, para a splash, pelo
 * `pubs.todayGames`. `undefined` enquanto espera; `null` se não há jogo hoje
 * ou a API não respondeu a tempo (a splash diz então "O jogo é aqui").
 */
function useTodayGames() {
  const [today, setToday] = useState<TodayGames | null>()
  useEffect(() => {
    let settled = false
    const settle = (value: TodayGames | null) => {
      if (settled) return
      settled = true
      setToday(value)
    }
    const timer = setTimeout(() => settle(null), AGENDA_WAIT_MS)
    queryClient.fetchQuery(trpc.pubs.todayGames.queryOptions()).then(
      (games) =>
        settle(
          games.length > 0
            ? {
                games: games.length,
                live: games.filter((game) => game.live).length
              }
            : null
        ),
      () => settle(null)
    )
    return () => clearTimeout(timer)
  }, [])
  return today
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
  const today = useTodayGames()
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
  const ready = fontsLoaded && today !== undefined
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
                {/* "O jogo de hoje" troca para o Explorar sem volta: é troca,
                não avanço, então fade em vez de deslizar (rodada 1). */}
                <Stack.Screen name="hoje" options={{ animation: 'fade' }} />
                {/* A folha de entrar (rodada 2, tela 1): por cima de onde a
                pessoa estava, que fica visível e apagada atrás. */}
                <Stack.Screen
                  name="gostos"
                  options={{ presentation: 'modal' }}
                />
                <Stack.Screen
                  name="entrar"
                  options={{
                    presentation: 'formSheet',
                    // Paradas fixas: `fitToContents` subia a folha inteira com
                    // o teclado, por cima da barra de status.
                    sheetAllowedDetents: [0.86, 1],
                    sheetGrabberVisible: true
                  }}
                />
                <Stack.Screen name="(fan)" options={{ animation: 'fade' }} />
                {/* O app do dono do bar (rodada 10); validar o código abre
                    por cima de qualquer tela, como a câmera do sistema. */}
                <Stack.Screen name="(bar)" options={{ animation: 'fade' }} />
                <Stack.Screen
                  name="validar-codigo"
                  options={{ presentation: 'fullScreenModal' }}
                />
                <Stack.Screen name="quem-vai" />
                <Stack.Screen name="comanda" />
                <Stack.Screen name="desempenho" />
                <Stack.Screen name="meu-espaco" />
                <Stack.Screen name="fotos-do-bar" />
                <Stack.Screen name="plano" />
                <Stack.Screen name="configuracoes-bar" />
                <Stack.Screen
                  name="cadastro-bar"
                  options={{ gestureEnabled: false }}
                />
                <Stack.Screen
                  name="jogo-no-ar"
                  options={{ gestureEnabled: false }}
                />
                <Stack.Screen name="completar-perfil" />
                <Stack.Screen name="rotina" />
                <Stack.Screen name="plano-do-teste" />
                <Stack.Screen
                  name="perfil-completo"
                  options={{ gestureEnabled: false }}
                />
                <Stack.Screen
                  name="novo-jogo"
                  options={{ presentation: 'modal' }}
                />
                {/* "Vou assistir aqui" (3d): folha nativa do iOS, quase alta. Fundo
                transparente: é o que deixa o iOS 26 desenhar o vidro dela. */}
                <Stack.Screen
                  name="vou/[barId]"
                  options={
                    // No iPad a folha de detent vira um cartão pequeno no
                    // meio da tela: lá ela é a folha de página, alta.
                    phone || Platform.OS !== 'ios'
                      ? {
                          // Folha sólida do sistema (rodada 3): paradas
                          // [.75, 1], sem o vidro.
                          presentation: 'formSheet',
                          sheetAllowedDetents: [0.75, 1],
                          sheetGrabberVisible: true
                        }
                      : { presentation: 'pageSheet' }
                  }
                />
                {/* O código no balcão cobre tudo, no escuro (3f). */}
                <Stack.Screen
                  name="codigo/[eventId]"
                  // O ingresso é outro lugar, de tela cheia: abre por fade.
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'fade'
                  }}
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
                {/* Subiu de nível (rodada 6): o momento raro, tela cheia. */}
                <Stack.Screen
                  name="nivel"
                  options={{ presentation: 'fullScreenModal' }}
                />
                {/* Todos os filtros (19d): folha alta sobre o Explorar. */}
                <Stack.Screen
                  name="filtros"
                  options={{
                    presentation: 'formSheet',
                    // O topo a 58 pt da tela, como no desenho (rodada 5).
                    sheetAllowedDetents: [0.93],
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
                <Stack.Screen name="aparelhos" options={accountSheet} />
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
                    sheetAllowedDetents: [0.62, 1],
                    sheetGrabberVisible: true
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
          {/* O que a folha de entrar fez (rodada 2, tela 3), sobre qualquer tela. */}
          <ActionDone />
          <DevTab />
          {splashDone ? null : (
            <Splash today={today ?? undefined} onDone={endSplash} />
          )}
        </GestureHandlerRootView>
      </PaletteProvider>
    </QueryClientProvider>
  )
}
