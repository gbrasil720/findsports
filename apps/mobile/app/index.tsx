import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

// Tela de partida do app: prova que as duas pontas estão ligadas — a API
// (tRPC, pelo web) e a sessão (better-auth). As telas de verdade entram no
// lugar desta.
export default function Home() {
  const insets = useSafeAreaInsets()
  const session = authClient.useSession()
  const api = useQuery(trpc.appConfig.getPublic.queryOptions())

  const apiStatus = api.isPending
    ? 'Conectando à API…'
    : api.isError
      ? 'Sem conexão com a API'
      : 'API conectada'

  return (
    <View
      className="flex-1 bg-ink px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
    >
      <Text className="font-bold text-5xl text-paper">
        ONSIDE<Text className="text-live-on-ink">.</Text>
      </Text>
      <Text className="mt-3 text-lg text-muted-on-ink">
        Onde vai passar o jogo?
      </Text>

      <View className="mt-10 gap-2">
        <Text className={api.isError ? 'text-live-on-ink' : 'text-acid'}>
          {apiStatus}
        </Text>
        <Text className="text-paper">
          {session.data
            ? `Sessão de ${session.data.user.name}`
            : 'Você não entrou'}
        </Text>
      </View>

      <View className="mt-auto">
        {session.data ? (
          <Pressable
            accessibilityRole="button"
            className="items-center border-2 border-paper px-5 py-4"
            onPress={() => authClient.signOut()}
          >
            <Text className="font-bold text-paper">Sair</Text>
          </Pressable>
        ) : (
          <Link href="/sign-in" asChild>
            <Pressable
              accessibilityRole="button"
              className="items-center bg-acid px-5 py-4"
            >
              <Text className="font-bold text-ink">Entrar</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  )
}
