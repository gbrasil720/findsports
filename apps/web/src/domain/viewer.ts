/**
 * Quem está olhando a página, e o que esse papel pode fazer nela.
 *
 * A rota do perfil público fixava `variant="pub"` no `AppShell`: o torcedor —
 * o visitante que a página existe para atender — via o cabeçalho de dono de
 * bar ("Onside para bares") e a navegação do painel. O cabeçalho tem de
 * seguir o papel de quem visita, nunca o tipo da página.
 */

export type ViewerRole = 'fan' | 'pub' | 'admin'

export type ShellVariant = 'fan' | 'pub' | 'public'

/**
 * `admin` cai em `public`: o cabeçalho neutro oferece "Ir para o app", que é o
 * que um administrador espiando um perfil precisa. Sem sessão também é
 * `public` — e nesse caso o portão de login já cobre a tela.
 */
export function shellVariantForViewer(
  role: ViewerRole | string | null | undefined
): ShellVariant {
  if (role === 'fan') return 'fan'
  if (role === 'pub') return 'pub'
  return 'public'
}

/**
 * `pubs.favorite` responde `FORBIDDEN` para qualquer papel que não seja `fan`.
 * O botão aparecia para todo mundo, então o dono do bar que abrisse o próprio
 * perfil clicava e recebia um erro — a única resposta possível.
 */
export function canFavoriteBars(
  role: ViewerRole | string | null | undefined
): boolean {
  return role === 'fan'
}

/**
 * Espelha o servidor: `recordCommercialEvent` responde 403 para quem não é
 * torcedor (`validateFanSession`) e para sessão personificada. Dono abrindo o
 * próprio perfil, admin e suporte personificando não devem nem disparar o
 * pedido — o 403 está certo, o que sobra é o erro no console (WEB-311).
 */
export function canRecordCommercialEvents(
  role: ViewerRole | string | null | undefined,
  impersonatedBy?: string | null
): boolean {
  return role === 'fan' && !impersonatedBy
}
