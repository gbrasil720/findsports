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

/** A borda direita da sidebar como se vê e o começo do conteúdo, em px. */
export type Borda = { borda: number; conteudo: number }

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * Lê a sidebar como ela está na tela, inclusive no meio de uma animação: o
 * recorte de quem abre (`clip-path`), a placa de quem recolhe (`::before`)
 * e o deslocamento do conteúdo.
 */
export function medirBorda(rail: HTMLElement, col: HTMLElement): Borda {
  const caixa = rail.getBoundingClientRect()
  const clip = getComputedStyle(rail).clipPath
  const corte = clip.startsWith('inset(')
    ? Number.parseFloat(clip.slice(6).split(' ')[1] ?? '0') || 0
    : 0
  const placa = getComputedStyle(rail, '::before')
  const escala =
    placa.transform && placa.transform !== 'none'
      ? new DOMMatrix(placa.transform).a
      : 0
  return {
    borda: Math.max(
      caixa.width - corte,
      escala * (Number.parseFloat(placa.width) || 0)
    ),
    conteudo: col.getBoundingClientRect().left
  }
}

/**
 * Leva a sidebar e o conteúdo de `de` até onde o layout novo os pôs (FLIP).
 * Abrir revela a sidebar por recorte; recolher encolhe a placa de tinta atrás
 * dos ícones. O conteúdo anda junto da borda, pelo mesmo tempo e curva, só
 * com `transform`. Os itens da sidebar trocam de arranjo no primeiro quadro e
 * esmaecem para dentro. Sair é mais rápido que entrar. Com movimento
 * reduzido, só o esmaecer.
 */
export function animarTrilho(rail: HTMLElement, col: HTMLElement, de: Borda) {
  const para = medirBorda(rail, col)
  const delta = para.borda - de.borda
  if (Math.abs(delta) < 1) return
  const abre = delta > 0
  for (const item of Array.from(rail.children)) {
    item.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: EASE
    })
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const tempo = { duration: abre ? 240 : 200, easing: EASE }
  if (abre) {
    rail.animate(
      [{ clipPath: `inset(0 ${delta}px 0 0)` }, { clipPath: 'inset(0 0 0 0)' }],
      tempo
    )
  } else {
    const largura = Number.parseFloat(getComputedStyle(rail, '::before').width)
    if (largura > 0) {
      rail.animate(
        [
          { transform: `scaleX(${de.borda / largura})` },
          { transform: `scaleX(${para.borda / largura})` }
        ],
        { ...tempo, pseudoElement: '::before' }
      )
    }
  }
  const anda = de.conteudo - para.conteudo
  if (Math.abs(anda) >= 1) {
    col.animate(
      [{ transform: `translateX(${anda}px)` }, { transform: 'none' }],
      tempo
    )
  }
}
