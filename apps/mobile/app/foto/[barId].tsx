import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'
import { PhotoViewer } from '@/components/photo-viewer'
import { filterPhotos, parseFilter } from '@/lib/gallery'
import { trpc } from '@/lib/trpc'

/*
 * A foto em tela cheia por rota (25b), para quem abre de fora da galeria (a
 * página do bar no tablet). Sem miniatura de origem, abre e fecha
 * esmaecendo; o resto é o mesmo `PhotoViewer` da galeria.
 */
export default function Foto() {
  const { barId, i, cat } = useLocalSearchParams<{
    barId: string
    i?: string
    cat?: string
  }>()
  const router = useRouter()
  const bar = useQuery(trpc.pubs.getById.queryOptions({ id: barId }))
  const all = bar.data?.photos ?? []
  const photos = filterPhotos(all, parseFilter(all, cat))
  return (
    <View style={{ flex: 1, backgroundColor: '#0b0b09' }}>
      {photos.length ? (
        <PhotoViewer
          photos={photos}
          start={Math.min(Math.max(0, Number(i) || 0), photos.length - 1)}
          onClose={() => router.back()}
        />
      ) : null}
    </View>
  )
}
