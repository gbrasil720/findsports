import {
  type Href,
  useGlobalSearchParams,
  usePathname,
  useRouter
} from 'expo-router'
import { Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui'

/*
 * A aba "DEV" na borda direita, só em desenvolvimento. Tocar abre o
 * navegador de telas (`app/dev.tsx`); segurar recarrega só a tela atual (ela
 * monta de novo, com a entrada).
 */
export function DevTab() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  if (!__DEV__ || pathname === '/dev') return null

  const { _r: _, ...rest } = params
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Navegador de telas (desenvolvimento)"
      hitSlop={10}
      onPress={() =>
        router.push({
          pathname: '/dev',
          params: { from: pathname, fromParams: JSON.stringify(rest) }
        })
      }
      onLongPress={() =>
        router.replace({
          pathname: pathname as never,
          params: { ...rest, _r: String(Date.now()) }
        } as Href)
      }
      style={styles.tab}
    >
      <Text style={styles.label}>DEV</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tab: {
    position: 'absolute',
    right: 0,
    top: '42%',
    width: 22,
    height: 64,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: 'rgba(232,50,12,.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    width: 64,
    textAlign: 'center',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#f1eee6',
    transform: [{ rotate: '-90deg' }]
  }
})
