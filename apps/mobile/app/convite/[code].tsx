import { useMutation } from '@tanstack/react-query'
import {
  type Href,
  Redirect,
  useLocalSearchParams,
  useRouter
} from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { authClient } from '@/lib/auth-client'
import { savePendingInvite } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

/**
 * O link de convite de amigo (`/convite/<código>`, aberto pela página do web
 * ou pelo QR). Com a conta pronta, aceita e abre o perfil de quem convidou;
 * sem conta, ou no meio do onboarding, guarda o código para depois.
 */
export default function Invite() {
  const router = useRouter()
  const palette = usePalette()
  const { code } = useLocalSearchParams<{ code: string }>()
  const session = authClient.useSession()
  const user = session.data?.user
  const ready = user?.role === 'fan' && user.onboardingCompleted
  const join = useMutation(trpc.friends.joinByInvite.mutationOptions())

  // biome-ignore lint/correctness/useExhaustiveDependencies: uma vez, com a sessão resolvida
  useEffect(() => {
    if (session.isPending || !code) return
    if (!ready) {
      savePendingInvite(code)
      return
    }
    join.mutate(
      { code },
      {
        onSuccess: ({ inviterId }) => {
          haptic.success()
          router.replace(`/amigo/${inviterId}?via=link` as Href)
        },
        onError: () => router.replace('/amigos')
      }
    )
  }, [session.isPending, ready, code])

  if (!session.isPending && !ready) return <Redirect href="/" />
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.bg
      }}
    >
      <ActivityIndicator color={palette.ink} />
    </View>
  )
}
