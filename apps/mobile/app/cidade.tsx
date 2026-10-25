import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { haptic, SWAP } from '@/components/motion'
import {
  BackButton,
  FG,
  FIELD,
  Field,
  LINE_STRONG,
  LIVE,
  Screen,
  SUB,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * A cidade das Configurações (11h, "Cidade"): de onde a busca parte quando o
 * celular não dá a localização. A mesma lista do onboarding (4l).
 */

export default function City() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 200)
    return () => clearTimeout(timer)
  }, [typed])
  const current = useQuery(trpc.pubs.getMyCity.queryOptions())
  const suggestions = useQuery({
    ...trpc.pubs.searchCities.queryOptions({ query }),
    enabled: query.length >= 2
  })
  const save = useMutation(
    trpc.pubs.updateMyCity.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyCity.queryKey()
        })
        router.back()
      }
    })
  )

  return (
    <Screen gap={14} padding={18}>
      <BackButton />
      <Title lines={[['Sua cidade']]} size={36} />
      <Text style={[text(15, 'Regular', 1.45), { color: SUB, marginTop: -4 }]}>
        {current.data
          ? `Hoje é ${current.data.name}, ${current.data.uf}. `
          : ''}
        Sem a localização do celular, a busca parte do centro dela.
      </Text>
      <Field
        label="Cidade"
        icon="pin"
        placeholder="Ex: São Paulo"
        autoCorrect={false}
        autoFocus
        value={typed}
        onChangeText={setTyped}
      />
      {(suggestions.data?.length ?? 0) > 0 ? (
        <Animated.View entering={SWAP} style={styles.suggestions}>
          {suggestions.data?.map((city) => (
            <Pressable
              key={`${city.name}-${city.uf}`}
              accessibilityRole="button"
              disabled={save.isPending}
              onPress={() => save.mutate(city)}
              style={({ pressed }) => [
                styles.suggestion,
                pressed && { backgroundColor: PRESSED }
              ]}
            >
              <Text style={[text(15, 'SemiBold'), { color: FG }]}>
                {city.name}
              </Text>
              <Text style={[text(13), { color: SUB }]}>{city.uf}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      {save.isError ? (
        <Text style={[text(13.5), { color: LIVE }]}>
          Não foi possível salvar a cidade. Tente de novo.
        </Text>
      ) : null}
      <View />
    </Screen>
  )
}

const PRESSED = themed('rgba(18,18,15,.05)', 'rgba(241,238,230,.06)')

const styles = StyleSheet.create({
  suggestions: {
    borderRadius: 5,
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: LINE_STRONG,
    overflow: 'hidden'
  },
  suggestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingVertical: 12
  }
})
