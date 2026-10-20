import { Image, useWindowDimensions } from 'react-native'
import { useExploreState } from '@/components/explore-state'
import Explore from '../explore'

/*
 * A aba "Você" mostra o Explorar sob o menu de vidro (2c); o menu fica em
 * `../_layout.tsx`. Por baixo vai a foto do Explorar tirada no toque em
 * "Você": uma segunda cópia viva montava outro mapa, que recarregava os tiles
 * na primeira vez. Sem foto ainda (a pessoa veio de outra aba antes de passar
 * pelo Explorar), vai a cópia viva.
 */
export default function YouBehindMenu() {
  const { shot } = useExploreState()
  const { width, height } = useWindowDimensions()
  if (!shot) return <Explore capture={false} />
  return (
    <Image
      source={{ uri: shot }}
      style={{ width, height }}
      accessibilityIgnoresInvertColors
    />
  )
}
