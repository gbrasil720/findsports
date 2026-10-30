import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  type ComponentType,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import {
  type ArtProps,
  AskArt,
  CrowdArt,
  MapArt,
  TicketArt
} from '@/components/intro-art'
import { Enter, type Frame, useEntrance } from '@/components/intro-motion'
import { useNavInsets } from '@/components/layout'
import { SplashDone } from '@/components/splash'
import { usePalette } from '@/components/theme'
import { PillButton, Text, useStatusBar } from '@/components/ui'

/*
 * "03 Apresentação" do design: quatro telas, uma ideia de produto em cada,
 * iguais para torcedor e bar. Entra depois da splash para quem não tem
 * sessão. Arrastar ou "Continuar" passa de tela; "Pular" e "Começar" levam
 * ao perfil de uso (o cadastro), "Entrar" ao login.
 *
 * Cada tela anima a entrada uma vez, na primeira vez que é alcançada indo
 * para a frente (a primeira, quando a splash sai). Voltar mostra a tela
 * pronta.
 */

const INK = '#12120f'
const PAPER = '#f1eee6'
const ACID = '#c9f135'

type Page = {
  Art: ComponentType<ArtProps>
  /** As linhas do título como o design quebra: texto e trecho em destaque. */
  title: [string, string?][]
  body: string
  /** A ilustração é escura nos dois temas: barra de status clara. */
  dark?: boolean
}

const PAGES: Page[] = [
  {
    Art: MapArt,
    title: [['O jogo ', 'é aqui.']],
    body: 'Veja quais bares perto de você vão passar a partida, com horário e distância.'
  },
  {
    Art: CrowdArt,
    title: [['Saiba quem'], ['', 'vai estar lá.']],
    body: 'Marque que vai assistir e chame a galera. Você vê se o bar vai encher antes de sair de casa.',
    dark: true
  },
  {
    Art: TicketArt,
    title: [['Marque que vai.'], ['', 'A oferta é sua.']],
    body: 'Toque em “Vou assistir aqui” e receba um código na hora. Mostre no balcão e ganhe a oferta da casa.',
    dark: true
  },
  {
    Art: AskArt,
    title: [['Precisa de'], ['algo ', 'específico?']],
    body: 'Peça à busca com IA. Ela procura entre os bares e explica por que escolheu cada um.'
  }
]

export default function Intro() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const { height } = window
  // No iPhone Duo a barra de status e a ilha ficam na faixa da direita.
  const strip = useNavInsets().right
  const width = window.width - strip
  // Fora do celular o texto e os botões ficam numa coluna de até 480 no meio.
  const ox = (width - Math.min(width, 480)) / 2
  const pager = useRef<ScrollView>(null)
  // `?page=N` abre direto na tela N (`onside://intro?page=3`).
  const params = useLocalSearchParams<{ page?: string }>()
  const start = Math.min(Math.max(Number(params.page) - 1 || 0, 0), 3)
  const [page, setPage] = useState(start)
  // A tela mais adiante já alcançada: até ela, a entrada já tocou.
  const [reached, setReached] = useState(start)
  const reach = (index: number) =>
    setReached((current) => Math.max(current, index))
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando o link muda
  useEffect(() => {
    pager.current?.scrollTo({ x: start * width, animated: false })
    setPage(start)
    setReached((current) => Math.max(current, start))
  }, [start])
  // Girar o tablet muda a largura: a página que estava à vista volta ao lugar.
  const shown = useRef(page)
  shown.current = page
  useEffect(() => {
    pager.current?.scrollTo({ x: shown.current * width, animated: false })
  }, [width])
  const splashDone = useContext(SplashDone)
  // O design só tem o claro; no escuro, tinta e papel trocam e o acid
  // assume o destaque do vermelho, como na tab bar do design.
  const palette = usePalette()
  // Durante a splash, a barra segue o tema do sistema, como ela.
  useStatusBar(
    splashDone ? (PAGES[page].dark || palette.dark ? 'light' : 'dark') : 'auto'
  )

  // A ilustração ocupa a mesma fração da tela que no design (476 de 844).
  const artHeight = Math.round((height * 476) / 844)
  const last = page === PAGES.length - 1
  // "Começar" e "Pular" abrem o cadastro; "Entrar", o login.
  const signUp = () => router.push('/profile')
  const signIn = () => router.push('/sign-in')

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(event.nativeEvent.contentOffset.x / width))

  // A entrada começa quando 15% da tela seguinte aparecem: esperando a
  // metade, ela entrava vazia durante o arraste.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    reach(Math.floor(event.nativeEvent.contentOffset.x / width + 0.85))

  const next = () => {
    if (last) return signUp()
    pager.current?.scrollTo({ x: (page + 1) * width })
    setPage(page + 1)
    reach(page + 1)
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg, paddingRight: strip }
      ]}
    >
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {PAGES.map((item, index) => (
          <IntroPage
            key={item.body}
            item={item}
            index={index}
            width={width}
            column={ox}
            artHeight={artHeight}
            done={index < start}
            play={splashDone && index <= reached}
          />
        ))}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={signUp}
        style={[styles.skip, { top: insets.top + 4, right: 18 + strip }]}
      >
        <Glass tone="dark" interactive style={styles.skipGlass}>
          <Text style={styles.skipText}>Pular</Text>
        </Glass>
      </Pressable>

      <View
        style={[
          styles.footer,
          {
            bottom: Math.max(insets.bottom - 4, 16),
            left: 16 + ox,
            right: 16 + ox + strip
          }
        ]}
      >
        <PillButton
          label={last ? 'Começar' : 'Continuar'}
          trailing
          onPress={next}
          // Sombra dura em tinta some no fundo de tinta: preto, como em reset-sent.
          edge={palette.dark ? '#000' : INK}
        />
        <Text style={[styles.signIn, { color: palette.muted }]}>
          Já tem conta?{' '}
          <Text
            style={[styles.signInLink, { color: palette.ink }]}
            onPress={signIn}
            accessibilityRole="link"
          >
            Entrar
          </Text>
        </Text>
      </View>
    </View>
  )
}

// O texto é o que se lê: chega cedo e perto (assentado em ~0,5 s), enquanto
// a ilustração continua. Pontos, linhas do título uma a uma, corpo.
const COPY = {
  dots: [{ at: 0.02, opacity: 0 }, { at: 0.14 }],
  line: (n: number): Frame[] => [
    { at: 0.04 + n * 0.04, y: 14, opacity: 0 }, // sp-up
    { at: 0.24 + n * 0.04 }
  ],
  body: [{ at: 0.1, y: 8, opacity: 0 }, { at: 0.3 }] // sp-fade
} satisfies Record<string, Frame[] | ((n: number) => Frame[])>

function IntroPage({
  item: { Art, title, body },
  index,
  width,
  column,
  artHeight,
  done,
  play
}: {
  item: Page
  index: number
  width: number
  /** O recuo da coluna do texto (0 no celular). */
  column: number
  artHeight: number
  done: boolean
  play: boolean
}) {
  const palette = usePalette()
  const progress = useEntrance(done, play)
  return (
    <View style={{ width }}>
      <View
        style={[
          styles.artShadow,
          { height: artHeight, backgroundColor: palette.bg },
          palette.dark && { shadowColor: '#000', shadowOpacity: 0.6 }
        ]}
      >
        <View style={styles.art}>
          <Art width={width} height={artHeight} progress={progress} />
        </View>
      </View>
      <View style={[styles.copy, { paddingHorizontal: 22 + column }]}>
        <Enter progress={progress} frames={COPY.dots} style={styles.dots}>
          {PAGES.map((p, dot) => (
            <View
              key={p.body}
              style={[
                styles.dot,
                palette.dark && { backgroundColor: 'rgba(241,238,230,.2)' },
                dot === index && [
                  styles.dotActive,
                  { backgroundColor: palette.ink }
                ]
              ]}
            />
          ))}
        </Enter>
        <View accessible accessibilityRole="header">
          {title.map(([text, accent], line) => (
            <Enter
              key={text + accent}
              progress={progress}
              frames={COPY.line(line)}
            >
              <Text style={[styles.title, { color: palette.ink }]}>
                {text}
                {accent ? (
                  <Text
                    style={[
                      styles.titleAccent,
                      palette.dark && { color: ACID }
                    ]}
                  >
                    {accent}
                  </Text>
                ) : null}
              </Text>
            </Enter>
          ))}
        </View>
        <Enter progress={progress} frames={COPY.body}>
          <Text style={[styles.body, { color: palette.muted }]}>{body}</Text>
        </Enter>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  // A sombra fica fora do recorte: no iOS, `overflow: hidden` a esconderia.
  artShadow: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: PAPER,
    shadowColor: INK,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  art: {
    flex: 1,
    overflow: 'hidden',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30
  },
  copy: { paddingHorizontal: 22, paddingTop: 28, gap: 12 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(18,18,15,.2)'
  },
  dotActive: { width: 18, backgroundColor: INK },
  // No iOS, `lineHeight` menor que a altura da fonte corta o topo das letras,
  // e a do Anton é 1,5em. Cada linha fica com a altura natural e a margem
  // negativa traz o espaçamento para o 1.02 do design: (1,505 - 1,02) / 2 em.
  title: {
    fontFamily: 'Anton',
    fontSize: 38,
    marginVertical: -9.2,
    letterSpacing: -0.76,
    textTransform: 'uppercase',
    color: INK
  },
  titleAccent: { color: '#c92b0c' },
  body: {
    fontFamily: 'Archivo-Regular',
    fontSize: 16,
    lineHeight: 23.7,
    color: '#55554f'
  },
  skip: { position: 'absolute', right: 18 },
  skipGlass: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: 17,
    justifyContent: 'center'
  },
  skipText: { fontFamily: 'Archivo-Bold', fontSize: 13.5, color: PAPER },
  footer: { position: 'absolute', left: 16, right: 16, gap: 12 },
  // A sombra dura "0 3px 0" do botão: a tinta por baixo, 3 px mais alta.
  signIn: {
    textAlign: 'center',
    fontFamily: 'Archivo-Regular',
    fontSize: 14,
    lineHeight: 19.6,
    color: '#55554f'
  },
  signInLink: { fontFamily: 'Archivo-Bold', color: INK }
})
