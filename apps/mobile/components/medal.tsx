import { Asset } from 'expo-asset'
import { useEffect, useRef, useState } from 'react'
import { Image, type StyleProp, View, type ViewStyle } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { WebView } from 'react-native-webview'
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

export function MedalImage({
  id,
  locked = false,
  size
}: {
  id: MedalId
  locked?: boolean
  size: number
}) {
  return (
    <Image
      source={(locked ? LOCKED_THUMBS : THUMBS)[id]}
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
  style?: StyleProp<ViewStyle>
}) {
  const reduced = useReducedMotion()
  const uri = useViewer()
  const web = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const config = JSON.stringify({
    ...medal,
    mode: drag ? 'drag' : 'spin',
    yaw,
    reduced
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
            transitionProperty: 'opacity',
            transitionDuration: 200
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
              if (e.nativeEvent.data === 'ready') setReady(true)
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
