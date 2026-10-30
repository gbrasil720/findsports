import { requireOptionalNativeModule } from 'expo'
import { useEffect, useState } from 'react'

/*
 * A postura da dobra (WEB-486): `UIHingeInteraction` no iPhone Duo (iOS 27.1) e
 * Jetpack WindowManager nos dobráveis Android. Só existe no build de
 * desenvolvimento; no Expo Go o módulo não está lá e a postura fica `unknown`
 * (o layout cai na proporção da tela).
 */

export type Posture = {
  state: 'flat' | 'half' | 'closed' | 'unknown'
  /** Só no Android: a dobra corta a tela de cima a baixo (vertical) ou de lado a lado. */
  orientation?: 'vertical' | 'horizontal'
  /** Só no Android: onde a dobra fica na janela, em dp. */
  hinge?: { x: number; y: number; width: number; height: number }
  /** Só no iOS: o ângulo da dobradiça, em graus. */
  angle?: number
}

type Native = {
  getPosture(): Posture
  addListener(
    event: 'onChange',
    listener: (p: Posture) => void
  ): {
    remove(): void
  }
}

const native = requireOptionalNativeModule<Native>('FoldPosture')
const UNKNOWN: Posture = { state: 'unknown' }

export function usePosture(): Posture {
  const [posture, setPosture] = useState<Posture>(
    () => native?.getPosture() ?? UNKNOWN
  )
  useEffect(() => {
    if (!native) return
    setPosture(native.getPosture())
    const sub = native.addListener('onChange', setPosture)
    return () => sub.remove()
  }, [])
  return posture
}
