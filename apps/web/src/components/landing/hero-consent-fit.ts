/**
 * Hero em retrato com o aviso de cookies pendente: a barra do aviso fica no
 * pé da tela, bem onde a chamada principal termina. Esta função mede quanto a
 * chamada precisa subir para terminar 16px acima da barra e publica a altura
 * que sobra para a arte em `--onside-hero-art` (`onside.css` a usa como teto
 * do palco). Depois da resposta o CSS deixa de olhar a variável e o hero volta
 * ao normal.
 *
 * É medida, e não conta de CSS, porque a altura do texto do hero depende da
 * largura e do texto, que muda. Quando a chamada já cabe, ou não caberia nem
 * com a arte no mínimo (celular baixo), nada muda: ela fica abaixo da dobra,
 * como sempre esteve, em vez de parar debaixo da barra.
 *
 * Roda duas vezes: inline, logo depois do hero no HTML do servidor
 * (`HERO_CONSENT_FIT_SCRIPT`), para valer no primeiro paint; e num efeito da
 * landing, que cobre a navegação pelo cliente, a troca de fonte e o resize.
 * Por ir inline como texto, não pode usar nada de fora do próprio corpo.
 */
export function fitHeroToConsentBar() {
  const root = document.documentElement
  root.style.removeProperty('--onside-hero-art')
  if (root.getAttribute('data-consent') !== 'pending') return
  const stage = document.querySelector<HTMLElement>('.onside-hero-stage')
  const button = document.querySelector<HTMLElement>('.onside-hero [data-cta]')
  const bar = document.querySelector<HTMLElement>('.onside-consent')
  if (!stage || !button || !bar) return
  // Só no hero em retrato: em paisagem o palco é o fundo da seção inteira.
  if (getComputedStyle(stage).position !== 'relative') return
  // `offsetTop`, e não `getBoundingClientRect`: a entrada do hero anima com
  // `transform`, e a medida tem de ser a do lugar final.
  let bottom = button.offsetHeight
  for (
    let el: HTMLElement | null = button;
    el;
    el = el.offsetParent as HTMLElement | null
  ) {
    bottom += el.offsetTop
  }
  const art = stage.offsetHeight
  const rise = bottom + 16 - (window.innerHeight - bar.offsetHeight)
  // 112px: o cabeçalho (66px) fica por cima da arte e o texto entra 36px nela.
  if (rise <= 0 || art - rise < 112) return
  root.style.setProperty('--onside-hero-art', `${art - rise}px`)
}

/**
 * Mede na hora e de novo quando as fontes chegam: o script roda antes delas, e
 * com a fonte de reserva o texto quebra em outras linhas. Sem a segunda medida
 * a arte ficava uns 50px mais baixa do que precisa até a hidratação.
 */
export const HERO_CONSENT_FIT_SCRIPT = `(function(){var fit=${fitHeroToConsentBar.toString()};fit();if(document.fonts)document.fonts.ready.then(fit)})()`
