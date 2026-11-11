import { Asset } from 'expo-asset'
import { useEffect, useRef, useState } from 'react'
import { Image, type StyleProp, View, type ViewStyle } from 'react-native'
import Animated, {
  cubicBezier,
  useReducedMotion
} from 'react-native-reanimated'
import { WebView } from 'react-native-webview'
import { usePalette } from '@/components/theme'
import { ACID, INK } from '@/components/ui'
import type { MedalId } from '@/lib/medals'

/*
 * A medalha da seção 09. Duas formas: a miniatura (`MedalImage`), uma imagem
 * já renderizada para a estante, o perfil e as listas, e a de verdade
 * (`Medal3D`), que gira com o dedo no detalhe e sozinha na conquista
 * desbloqueada. As duas saem de `scripts/medals/generate.ts`.
 */

const THUMBS = {
  bar1: require('@/assets/images/medals/bar1.webp'),
  bar5: require('@/assets/images/medals/bar5.webp'),
  bar10: require('@/assets/images/medals/bar10.webp'),
  bar25: require('@/assets/images/medals/bar25.webp'),
  bai3: require('@/assets/images/medals/bai3.webp'),
  bai6: require('@/assets/images/medals/bai6.webp'),
  esp2: require('@/assets/images/medals/esp2.webp'),
  esp4: require('@/assets/images/medals/esp4.webp'),
  ava1: require('@/assets/images/medals/ava1.webp'),
  ava10: require('@/assets/images/medals/ava10.webp')
} satisfies Record<MedalId, number>

const LOCKED_THUMBS = {
  bar1: require('@/assets/images/medals/bar1-locked.webp'),
  bar5: require('@/assets/images/medals/bar5-locked.webp'),
  bar10: require('@/assets/images/medals/bar10-locked.webp'),
  bar25: require('@/assets/images/medals/bar25-locked.webp'),
  bai3: require('@/assets/images/medals/bai3-locked.webp'),
  bai6: require('@/assets/images/medals/bai6-locked.webp'),
  esp2: require('@/assets/images/medals/esp2-locked.webp'),
  esp4: require('@/assets/images/medals/esp4-locked.webp'),
  ava1: require('@/assets/images/medals/ava1-locked.webp'),
  ava10: require('@/assets/images/medals/ava10-locked.webp')
} satisfies Record<MedalId, number>

const LOCKED_LIGHT_THUMBS = {
  bar1: require('@/assets/images/medals/bar1-locked-light.webp'),
  bar5: require('@/assets/images/medals/bar5-locked-light.webp'),
  bar10: require('@/assets/images/medals/bar10-locked-light.webp'),
  bar25: require('@/assets/images/medals/bar25-locked-light.webp'),
  bai3: require('@/assets/images/medals/bai3-locked-light.webp'),
  bai6: require('@/assets/images/medals/bai6-locked-light.webp'),
  esp2: require('@/assets/images/medals/esp2-locked-light.webp'),
  esp4: require('@/assets/images/medals/esp4-locked-light.webp'),
  ava1: require('@/assets/images/medals/ava1-locked-light.webp'),
  ava10: require('@/assets/images/medals/ava10-locked-light.webp')
} satisfies Record<MedalId, number>

/**
 * As cores da seção 09. O design só desenha o escuro; no claro, tinta e papel
 * trocam e o vermelho entra no lugar do acid em texto (a regra das outras
 * telas). A barra de progresso fica em tinta: acid sobre papel some.
 */
export function useMedalPalette() {
  const p = usePalette()
  return {
    ...p,
    /** Sombra dura do cartão comum e a do destaque. */
    drop: p.dark ? 'rgba(0,0,0,.6)' : p.shadow,
    glow: p.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)',
    fill: p.dark ? ACID : INK,
    track: p.dark ? '#2c2c27' : p.mark,
    body: p.dark ? '#d6d3cb' : '#3d3d38',
    edge: p.dark ? 'rgba(241,238,230,.10)' : 'rgba(18,18,15,.12)',
    pick: p.dark ? 'rgba(201,241,53,.1)' : 'rgba(201,241,53,.45)',
    pickEdge: p.dark ? 'rgba(201,241,53,.5)' : 'rgba(18,18,15,.2)'
  }
}

export function MedalImage({
  id,
  locked = false,
  size
}: {
  id: MedalId
  locked?: boolean
  size: number
}) {
  const dark = usePalette().dark
  return (
    <Image
      source={
        (locked ? (dark ? LOCKED_THUMBS : LOCKED_LIGHT_THUMBS) : THUMBS)[id]
      }
      style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors
    />
  )
}

/**
 * A medalha em 3D: o visualizador do gerador (`scripts/medals/viewer.ts`,
 * three no WebGL do Safari) numa WebView transparente. O `expo-gl` não
 * serviu: congelava a tela quando uma textura subia depois do primeiro
 * quadro e não mostrava nada num segundo contexto (Expo Go, iOS 26).
 *
 * `drag`: gira com o dedo e balança de leve (2j); sem ele, gira sozinha
 * (2k). Com "Reduzir movimento" fica parada, e o arraste continua. Trocar de
 * medalha troca no mesmo visualizador, sem abrir outra WebView.
 */
export function Medal3D({
  medal,
  drag = false,
  yaw = -18,
  onReady,
  style
}: {
  medal: {
    id: MedalId
    name: string
    locked: boolean
    /** O que vai gravado no verso: "04.10.2026", "Boteco Sete". */
    date?: string
    where?: string
  }
  drag?: boolean
  /** Ângulo inicial, em graus. */
  yaw?: number
  /** O primeiro quadro apareceu: hora do háptico e do confete. */
  onReady?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const reduced = useReducedMotion()
  const light = !usePalette().dark
  const uri = useViewer()
  const web = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const config = JSON.stringify({
    ...medal,
    mode: drag ? 'drag' : 'spin',
    yaw,
    reduced,
    light
  })
  // A primeira vai antes de a página carregar; as seguintes trocam no lugar.
  const first = useRef(config)
  useEffect(() => {
    if (config !== first.current)
      web.current?.injectJavaScript(`window.setMedal(${config});true`)
  }, [config])

  return (
    <View
      style={style}
      accessibilityRole="image"
      accessibilityLabel={medal.name}
    >
      {uri ? (
        // Some até o primeiro quadro: sem isso aparece o branco do carregamento.
        <Animated.View
          style={{
            flex: 1,
            opacity: ready ? 1 : 0,
            // Fade puro numa peça grande pisca; a escala dá corpo à entrada.
            transform: [{ scale: ready || reduced ? 1 : 0.96 }],
            transitionProperty: ['opacity', 'transform'],
            transitionDuration: 200,
            transitionTimingFunction: EASE_OUT
          }}
        >
          <WebView
            ref={web}
            source={{ uri }}
            originWhitelist={['*']}
            allowFileAccess
            allowingReadAccessToURL={uri}
            injectedJavaScriptBeforeContentLoaded={`window.MEDAL=${first.current};true`}
            onMessage={(e) => {
              if (e.nativeEvent.data !== 'ready') return
              setReady(true)
              onReady?.()
            }}
            style={{ backgroundColor: 'transparent' }}
            containerStyle={{ backgroundColor: 'transparent' }}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            // O arraste é da medalha, não da página.
            allowsBackForwardNavigationGestures={false}
            javaScriptEnabled
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

/** O arquivo do visualizador no aparelho (`file://`), que a WebView abre. */
let viewerUri: Promise<string> | null = null
function useViewer() {
  const [uri, setUri] = useState<string | null>(null)
  useEffect(() => {
    viewerUri ??= Asset.fromModule(require('@/assets/medal/viewer.html'))
      .downloadAsync()
      .then((asset) => asset.localUri ?? asset.uri)
    viewerUri.then(setUri)
  }, [])
  return uri
}
