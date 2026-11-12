import { Asset } from 'expo-asset'
import { useEffect, useRef, useState } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import Animated, {
  cubicBezier,
  useReducedMotion
} from 'react-native-reanimated'
import { SvgXml } from 'react-native-svg'
import { WebView } from 'react-native-webview'
import type { MascotState } from '@/lib/mascot'
import { TACA_SVG } from './mascot-still'
import type { AiPalette } from './theme'

/*
 * A taça, a mascote da busca com IA. O palco (`scripts/mascot/stage.ts`,
 * gerado em `assets/mascot/stage.html`) roda numa WebView transparente, como
 * a medalha: o `open-bot-avatar` desenha no canvas do navegador. A tela só diz
 * o estado; o palco entra nele a partir do que estiver mostrando.
 *
 * Decorativa para o leitor de tela: o status do cabeçalho já diz o mesmo.
 */
export function Mascot({
  state,
  palette,
  style
}: {
  state: MascotState
  palette: AiPalette
  style?: StyleProp<ViewStyle>
}) {
  const reduced = useReducedMotion()
  const uri = useStage()
  const web = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const config = JSON.stringify({ state, dark: palette.dark, reduced })
  // A primeira vai antes de a página carregar; as seguintes trocam no lugar.
  // O que mudar antes de a página ficar pronta segue no "ready": o chat
  // anda mais rápido que o carregamento da WebView.
  const first = useRef(config)
  const latest = useRef(config)
  latest.current = config
  useEffect(() => {
    if (ready && config !== first.current)
      web.current?.injectJavaScript(`window.setMascot(${config});true`)
  }, [config, ready])

  return (
    <View
      style={style}
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        // Some até o primeiro quadro: sem isso aparece o branco do carregamento.
        <Animated.View
          style={{
            flex: 1,
            opacity: ready ? 1 : 0,
            // Fade puro numa peça grande pisca; a escala dá corpo à entrada.
            transform: [{ scale: ready || reduced ? 1 : 0.97 }],
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
            injectedJavaScriptBeforeContentLoaded={`window.MASCOT=${first.current};true`}
            onMessage={(e) => {
              if (e.nativeEvent.data !== 'ready') return
              if (latest.current !== first.current)
                web.current?.injectJavaScript(
                  `window.setMascot(${latest.current});true`
                )
              setReady(true)
            }}
            style={{ backgroundColor: 'transparent' }}
            containerStyle={{ backgroundColor: 'transparent' }}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            allowsBackForwardNavigationGestures={false}
            javaScriptEnabled
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

/** A taça parada, para o ladrilho do cabeçalho (sempre escuro). */
export function MascotStill({ size }: { size: number }) {
  return <SvgXml xml={TACA_SVG} width={size} height={size} />
}

/** O arquivo do palco no aparelho (`file://`), que a WebView abre. */
let stageUri: Promise<string> | null = null
function useStage() {
  const [uri, setUri] = useState<string | null>(null)
  useEffect(() => {
    stageUri ??= Asset.fromModule(require('@/assets/mascot/stage.html'))
      .downloadAsync()
      .then((asset) => asset.localUri ?? asset.uri)
    stageUri.then(setUri)
  }, [])
  return uri
}
