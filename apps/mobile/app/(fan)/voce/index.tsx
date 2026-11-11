import { Image, useWindowDimensions } from 'react-native'
import { useShot } from '@/components/explore-state'
import Explore from '../explore'

/*
 * A aba "Você" mostra a aba de onde se veio (Explorar ou Seus bares) sob o
 * menu de vidro (2c); o menu fica em `../_layout.tsx`. Por baixo vai a foto
 * dela (`useShot`). Sem foto ainda, vai a cópia viva do Explorar.
 */
export default function YouBehindMenu() {
  const shot = useShot()
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
