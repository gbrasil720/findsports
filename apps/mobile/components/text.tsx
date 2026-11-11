import { type ComponentPropsWithRef, createContext, useContext } from 'react'
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps
} from 'react-native'

/*
 * O teto do "Texto maior" do iOS, numa regra só (WEB-410). Nos tamanhos de
 * acessibilidade a letra chega a 3,1×, e o que tem medida de design (título
 * em Anton de uma palavra por linha, rótulo de botão em pílula de altura fixa)
 * quebra no meio da palavra ou vaza. Fica num arquivo próprio para o
 * `motion.tsx`, que o `ui.tsx` importa, poder usar sem importar o `ui.tsx`.
 */

/**
 * Texto corrido, chips e cards: 1,35× é o maior "Texto maior" do iOS fora dos
 * tamanhos de acessibilidade.
 */
export const MAX_FONT_SCALE = 1.35

/**
 * Títulos em Anton e rótulos de botão: a palavra mais longa do título
 * ("CONFIGURAÇÕES", "DESBRAVADOR") ainda cabe na linha.
 */
export const DISPLAY_FONT_SCALE = 1.2

// Um `Text` dentro de outro herda o teto do de fora: com teto próprio, o
// trecho em destaque de um título cresceria mais que o resto da linha.
const Nested = createContext(false)

/**
 * O `Text` do app: teto de `DISPLAY_FONT_SCALE` em Anton e de
 * `MAX_FONT_SCALE` no resto. Um `maxFontSizeMultiplier` próprio vence.
 */
export function Text(props: TextProps) {
  const nested = useContext(Nested)
  if (nested) return <RNText {...props} />
  const display = StyleSheet.flatten(props.style)?.fontFamily === 'Anton'
  return (
    <Nested.Provider value>
      <RNText
        maxFontSizeMultiplier={display ? DISPLAY_FONT_SCALE : MAX_FONT_SCALE}
        {...props}
      />
    </Nested.Provider>
  )
}

/** O `TextInput` do app, com o teto do texto corrido (o `ref` passa junto). */
export type TextInput = RNTextInput
export function TextInput(props: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />
}
