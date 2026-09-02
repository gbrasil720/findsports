import type { WaitlistConfirmRefusal } from '@findsports_oficial/api/routers/waitlist'

/**
 * Qual estado a tela `/confirm-waitlist` deve mostrar.
 *
 * Antes ela ramificava direto em `isError`, e isso equiparava três coisas
 * diferentes: link morto, queda de rede e link sem token. Quem perdia a
 * conexão lia "Este link não vale mais" — afirmação falsa sobre um link que
 * continua valendo — e quem abria a URL truncada ficava para sempre em
 * "Confirmando seu e-mail…", com `aria-busy` dizendo o contrário.
 *
 * A regra vive aqui, fora do componente, porque é ela que os testes precisam
 * fixar: a renderização é consequência.
 */

/**
 * Recusa de negócio, decidida pela procedure `waitlist.confirm`. Vem de lá
 * para cá: uma causa nova no servidor tem de quebrar a compilação da tela, não
 * cair silenciosamente no texto errado.
 */
export type { WaitlistConfirmRefusal }

/** Recusa de negócio mais as duas que a própria tela reconhece. */
export type WaitlistConfirmFailure =
  | WaitlistConfirmRefusal
  | 'incomplete_link'
  | 'unavailable'

/** Mesmo mínimo do `tokenSchema` da procedure. Barrar aqui evita que um link
 * truncado pelo cliente de e-mail vire erro de validação do servidor — que a
 * tela leria como falha de transporte e mandaria tentar de novo à toa. */
export const WAITLIST_TOKEN_MIN_LENGTH = 32

export type WaitlistConfirmResult =
  | { confirmed: true; waitlistId: string; emailSent: boolean }
  | { confirmed: false; reason: WaitlistConfirmRefusal }

export type WaitlistConfirmationState =
  | { kind: 'confirming' }
  | { kind: 'confirmed'; emailSent: boolean }
  | { kind: 'failed'; failure: WaitlistConfirmFailure }

export function waitlistConfirmationState(input: {
  token: string
  isError: boolean
  data: WaitlistConfirmResult | undefined
}): WaitlistConfirmationState {
  // Sem token não há o que aguardar: a mutation nunca sai, então "confirmando"
  // seria uma promessa que ninguém vai cumprir.
  if (input.token.length < WAITLIST_TOKEN_MIN_LENGTH) {
    return { kind: 'failed', failure: 'incomplete_link' }
  }
  // `isError` passa a ser só transporte: a recusa de negócio chega como
  // resultado, e é ela que autoriza dizer que o link não vale.
  if (input.isError) return { kind: 'failed', failure: 'unavailable' }
  if (!input.data) return { kind: 'confirming' }
  return input.data.confirmed
    ? { kind: 'confirmed', emailSent: input.data.emailSent }
    : { kind: 'failed', failure: input.data.reason }
}

/** Só a falha de transporte é tentável de novo pelo mesmo link. */
export function isRetryableWaitlistFailure(
  failure: WaitlistConfirmFailure
): boolean {
  return failure === 'unavailable'
}
