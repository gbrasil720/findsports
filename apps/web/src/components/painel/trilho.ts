/*
 * Sidebar recolhível do painel (canvas "Sidebar recolhível do painel").
 * Quem decide o desenho é o atributo `data-pn-trilho` do `<html>`, lido pelo
 * `painel.css` só de 861 px para cima (no celular são as abas):
 * - sem atributo: a sidebar inteira, empurrando o conteúdo;
 * - `1`: o trilho de ícones de 84 px;
 * - `sobre`: entre 861 e 1180 px, a sidebar inteira por cima do conteúdo.
 * No desktop a escolha fica no navegador; entre 861 e 1180 px o padrão é o
 * trilho, e abrir é passageiro.
 */

export const TRILHO_KEY = 'onside.painel.trilho'
export const LARGO = '(min-width: 1181px)'

export type Trilho = '1' | 'sobre' | null

export function valorTrilho(
  largo: boolean,
  recolhida: boolean,
  sobre: boolean
): Trilho {
  if (largo) return recolhida ? '1' : null
  return sobre ? 'sobre' : '1'
}

export function aplicarTrilho(valor: Trilho) {
  const html = document.documentElement
  if (valor) html.setAttribute('data-pn-trilho', valor)
  else html.removeAttribute('data-pn-trilho')
}

export function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(TRILHO_KEY) === '1'
  } catch {
    return false
  }
}

export function gravarRecolhida(recolhida: boolean) {
  try {
    if (recolhida) localStorage.setItem(TRILHO_KEY, '1')
    else localStorage.removeItem(TRILHO_KEY)
  } catch {
    // Sem storage a escolha vale até fechar a aba.
  }
}

/**
 * Roda no HTML do servidor, antes de a sidebar pintar: sem ele, quem deixou
 * recolhida veria a sidebar inteira até a hidratação.
 */
export const TRILHO_SCRIPT = `(function(){var r=false;try{r=localStorage.getItem(${JSON.stringify(TRILHO_KEY)})==='1'}catch(e){}if(r||!matchMedia(${JSON.stringify(LARGO)}).matches)document.documentElement.setAttribute('data-pn-trilho','1')})()`

/** Atalho `[`, fora de campo de texto e sem tecla modificadora. */
export function ehAtalhoTrilho(event: KeyboardEvent): boolean {
  if (event.key !== '[' || event.defaultPrevented) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const alvo = event.target as HTMLElement | null
  if (!alvo) return true
  return !(
    alvo.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)
  )
}
