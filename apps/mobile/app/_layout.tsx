import '@/global.css'
// Ouve os links desde a abertura (ver `lib/latest-url.ts`).
import '@/lib/latest-url'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DevTab } from '@/components/dev-tab'
import { ExploreStateProvider } from '@/components/explore-state'
import { Splash, SplashDone } from '@/components/splash'
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
  const ready = fontsLoaded && agenda !== undefined
  const [splashDone, setSplashDone] = useState(false)
  const endSplash = useCallback(() => setSplashDone(true), [])

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SplashDone value={splashDone}>
          <ExploreStateProvider>
            <Stack screenOptions={{ headerShown: false }}>
              {/* "Vou assistir aqui" (3d): folha nativa do iOS, quase alta. Fundo
                transparente: é o que deixa o iOS 26 desenhar o vidro dela. */}
              <Stack.Screen
                name="vou/[barId]"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.88],
                  sheetGrabberVisible: true,
                  contentStyle: { backgroundColor: 'transparent' }
                }}
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
              {/* A medalha (2j, 2k), no escuro como a estante. */}
              <Stack.Screen
                name="conquista/[id]"
                options={{ presentation: 'fullScreenModal' }}
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
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 34,
                  contentStyle: { backgroundColor: 'transparent' }
                }}
              />
              {/* Busca (19a, 19b): tela cheia, sobe sem a barra de abas. */}
              <Stack.Screen
                name="busca"
                options={{ presentation: 'fullScreenModal', animation: 'fade' }}
              />
              {/* Avisos (19c): aberto pelo sino do Explorar, com voltar. */}
              <Stack.Screen name="avisos" />
              {/* Configurações (11f–11i): com voltar, sem a barra de abas.
                Cidade e senha empilham por cima. */}
              <Stack.Screen name="configuracoes" />
              <Stack.Screen name="cidade" />
              <Stack.Screen name="senha" />
              <Stack.Screen name="duas-etapas" />
              {/* Amigos (S1): busca em tela cheia como a do mapa; código,
                contatos e o perfil de amigo empilham com voltar. */}
              <Stack.Screen name="amigos" />
              <Stack.Screen
                name="amigos-busca"
                options={{ presentation: 'fullScreenModal', animation: 'fade' }}
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
        <DevTab />
        {splashDone ? null : (
          <Splash agenda={agenda ?? undefined} onDone={endSplash} />
        )}
      </GestureHandlerRootView>
    </QueryClientProvider>
  )
}
