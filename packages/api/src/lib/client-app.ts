/**
 * O app se identifica neste cabeçalho (`apps/mobile/lib/trpc.ts`). Serve para
 * o teste A × C do recomendador ficar só no app (dono, 14/11/2026): o web
 * segue com o algoritmo de sempre. Não é segurança: quem forjar o cabeçalho só
 * entra no sorteio do teste.
 */
export const APP_CLIENT_HEADER = 'x-onside-client'

export function fromApp(headers: Headers | undefined): boolean {
  return headers?.get(APP_CLIENT_HEADER) === 'app'
}
