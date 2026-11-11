/*
 * O passeio do bar no app (rodada 11, artifact "Passeio do Bar no App") e o
 * card "Primeiros passos" de Hoje na casa: as mesmas regras do painel web
 * (`components/painel/passeio.tsx`). Os itens marcam pelo dado real quando
 * ele existe (jogos, plano, capa, horário) e, o resto (passeio, código de
 * exemplo, card escondido), pelo que fica no aparelho.
 */

export type TourStep =
  | 'hoje'
  | 'validar'
  | 'jogos'
  | 'quemvai'
  | 'espaco'
  | 'desempenho'

/** O que o banco não sabe: guardado no aparelho, por bar. */
export type LocalSteps = {
  passeio?: boolean
  codigo?: boolean
  oculto?: boolean
  vistos?: TourStep[]
}

export type GuideFacts = {
  published: number
  planChosen: boolean
  cover: boolean
  hours: boolean
  elite: boolean
}

export type GuideItem =
  | 'jogo'
  | 'plano'
  | 'passeio'
  | 'semana'
  | 'foto'
  | 'codigo'

export const GUIDE_LABELS: Record<GuideItem, string> = {
  jogo: 'Publicar o primeiro jogo',
  plano: 'Escolher o plano do teste',
  passeio: 'Conhecer o app (passeio de 30 s)',
  semana: 'Pôr mais um jogo na grade',
  foto: 'Foto de capa e horário',
  codigo: 'Validar um código de exemplo'
}

/** Os itens do card, na ordem do painel (o código só no Elite). */
export function guideItems(facts: GuideFacts, local: LocalSteps) {
  const items: { id: GuideItem; done: boolean }[] = [
    { id: 'jogo', done: facts.published > 0 },
    { id: 'plano', done: facts.planChosen },
    { id: 'passeio', done: local.passeio === true },
    { id: 'semana', done: facts.published > 1 },
    { id: 'foto', done: facts.cover && facts.hours }
  ]
  if (facts.elite) items.push({ id: 'codigo', done: local.codigo === true })
  return items
}

/**
 * As telas do passeio: Elite 6 (com Validar e Quem vai), os outros 4. O que
 * já está feito sai (Validar, Jogos, Meu espaço), menos Hoje e Desempenho.
 * `resume`: só as ainda não vistas, ou todas se já viu tudo.
 */
export function tourSteps(
  items: { id: GuideItem; done: boolean }[],
  elite: boolean,
  resume?: TourStep[]
): TourStep[] {
  const done = (id: GuideItem) => items.some((i) => i.id === id && i.done)
  const steps: TourStep[] = ['hoje']
  if (elite && !done('codigo')) steps.push('validar')
  if (!done('semana')) steps.push('jogos')
  if (elite) steps.push('quemvai')
  if (!done('foto')) steps.push('espaco')
  steps.push('desempenho')
  if (!resume?.length) return steps
  const left = steps.filter((s) => !resume.includes(s))
  return left.length ? left : steps
}

/** As telas que o menu do Bar mostra por baixo do escuro. */
export const MENU_STEPS: TourStep[] = ['quemvai', 'espaco', 'desempenho']
