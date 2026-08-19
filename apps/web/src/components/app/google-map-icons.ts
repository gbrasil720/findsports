const COLORS = {
  live: '#E8320C',
  acid: '#C9F135',
  ink: '#12120F'
} as const

export type MapAccent = keyof typeof COLORS

/** Proporção entre o pino em destaque e o normal (42/36 do ícone antigo). */
const ESCALA_DESTAQUE = 42 / 36

/**
 * A marcação do pino. Uma só, para todos.
 *
 * Duas escolhas aqui são de desempenho, e as duas vêm do fato de o pino ter
 * deixado de ser imagem (`data:` URI num `google.maps.Icon`) e passado a ser
 * DOM de verdade, no mesmo documento da página:
 *
 *   1. **A cor sai de uma variável CSS.** Trocar cor no hover vira uma
 *      escrita de propriedade no contêiner. SVG embutido herda variável CSS
 *      dos ancestrais, então nada é percorrido nem reanalisado.
 *
 *   2. **A sombra saiu do SVG e virou `filter` do CSS.** O `<filter>` do SVG
 *      precisava de um `id`, e trinta pinos no mesmo documento significariam
 *      trinta `id="s"` repetidos — todos resolvendo para o primeiro. Além de
 *      inválido, era trabalho de CPU; `drop-shadow` do CSS é composto na GPU.
 */
const MARCACAO_DO_PINO = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
  <path d="M18 1c8.8 0 16 7.1 16 15.9 0 11.4-14.2 26.4-15 27.2a1.4 1.4 0 0 1-2 0C16.2 43.3 2 28.3 2 16.9 2 8.1 9.2 1 18 1z" fill="var(--pino-cor)" stroke="#12120F" stroke-width="2"/>
  <circle cx="18" cy="17" r="6.5" fill="#F1EEE6"/>
</svg>`

/**
 * Container do pino, um por marcador.
 *
 * DOM não se compartilha: anexar o mesmo nó a um segundo marcador o
 * arrancaria do primeiro, e um pino sumiria do mapa sem erro nenhum. Por isso
 * cada marcador cria o seu — e é a única vez em que a marcação é analisada.
 *
 * `AdvancedMarkerElement` ancora o conteúdo pela base central, que é onde a
 * ponta do pino fica: o mesmo ponto que o `anchor` do ícone antigo apontava.
 * `transform-origin` acompanha, para o destaque crescer sem tirar a ponta do
 * lugar.
 */
export function criarConteudoDePino(): HTMLElement {
  const elemento = document.createElement('div')
  elemento.style.lineHeight = '0'
  // O marcador inteiro é clicável pelo `gmp-click`; agora é DOM comum e não
  // herda o cursor do mapa.
  elemento.style.cursor = 'pointer'
  elemento.style.transformOrigin = 'bottom center'
  elemento.style.filter = 'drop-shadow(0 2px 1.5px rgba(0, 0, 0, 0.35))'
  elemento.innerHTML = MARCACAO_DO_PINO
  return elemento
}

/**
 * Aplica cor e destaque.
 *
 * Roda no caminho do hover, que dispara a cada movimento do mouse pela lista.
 * São duas escritas de estilo: nenhuma análise de marcação, nenhuma busca no
 * DOM, e `transform`/`filter` não provocam recálculo de layout — o navegador
 * resolve na composição.
 *
 * Antes, cada mudança reescrevia `innerHTML`: o SVG inteiro era reanalisado e
 * os nós, recriados.
 */
export function aplicarPino(
  elemento: HTMLElement,
  accent: MapAccent,
  large: boolean
): void {
  elemento.style.setProperty('--pino-cor', COLORS[accent])
  elemento.style.transform = large ? `scale(${ESCALA_DESTAQUE})` : ''
}

/**
 * Ponto da localização do usuário.
 *
 * O ícone antigo ancorava no centro (`anchor: 11,11`). O
 * `AdvancedMarkerElement` ancora pela base, então sem compensar o ponto
 * subiria meio diâmetro e deixaria de marcar onde a pessoa está.
 */
export function criarPontoDoUsuario(): HTMLElement {
  const elemento = document.createElement('div')
  elemento.style.lineHeight = '0'
  elemento.style.transform = 'translateY(50%)'
  elemento.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="10" fill="rgba(201,241,53,0.28)"/>
  <circle cx="11" cy="11" r="5" fill="#12120F" stroke="#C9F135" stroke-width="2"/>
</svg>`
  return elemento
}
