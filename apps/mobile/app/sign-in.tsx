import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

export default function SignIn() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const turnstile = useTurnstile()

  const submit = async () => {
    setError(null)
    setPending(true)
    const result = await authClient.signIn.email(
      { email: email.trim(), password },
      turnstile.fetchOptions
    )
    // O token do Turnstile vale uma vez: com erro ou não, pede outro.
    turnstile.reset()
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? 'Não foi possível entrar.')
      return
    }
    // A sessão mudou: o que estava em cache era de visitante.
    await queryClient.invalidateQueries()
    router.replace('/')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-ink px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
    >
      <Text className="font-bold text-4xl text-paper">Entrar</Text>

      <View className="mt-8 gap-4">
        <View className="gap-2">
          <Text className="text-muted-on-ink">E-mail</Text>
          <TextInput
            accessibilityLabel="E-mail"
            autoCapitalize="none"
            autoComplete="email"
            className="border-2 border-paper px-4 py-3 text-lg text-paper"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
          />
        </View>
        <View className="gap-2">
          <Text className="text-muted-on-ink">Senha</Text>
          <TextInput
            accessibilityLabel="Senha"
            autoComplete="current-password"
            className="border-2 border-paper px-4 py-3 text-lg text-paper"
            onChangeText={setPassword}
            onSubmitEditing={submit}
            secureTextEntry
            value={password}
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" className="text-live-on-ink">
            {error}
          </Text>
        ) : null}
        {turnstile.widget}
      </View>

      <Pressable
        accessibilityRole="button"
        className="mt-auto items-center bg-acid px-5 py-4"
        disabled={pending}
        onPress={submit}
      >
        <Text className="font-bold text-ink">
          {pending ? 'Entrando…' : 'Entrar'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}
