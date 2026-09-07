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
 * Um pino: a raiz que o MapLibre posiciona, e o nó que a gente pinta.
 *
 * São dois nós, e não um, por causa de como o `maplibregl.Marker` funciona
 * (Delta 2 do WEB-73). Lendo a fonte do MapLibre (`src/ui/marker.ts`,
 * `_update`), ele escreve `this._element.style.transform` a **cada quadro**
 * para posicionar o marcador, e também escreve `this._element.style.opacity`.
 * Um `scale()` nosso no mesmo nó seria sobrescrito no quadro seguinte, e o
 * destaque do hover simplesmente não apareceria — sem erro nenhum.
 *
 * Então a raiz é do MapLibre e o filho é nosso. Zero mudança visual: o
 * `AdvancedMarkerElement` do Google não escrevia `transform`, e ancorava pela
 * base central; `new Marker({ anchor: 'bottom' })` ancora no mesmo ponto.
 */
export type Pino = {
  /** Vai para `new maplibregl.Marker({ element })`. Não escreva estilo aqui. */
  raiz: HTMLElement
  /** Onde `aplicarPino` escreve cor, escala e sombra. */
  pintura: HTMLElement
}

/**
 * Cria um pino, um por marcador.
 *
 * DOM não se compartilha: anexar o mesmo nó a um segundo marcador o
 * arrancaria do primeiro, e um pino sumiria do mapa sem erro nenhum. Por isso
 * cada marcador cria o seu — e é a única vez em que a marcação é analisada.
 *
 * `transform-origin: bottom center` no nó pintado faz o destaque crescer sem
 * tirar a ponta do pino do endereço.
 *
 * O cursor não é escrito aqui: quem decide se o pino clica é o componente, e
 * só o mapa que tem `onSelect` deve mostrar ponteiro. Ver `onside-map.tsx`.
 */
export function criarConteudoDePino(): Pino {
  const raiz = document.createElement('div')
  raiz.style.lineHeight = '0'

  const pintura = document.createElement('div')
  pintura.style.lineHeight = '0'
  pintura.style.transformOrigin = 'bottom center'
  pintura.style.filter = 'drop-shadow(0 2px 1.5px rgba(0, 0, 0, 0.35))'
  pintura.innerHTML = MARCACAO_DO_PINO

  raiz.appendChild(pintura)
  return { raiz, pintura }
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
  pintura: HTMLElement,
  accent: MapAccent,
  large: boolean
): void {
  pintura.style.setProperty('--pino-cor', COLORS[accent])
  pintura.style.transform = large ? `scale(${ESCALA_DESTAQUE})` : ''
}

/**
 * Ponto da localização do usuário.
 *
 * O ícone antigo ancorava no centro (`anchor: 11,11`), e o
 * `AdvancedMarkerElement` ancorava pela base — daí o `translateY(50%)` que
 * existia aqui só para desfazer a âncora errada. O `maplibregl.Marker` aceita
 * `anchor: 'center'` direto, então a compensação some.
 */
export function criarPontoDoUsuario(): HTMLElement {
  const elemento = document.createElement('div')
  elemento.style.lineHeight = '0'
  elemento.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="10" fill="rgba(201,241,53,0.28)"/>
  <circle cx="11" cy="11" r="5" fill="#12120F" stroke="#C9F135" stroke-width="2"/>
</svg>`
  return elemento
}
