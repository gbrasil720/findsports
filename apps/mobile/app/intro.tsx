import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { Glass } from '@/components/glass'
import { AskArt, CrowdArt, MapArt, TicketArt } from '@/components/intro-art'

/*
 * "03 Apresentação" do design: quatro telas, uma ideia de produto em cada,
 * iguais para torcedor e bar. Entra depois da splash para quem não tem
 * sessão. Arrastar ou "Continuar" passa de tela; "Pular", "Começar" e
 * "Entrar" levam ao login (o cadastro, "04 Conta", ainda não existe no app).
 */

const INK = '#12120f'
const PAPER = '#f1eee6'
const ACID = '#c9f135'

type Page = {
  Art: ComponentType<{ width: number; height: number }>
  /** As linhas do título como o design quebra: texto e trecho em destaque. */
  title: [string, string?][]
  body: string
  /** A ilustração é escura: barra de status clara. */
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
    title: [['Mesa garantida'], ['', 'antes do apito.']],
    body: 'Peça a reserva pelo app. O bar confirma, e o código fica guardado no seu celular.',
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
  const { width, height } = useWindowDimensions()
  const pager = useRef<ScrollView>(null)
  // `?page=N` abre direto na tela N (`onside://intro?page=3`).
  const params = useLocalSearchParams<{ page?: string }>()
  const start = Math.min(Math.max(Number(params.page) - 1 || 0, 0), 3)
  const [page, setPage] = useState(start)
  useEffect(() => {
    pager.current?.scrollTo({ x: start * width, animated: false })
    setPage(start)
  }, [start, width])

  // A ilustração ocupa a mesma fração da tela que no design (476 de 844).
  const artHeight = Math.round((height * 476) / 844)
  const last = page === PAGES.length - 1
  const enter = () => router.push('/sign-in')

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(event.nativeEvent.contentOffset.x / width))

  const next = () => {
    if (last) return enter()
    pager.current?.scrollTo({ x: (page + 1) * width })
    setPage(page + 1)
  }

  return (
    <View style={styles.screen}>
      <StatusBar style={PAGES[page].dark ? 'light' : 'dark'} />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {PAGES.map(({ Art, title, body }, index) => (
          <View key={body} style={{ width }}>
            <View style={[styles.artShadow, { height: artHeight }]}>
              <View style={styles.art}>
                <Art width={width} height={artHeight} />
              </View>
            </View>
            <View style={styles.copy}>
              <View style={styles.dots}>
                {PAGES.map((p, dot) => (
                  <View
                    key={p.body}
                    style={[styles.dot, dot === index && styles.dotActive]}
                  />
                ))}
              </View>
              <View accessible accessibilityRole="header">
                {title.map(([text, accent]) => (
                  <Text key={text + accent} style={styles.title}>
                    {text}
                    {accent ? (
                      <Text style={styles.titleAccent}>{accent}</Text>
                    ) : null}
                  </Text>
                ))}
              </View>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={enter}
        style={[styles.skip, { top: insets.top + 4 }]}
      >
        <Glass tone="dark" interactive style={styles.skipGlass}>
          <Text style={styles.skipText}>Pular</Text>
        </Glass>
      </Pressable>

      <View
        style={[styles.footer, { bottom: Math.max(insets.bottom - 4, 16) }]}
      >
        <View style={styles.ctaEdge}>
          <Pressable
            accessibilityRole="button"
            onPress={next}
            style={({ pressed }) => [
              styles.cta,
              pressed && { transform: [{ translateY: 2 }] }
            ]}
          >
            <Text style={styles.ctaText}>{last ? 'Começar' : 'Continuar'}</Text>
            <Svg width={17} height={17} viewBox="0 0 24 24">
              <Path
                d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z"
                fill={INK}
              />
            </Svg>
          </Pressable>
        </View>
        <Text style={styles.signIn}>
          Já tem conta?{' '}
          <Text
            style={styles.signInLink}
            onPress={enter}
            accessibilityRole="link"
          >
            Entrar
          </Text>
        </Text>
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
  // A tinta não conta na altura, como sombra no CSS: margem -3.
  ctaEdge: {
    height: 59,
    marginBottom: -3,
    borderRadius: 28,
    backgroundColor: INK,
    // O brilho "0 12px 24px -10px rgba(110,140,0,.6)" do design.
    shadowColor: 'rgb(110,140,0)',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 }
  },
  cta: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACID,
    // O relevo interno do design: luz em cima, verde escuro embaixo.
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.65)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(90,120,0,.25)'
  },
  ctaText: { fontFamily: 'Archivo-Bold', fontSize: 15, color: INK },
  signIn: {
    textAlign: 'center',
    fontFamily: 'Archivo-Regular',
    fontSize: 14,
    lineHeight: 19.6,
    color: '#55554f'
  },
  signInLink: { fontFamily: 'Archivo-Bold', color: INK }
})
