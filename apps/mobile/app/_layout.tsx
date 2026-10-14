import '@/global.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
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
    'GeistMono-SemiBold': require('../assets/fonts/GeistMono-SemiBold.ttf')
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
          <Stack screenOptions={{ headerShown: false }} />
        </SplashDone>
        {splashDone ? null : (
          <Splash agenda={agenda ?? undefined} onDone={endSplash} />
        )}
      </GestureHandlerRootView>
    </QueryClientProvider>
  )
}
