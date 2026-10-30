import * as ScreenOrientation from 'expo-screen-orientation'
import * as SystemUI from 'expo-system-ui'
import { useEffect } from 'react'
import { Platform, useColorScheme, useWindowDimensions } from 'react-native'
import {
  useSafeAreaFrame,
  useSafeAreaInsets
} from 'react-native-safe-area-context'
import { INK, PAPER } from '@/components/theme'
import { classify, locksPortrait } from '@/lib/layout'
import { usePosture } from '@/modules/fold-posture'

/*
 * O layout do aparelho (WEB-486): as classes de `lib/layout.ts` pela janela
 * atual. Dobrar, abrir ou girar só muda a largura: as telas continuam
 * montadas, e o estado (mapa, folha, conversa da IA) fica onde estava.
 */

const IS_PAD = Platform.OS === 'ios' && Platform.isPad

/**
 * Pela área do app, não pela janela: no Android em tela grande a barra de
 * tarefas fixa fica fora da área do app, e a janela a conta (883 contra 801
 * dp no Fold aberto).
 */
export function useLayout() {
  const { width, height } = useSafeAreaFrame()
  const posture = usePosture()
  return classify({ width, height, os: Platform.OS, isPad: IS_PAD, posture })
}

/** Medidas da navegação de cada aparelho, as do design (gen/adapt-dev.js). */
export const NAV = {
  /** A barra flutuante do iPad e do dobrável aberto. */
  float: { height: 62, gap: 4 },
  /** A faixa da direita do Duo: 62 de largura a 10 da borda. */
  duoRail: { width: 84 },
  /** O rail dos Galaxy Tab: 84 de largura a 10 da borda. */
  rail: { width: 100 }
}

/**
 * O que a navegação tira da tela: embaixo (a barra nativa ou a flutuante) e
 * dos lados (as faixas do Duo e do Galaxy Tab). As telas das abas somam isso
 * ao próprio respiro.
 */
export function useNavInsets() {
  const insets = useSafeAreaInsets()
  const { nav } = useLayout()
  if (nav === 'duoRail')
    return { bottom: insets.bottom, left: 0, right: NAV.duoRail.width }
  if (nav === 'rail')
    return { bottom: insets.bottom, left: NAV.rail.width, right: 0 }
  // A tela de fora do Flip não tem navegação.
  if (nav === 'none') return { bottom: insets.bottom, left: 0, right: 0 }
  if (nav === 'float')
    return {
      bottom: insets.bottom + NAV.float.gap + NAV.float.height,
      left: 0,
      right: 0
    }
  // A barra nativa do iOS 26.
  return { bottom: insets.bottom + 62, left: 0, right: 0 }
}

/**
 * O fundo da janela na cor do app: no Android em tela grande, a faixa da barra
 * de tarefas fixa mostra a janela, que era cinza.
 */
export function useWindowBackground() {
  const dark = useColorScheme() === 'dark'
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(dark ? INK : PAPER).catch(() => {})
  }, [dark])
}

/**
 * Celular e capa em retrato; tablet e dobrável aberto giram (`app.json`). Pela
 * janela, não pela tela: no iPhone Duo aberto, `Dimensions.get('screen')`
 * continua dando a tela de fora.
 */
export function usePortraitLock() {
  const window = useWindowDimensions()
  const lock = !IS_PAD && locksPortrait(window)
  useEffect(() => {
    if (IS_PAD) return
    ScreenOrientation.lockAsync(
      lock
        ? ScreenOrientation.OrientationLock.PORTRAIT_UP
        : ScreenOrientation.OrientationLock.DEFAULT
    ).catch(() => {})
  }, [lock])
}
