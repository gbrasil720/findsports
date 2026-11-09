import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import { BG } from '@/components/ui'
import { adoptSessionCookie, authClient } from '@/lib/auth-client'
import { latestURL } from '@/lib/latest-url'
import { finishPending } from '@/lib/pending-action'
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
      const session = await authClient.getSession()
      await queryClient.invalidateQueries()
      // A ação que pediu a conta (rodada 2): sai feita, e a pessoa volta ao
      // bar dela, sem o onboarding na frente (a ação primeiro).
      const acao = session.data?.user
        ? await finishPending(session.data.user)
        : null
      if (acao && 'barId' in acao) {
        router.replace('/explore')
        router.push({ pathname: '/bar/[id]', params: { id: acao.barId } })
        return
      }
      router.replace('/')
    })
  }, [router])

  return <View style={{ flex: 1, backgroundColor: BG }} />
}
