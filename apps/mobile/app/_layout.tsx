import '@/global.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Splash } from '@/components/splash'
import { queryClient } from '@/lib/trpc'

// A splash nativa (cor chapada, `app.json`) fica até as fontes da marca
// carregarem; aí a splash animada assume, já com a tipografia certa.
SplashScreen.preventAutoHideAsync()

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Anton: require('../assets/fonts/Anton-Regular.ttf'),
    'GeistMono-SemiBold': require('../assets/fonts/GeistMono-SemiBold.ttf')
  })
  const [splashDone, setSplashDone] = useState(false)
  const endSplash = useCallback(() => setSplashDone(true), [])

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        {splashDone ? null : <Splash onDone={endSplash} />}
      </GestureHandlerRootView>
    </QueryClientProvider>
  )
}
