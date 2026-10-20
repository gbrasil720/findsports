import { Image, useWindowDimensions } from 'react-native'
import { useExploreState } from '@/components/explore-state'
import Explore from '../explore'

/*
 * A aba "Você" mostra a aba de onde se veio (Explorar ou Seus bares) sob o
 * menu de vidro (2c); o menu fica em `../_layout.tsx`. Por baixo vai a foto
 * tirada no toque em "Você": uma segunda cópia viva do Explorar montava outro
 * mapa, que recarregava os tiles na primeira vez. Sem foto (a captura
 * falhou), vai a cópia viva do Explorar.
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
