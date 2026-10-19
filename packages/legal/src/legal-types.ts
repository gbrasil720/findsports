/** Trecho de texto: puro, em negrito, e-mail clicável ou termo sublinhado. */
export type LegalInline =
  | string
  | { b: string }
  | { email: string }
  | { mark: string }

/*
 * O parâmetro `I` deixa outro texto longo do site (o guia, em `apps/web`)
 * acrescentar trechos próprios, como link, sem que o app, que só renderiza os
 * documentos legais, precise conhecê-los. Sem parâmetro, é o tipo de sempre.
 */
export type LegalRich<I = LegalInline> = string | I[]

export type LegalBlock<I = LegalInline> =
  | { type: 'p'; content: LegalRich<I> }
  | { type: 'h3'; text: string; num?: string }
  | { type: 'ul'; items: LegalRich<I>[] }
  | { type: 'attention'; label: string; content: LegalRich<I> }
  | {
      type: 'table'
      head: string[]
      /** Peso de cada coluna; ausente, todas iguais. */
      columnWeights?: number[]
      rows: LegalRich<I>[][]
    }

export type LegalSection<I = LegalInline> = {
  id: string
  num: string
  title: string
  blocks: LegalBlock<I>[]
}

export type LegalDocument<I = LegalInline, To extends string = LegalPath> = {
  kicker: string
  title: string
  updated: string
  reading: string
  intro: LegalRich<I>[]
  company: string[]
  other: { label: string; to: To; blurb: string }
  sections: LegalSection<I>[]
}

export type LegalPath = '/termos' | '/privacidade'
