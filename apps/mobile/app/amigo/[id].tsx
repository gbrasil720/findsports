import { useLocalSearchParams } from 'expo-router'
import { FriendPage } from '@/components/friend-page'
import { useStatusBar } from '@/components/ui'

/** Perfil de amigo (11d), em tela própria; o corpo é `FriendPage`. */
export default function FriendProfile() {
  useStatusBar('auto')
  const params = useLocalSearchParams<{ id: string; via?: string }>()
  return <FriendPage id={params.id} via={params.via} />
}
