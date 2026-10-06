/** Trecho de texto: puro, em negrito, e-mail clicável ou termo sublinhado. */
export type LegalInline =
  | string
  | { b: string }
  | { email: string }
  | { mark: string }

export type LegalRich = string | LegalInline[]

export type LegalBlock =
  | { type: 'p'; content: LegalRich }
  | { type: 'h3'; text: string; num?: string }
  | { type: 'ul'; items: LegalRich[] }
  | { type: 'attention'; label: string; content: LegalRich }
  | {
      type: 'table'
      head: string[]
      /** Peso de cada coluna; ausente, todas iguais. */
      columnWeights?: number[]
      rows: LegalRich[][]
    }

export type LegalSection = {
  id: string
  num: string
  title: string
  blocks: LegalBlock[]
}

export type LegalDocument = {
  kicker: string
  title: string
  updated: string
  reading: string
  intro: LegalRich[]
  company: string[]
  other: { label: string; to: '/termos' | '/privacidade'; blurb: string }
  sections: LegalSection[]
}
