import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import { adoptSessionCookie } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * Destino do link de confirmação de e-mail. O servidor confirma, entra e
 * redireciona para cá com a sessão em `?cookie=…`; sem ela (link vencido ou
 * já usado, `?error=…`), o login pede outro link.
 */
export default function Verified() {
  const router = useRouter()
  const { cookie } = useLocalSearchParams<{ cookie?: string }>()

  useEffect(() => {
    if (!cookie) {
      router.replace({ pathname: '/sign-in', params: { notice: 'expired' } })
      return
    }
    adoptSessionCookie(cookie)
      .then(() => queryClient.invalidateQueries())
      .then(() => router.replace('/'))
  }, [cookie, router])

  return <View style={{ flex: 1, backgroundColor: '#f1eee6' }} />
}
