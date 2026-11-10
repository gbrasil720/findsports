import type {
  LegalBlock,
  LegalDocument,
  LegalRich
} from '@findsports_oficial/legal/legal-types'
import { POLITICA_DE_PRIVACIDADE } from '@findsports_oficial/legal/politica-de-privacidade'
import { TERMOS_DE_USO } from '@findsports_oficial/legal/termos-de-uso'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Segmented } from '@/components/segmented'
import { usePalette } from '@/components/theme'
import {
  BG,
  CARD,
  FG,
  Icon,
  LINE,
  LIVE,
  SUB,
  Text,
  text,
  themed,
  useStatusBar
} from '@/components/ui'

/*
 * Termos de Uso e Política de Privacidade (rodada 7, 06): o texto de
 * `packages/legal`, o mesmo do site, numa leitura confortável (Archivo 16,
 * entrelinha 1,6), com o índice das seções no topo (tocar rola até ela) e a
 * data da versão em mono.
 */

const DOCS = { termos: TERMOS_DE_USO, privacidade: POLITICA_DE_PRIVACIDADE }
type Doc = keyof typeof DOCS
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

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]

/** "6 de novembro de 2026" → "06/11/2026" (a versão em mono do topo). */
export function versionDate(updated: string) {
  const match = updated.match(/(\d{1,2}) de (\p{L}+) de (\d{4})/u)
  if (!match) return updated
  const month = MONTHS.indexOf(match[2].toLocaleLowerCase('pt-BR')) + 1
  if (!month) return updated
  return `${match[1].padStart(2, '0')}/${String(month).padStart(2, '0')}/${match[3]}`
}

/** "3 · Presença e código do balcão"; a 00 (definições) vai sem número. */
const indexLabel = ({ num, title }: { num: string; title: string }) =>
  Number(num) === 0 ? title : `${Number(num)} · ${title}`

export default function Legal() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const palette = usePalette()
  const params = useLocalSearchParams<{ doc?: string }>()
  const [doc, setDoc] = useState<Doc>(
    params.doc === 'privacidade' ? 'privacidade' : 'termos'
  )
  const document: LegalDocument = DOCS[doc]
  const scroller = useRef<ScrollView>(null)
  const sectionsTop = useRef(0)
  const offsets = useRef<Record<string, number>>({})
  useStatusBar('auto')

  const switchDoc = (next: Doc) => {
    setDoc(next)
    offsets.current = {}
    scroller.current?.scrollTo({ y: 0, animated: false })
  }

  // Tocar no índice rola até a seção (scroll nativo).
  const goTo = (id: string) => {
    const y = offsets.current[id]
    if (y !== undefined)
      scroller.current?.scrollTo({
        y: sectionsTop.current + y - insets.top - 12
      })
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
          gap: 14
        }}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={() => router.back()}
            style={[
              styles.round,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Icon name="back" size={20} color={palette.ink} />
          </Pressable>
          <Text style={styles.version}>
            VERSÃO DE {versionDate(document.updated)}
          </Text>
        </View>
        <Segmented
          items={[
            { key: 'termos', label: 'Termos de Uso' },
            { key: 'privacidade', label: 'Privacidade' }
          ]}
          value={doc}
          onChange={switchDoc}
        />

        <View
          style={[
            styles.index,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Text style={styles.indexKicker}>NESTA PÁGINA</Text>
          {document.sections.map((part) => (
            <Text
              key={part.id}
              accessibilityRole="link"
              onPress={() => goTo(part.id)}
              suppressHighlighting
              style={styles.indexItem}
            >
              {indexLabel(part)}
            </Text>
          ))}
        </View>

        {document.intro.map((paragraph, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: texto fixo
          <Text key={`${doc}-${index}`} style={styles.body}>
            <Rich content={paragraph} />
          </Text>
        ))}
        <View
          key={doc}
          style={{ gap: 14 }}
          onLayout={(event) => {
            sectionsTop.current = event.nativeEvent.layout.y
          }}
        >
          {document.sections.map((part) => (
            <View
              key={part.id}
              style={{ gap: 12, marginTop: 6 }}
              onLayout={(event) => {
                offsets.current[part.id] = event.nativeEvent.layout.y
              }}
            >
              <Text accessibilityRole="header" style={styles.heading}>
                {indexLabel(part)}
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
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    fontFamily: 'Archivo-Regular',
    fontSize: 16,
    lineHeight: 16 * 1.6,
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  version: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5, color: SUB },
  index: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 6,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  indexKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: SUB
  },
  indexItem: {
    alignSelf: 'flex-start',
    ...text(15, 'SemiBold', 1.3),
    color: FG,
    textDecorationLine: 'underline',
    textDecorationColor: themed('rgba(18,18,15,.3)', 'rgba(241,238,230,.3)')
  },
  // Anton 24: margem negativa no lugar do entrelinha curto.
  heading: {
    fontFamily: 'Anton',
    fontSize: 24,
    textTransform: 'uppercase',
    color: FG,
    marginVertical: -5.8
  }
})
