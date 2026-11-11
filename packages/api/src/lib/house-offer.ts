import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { TRPCError } from '@trpc/server'
import { issuesCounterCode, type SubscriptionForPlan } from './current-plan'

/**
 * Regras da oferta da casa (WEB-120) que dependem do plano.
 *
 * O plano vem da assinatura via `getCurrentPlan` — `active`, ou `trialing`
 * com período vigente — e nunca de `bar.plan`, que só acompanha o fim do
 * trial uma vez por dia.
 */

/**
 * Esconder o formulário não é validação: o procedimento chama isto antes de
 * gravar, e a recusa vale para qualquer escrita — salvar, editar ou limpar.
 */
export function assertCanConfigureHouseOffer(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): void {
  if (!issuesCounterCode(subscription, now)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A oferta da casa é um recurso do plano Elite.'
    })
  }
}

/** Normaliza o texto recebido e aplica o limite sobre a forma gravada. */
export function parseHouseOfferInput(input: string | null): string | null {
  const value = normalizeHouseOffer(input)
  if (houseOfferLength(value) > HOUSE_OFFER_MAX_LENGTH) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `A oferta da casa aceita até ${HOUSE_OFFER_MAX_LENGTH} caracteres.`
    })
  }
  return value
}

/** O que o jogo guarda da oferta (WEB-422): o texto próprio e o "sem oferta". */
export type GameHouseOffer = {
  houseOffer: string | null
  noHouseOffer: boolean
}

/**
 * A oferta da casa que vale num jogo (WEB-422, decisão do dono em
 * 28/10/2026): a do jogo substitui a padrão do bar; "sem oferta neste jogo"
 * desliga a padrão só ali; sem nenhuma das duas, vale a do bar. Não tem
 * prazo.
 *
 * Não olha o plano: quem chama decide se o bar é Elite, como antes. A busca
 * repete esta regra em SQL (`jogoComOferta`, em `pub-search/shared.ts`).
 */
export function effectiveHouseOffer(
  barOffer: string | null,
  game: GameHouseOffer
): string | null {
  if (game.noHouseOffer) return null
  return game.houseOffer ?? barOffer
}

/**
 * O que gravar no jogo a partir do formulário do painel: ligado com o texto da
 * padrão herda (e acompanha a padrão se o dono a trocar depois); ligado com
 * outro texto é próprio; desligado, ou ligado em branco, é "sem oferta neste
 * jogo", que só precisa ser gravado quando há padrão para desligar. Sem
 * padrão, desligado herda: assim o formulário que abre e salva sem mexer
 * devolve o que o jogo já tinha.
 */
export function gameHouseOfferFromForm(
  barOffer: string | null,
  form: { ligada: boolean; texto: string }
): GameHouseOffer {
  const texto = normalizeHouseOffer(form.texto)
  const padrao = normalizeHouseOffer(barOffer)
  if (!form.ligada || texto === null) {
    return { houseOffer: null, noHouseOffer: padrao !== null }
  }
  return {
    houseOffer: texto === padrao ? null : texto,
    noHouseOffer: false
  }
}
