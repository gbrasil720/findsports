import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'

/**
 * Bar que confirma o código depois do jogo, pela comanda (WEB-412). O garçom
 * anota o código que o torcedor mostra e o dono lança no dia seguinte, em
 * `/admin/validate`. Opção do bar, desligada por padrão.
 */

export type LateEntryResult =
  inferRouterOutputs<AppRouter>['reservationValidation']['logLate'][number]

/**
 * O recado que o dono manda à equipe (WhatsApp ou meia folha no balcão). Sem
 * oferta escrita, fala da "oferta da casa" em geral.
 */
export function getTeamMessage(offer: string | null): string {
  // A oferta é texto do dono: ponto final só se ele não pôs.
  const reward = offer
    ? `ganha a oferta da casa: ${/[.!?…]$/.test(offer) ? offer : `${offer}.`}`
    : 'ganha a oferta da casa.'
  return [
    'Pessoal, a partir de agora:',
    `Cliente que mostrar um código da Onside no celular (6 letras e números, tipo K7M·R4P) ${reward}`,
    'Anotem o código na comanda dele. Não precisa conferir nada na hora: eu lanço depois do jogo.'
  ].join('\n')
}

/**
 * Um código por linha; vírgula e ponto e vírgula também separam. Espaço não:
 * "A7K 29" é um código só, escrito em dois blocos como na tela do torcedor.
 */
export function splitLateCodes(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const LATE_ENTRY_LABELS: Record<LateEntryResult['status'], string> = {
  logged: 'Lançado',
  not_found: 'Não encontrado. Confira as letras na comanda.',
  used: 'Já estava validado.',
  not_confirmed: 'O torcedor desmarcou este jogo.',
  too_early: 'O jogo deste código ainda não começou.',
  expired: 'Passou o prazo: o código vale até 48 h depois do jogo.',
  limited: 'Muitos códigos errados seguidos. Espere 10 minutos e lance de novo.'
}

export function getLateEntryLabel(status: LateEntryResult['status']) {
  return LATE_ENTRY_LABELS[status]
}

/** O que volta para a caixa depois de lançar: só o que dá para corrigir. */
export function getRetryableCodes(results: LateEntryResult[]): string[] {
  return results
    .filter(({ status }) => status === 'not_found' || status === 'limited')
    .map(({ code }) => code)
}
