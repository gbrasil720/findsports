import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import { adoptSessionCookie, authClient } from '@/lib/auth-client'
import { latestURL } from '@/lib/latest-url'
import { rawParam } from '@/lib/raw-param'
import { queryClient } from '@/lib/trpc'

/*
 * Destino do link de confirmação de e-mail. O servidor confirma, entra e
 * redireciona para cá com a sessão em `?cookie=…`; sem ela (link vencido ou
 * já usado, `?error=…`), o login pede outro link.
 */

export default function Verified() {
  const router = useRouter()
  useEffect(() => {
    latestURL().then(async (url) => {
      const cookie = url ? rawParam(url, 'cookie') : undefined
      if (!cookie) {
        router.replace({ pathname: '/sign-in', params: { notice: 'expired' } })
        return
      }
      await adoptSessionCookie(cookie)
      // Busca a sessão antes de sair daqui, para a tela inicial já a ver.
      await authClient.getSession()
      await queryClient.invalidateQueries()
      router.replace('/')
    })
  }, [router])

  return <View style={{ flex: 1, backgroundColor: '#f1eee6' }} />
}
