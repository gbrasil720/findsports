import type {
  LegalBlock,
  LegalDocument,
  LegalRich
} from '@findsports_oficial/legal/legal-types'
import { POLITICA_DE_PRIVACIDADE } from '@findsports_oficial/legal/politica-de-privacidade'
import { TERMOS_DE_USO } from '@findsports_oficial/legal/termos-de-uso'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { Glass } from '@/components/glass'
import { EASE, haptic, SWAP } from '@/components/motion'
import {
  BackButton,
  BG,
  CARD,
  FG,
  FIELD,
  INK,
  LINE,
  LIVE,
  PAPER,
  SUB,
  Title,
  text,
  themed,
  useStatusBar
} from '@/components/ui'

/*
 * 11x, Termos de Uso e Política de Privacidade para ler no app, com o mesmo
 * texto do site (`packages/legal`). Abas no topo, índice que acompanha a
 * leitura, compartilhar o link e voltar ao topo.
 */

const DOCS = { termos: TERMOS_DE_USO, privacidade: POLITICA_DE_PRIVACIDADE }
type Doc = keyof typeof DOCS
const SITE = 'https://onside.sh'
// Constantes: a tela re-renderiza na rolagem (índice e "Topo"), e uma entrada
// criada no JSX recomeçaria a cada renderização (ver `POP` em `motion.tsx`).
const MENU_IN = FadeIn.duration(160)
const MENU_OUT = FadeOut.duration(120)
const TOP_IN = FadeIn.duration(180)
const TOP_OUT = FadeOut.duration(140)

/** "1. Quem pode usar"; a seção 00 (definições) vai sem número, como no design. */
const sectionLabel = ({ num, title }: { num: string; title: string }) =>
  Number(num) === 0 ? title : `${Number(num)}. ${title}`

/** Texto com negrito, e-mail clicável e termo marcado. */
function Rich({ content }: { content: LegalRich }) {
  if (typeof content === 'string') return <>{content}</>
  return (
    <>
      {content.map((part, index) => {
        const key = `${index}`
        if (typeof part === 'string') return part
        if ('b' in part)
          return (
            <Text key={key} style={styles.bold}>
              {part.b}
            </Text>
          )
        if ('email' in part)
          return (
            <Text
              key={key}
              style={styles.link}
              onPress={() => Linking.openURL(`mailto:${part.email}`)}
            >
              {part.email}
            </Text>
          )
        return (
          <Text key={key} style={styles.mark}>
            {part.mark}
          </Text>
        )
      })}
    </>
  )
}

function Bullet({ content }: { content: LegalRich }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={styles.bullet} />
      <Text style={[styles.body, { flex: 1 }]}>
        <Rich content={content} />
      </Text>
    </View>
  )
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <Text style={styles.body}>
          <Rich content={block.content} />
        </Text>
      )
    case 'h3':
      return (
        <Text style={[text(16, 'Bold'), { color: FG, marginTop: 2 }]}>
          {block.num ? `${block.num} ` : ''}
          {block.text}
        </Text>
      )
    case 'ul':
      return (
        <View style={{ gap: 10 }}>
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa
            <Bullet key={index} content={item} />
          ))}
        </View>
      )
    case 'attention':
      return (
        <View style={styles.attention}>
          <Text style={[text(12.5, 'Bold'), { color: LIVE }]}>
            {block.label.toUpperCase()}
          </Text>
          <Text style={styles.body}>
            <Rich content={block.content} />
          </Text>
        </View>
      )
    case 'table':
      // No celular a tabela vira um cartão por linha: rótulo e valor.
      return (
        <View style={{ gap: 8 }}>
          {block.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tabela fixa
            <View key={rowIndex} style={styles.row}>
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: tabela fixa
                <View key={cellIndex} style={{ gap: 2 }}>
                  <Text style={[text(12, 'Bold'), { color: SUB }]}>
                    {block.head[cellIndex]}
                  </Text>
                  <Text style={[styles.body, { fontSize: 14.5 }]}>
                    <Rich content={cell} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )
  }
}

/** As duas abas, com o indicador branco que desliza. */
function Tabs({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const [width, setWidth] = useState(0)
  const x = useSharedValue(doc === 'termos' ? 0 : 1)
  useEffect(() => {
    x.value = withTiming(doc === 'termos' ? 0 : 1, {
      duration: 220,
      easing: EASE
    })
  }, [doc, x])
  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: (x.value * width) / 2 }]
  }))
  const tone = useColorScheme() === 'dark' ? 'dark' : 'light'
  return (
    <Glass tone={tone} style={styles.tabs}>
      <View
        style={{ flex: 1, flexDirection: 'row' }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width ? (
          <Animated.View style={[styles.tabPill, { width: width / 2 }, pill]} />
        ) : null}
        {(['termos', 'privacidade'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: doc === key }}
            onPress={() => {
              if (key !== doc) haptic.select()
              onChange(key)
            }}
            style={styles.tab}
          >
            <Text
              style={[
                text(14, doc === key ? 'Bold' : 'Regular'),
                // O indicador é branco nos dois temas: o escolhido fica em tinta.
                { color: doc === key ? INK : SUB }
              ]}
            >
              {key === 'termos' ? 'Termos de Uso' : 'Privacidade'}
            </Text>
          </Pressable>
        ))}
      </View>
    </Glass>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d={open ? 'M5 15l7-7 7 7z' : 'M5 9l7 7 7-7z'} fill={FG} />
    </Svg>
  )
}

export default function Legal() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ doc?: string }>()
  const [doc, setDoc] = useState<Doc>(
    params.doc === 'privacidade' ? 'privacidade' : 'termos'
  )
  const document: LegalDocument = DOCS[doc]
  const scroller = useRef<ScrollView>(null)
  const offsets = useRef<Record<string, number>>({})
  const [current, setCurrent] = useState(0)
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useStatusBar('auto')
  const dark = useColorScheme() === 'dark'
  const tone = dark ? 'dark' : 'light'

  const switchDoc = (next: Doc) => {
    setDoc(next)
    setCurrent(0)
    setMenu(false)
    offsets.current = {}
    scroller.current?.scrollTo({ y: 0, animated: false })
  }

  const goTo = (index: number) => {
    setMenu(false)
    const y = offsets.current[document.sections[index].id]
    if (y !== undefined) scroller.current?.scrollTo({ y: y - 16 })
  }

  const top = insets.top + 4
  const headerHeight = top + 108
  const section = document.sections[current]

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        ref={scroller}
        scrollEventThrottle={64}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y
          setScrolled(y > 500)
          let index = 0
          document.sections.forEach((s, i) => {
            const at = offsets.current[s.id]
            if (at !== undefined && at - 40 <= y) index = i
          })
          setCurrent(index)
        }}
        contentContainerStyle={{
          paddingTop: headerHeight + 24,
          paddingHorizontal: 22,
          paddingBottom: insets.bottom + 110,
          gap: 14
        }}
      >
        <Animated.View key={doc} entering={SWAP} style={{ gap: 14 }}>
          <Title lines={[[document.title]]} size={38} />
          <Text style={[styles.updated, { marginTop: -6 }]}>
            Atualizado em {document.updated}
          </Text>
          {document.intro.map((paragraph, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: texto fixo
            <Text key={index} style={styles.body}>
              <Rich content={paragraph} />
            </Text>
          ))}
          {document.sections.map((part) => (
            <View
              key={part.id}
              style={{ gap: 12, marginTop: 6 }}
              onLayout={(event) => {
                offsets.current[part.id] = event.nativeEvent.layout.y
              }}
            >
              <Text style={[text(17, 'Bold'), { color: FG }]}>
                {sectionLabel(part)}
              </Text>
              {part.blocks.map((block, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: texto fixo
                <Block key={index} block={block} />
              ))}
            </View>
          ))}
          <View style={{ marginTop: 10, gap: 2 }}>
            {document.company.map((line) => (
              <Text key={line} style={[text(13), { color: SUB }]}>
                {line}
              </Text>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      {/* O topo some sobre o texto: papel cheio e depois transparente. */}
      <View
        pointerEvents="box-none"
        style={[styles.header, { paddingTop: top }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={
            dark
              ? [INK, INK, 'rgba(18,18,15,0)']
              : [PAPER, PAPER, 'rgba(241,238,230,0)']
          }
          locations={[0, 0.78, 1]}
          style={[styles.fade, { height: headerHeight + 40 }]}
        />
        <View style={styles.headRow}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <Tabs doc={doc} onChange={switchDoc} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Índice"
          onPress={() => setMenu(!menu)}
        >
          <Glass tone={tone} style={styles.index}>
            <Text
              style={[text(14, 'SemiBold'), { color: FG, flex: 1 }]}
              numberOfLines={1}
            >
              <Text style={{ color: SUB }}>Índice · </Text>
              {section ? sectionLabel(section) : ''}
            </Text>
            <Chevron open={menu} />
          </Glass>
        </Pressable>
        {menu ? (
          <Animated.View
            entering={MENU_IN}
            exiting={MENU_OUT}
            style={styles.menu}
          >
            <ScrollView style={{ maxHeight: 360 }}>
              {document.sections.map((part, index) => (
                <Pressable
                  key={part.id}
                  accessibilityRole="button"
                  onPress={() => goTo(index)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: PRESSED }
                  ]}
                >
                  <Text
                    style={[
                      text(14.5, index === current ? 'Bold' : 'Regular'),
                      { color: FG }
                    ]}
                  >
                    {sectionLabel(part)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>

      <View
        style={[styles.actions, { bottom: Math.max(insets.bottom - 4, 16) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar"
          onPress={() =>
            Share.share({
              message: `${document.title} da Onside: ${SITE}/${doc}`
            })
          }
        >
          <Glass tone={tone} interactive style={styles.round}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M12 2.5 7.5 7l1.4 1.4L11 6.3V15h2V6.3l2.1 2.1L16.5 7zM5 11v9.5h14V11h-3v2h1v5.5H7V13h1v-2z"
                fill={FG}
              />
            </Svg>
          </Glass>
        </Pressable>
        {scrolled ? (
          <Animated.View entering={TOP_IN} exiting={TOP_OUT}>
            <Pressable
              accessibilityRole="button"
              onPress={() => scroller.current?.scrollTo({ y: 0 })}
            >
              <Glass tone={tone} interactive style={styles.topButton}>
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path
                    d="M11 21V7.8l-5.6 5.6L4 12l8-8 8 8-1.4 1.4L13 7.8V21z"
                    fill={FG}
                  />
                </Svg>
                <Text style={[text(14, 'Bold'), { color: FG }]}>Topo</Text>
              </Glass>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

const PRESSED = themed('rgba(18,18,15,.05)', 'rgba(241,238,230,.06)')

const styles = StyleSheet.create({
  body: {
    fontFamily: 'Archivo-Regular',
    fontSize: 15.5,
    lineHeight: 15.5 * 1.6,
    color: FG
  },
  bold: { fontFamily: 'Archivo-Bold' },
  link: { fontFamily: 'Archivo-Bold', textDecorationLine: 'underline' },
  mark: { textDecorationLine: 'underline', textDecorationColor: LIVE },
  updated: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    color: SUB
  },
  bullet: {
    width: 6,
    height: 6,
    marginTop: 10,
    borderRadius: 1,
    backgroundColor: LIVE
  },
  attention: {
    gap: 6,
    padding: 14,
    borderRadius: 6,
    backgroundColor: CARD,
    borderLeftWidth: 3,
    borderLeftColor: LIVE
  },
  row: {
    gap: 8,
    padding: 12,
    borderRadius: 6,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 12
  },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabs: { height: 46, borderRadius: 24, padding: 4 },
  tabPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 19,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  index: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  menu: {
    borderRadius: 16,
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: themed('rgba(18,18,15,.1)', 'rgba(241,238,230,.12)'),
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 10 },
  actions: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 10
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  }
})
