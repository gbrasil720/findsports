const COLORS = {
  live: '#E8320C',
  acid: '#C9F135',
  ink: '#12120F',
  creme: '#F1EEE6'
} as const

/**
 * Os pinos que existem (WEB-332): um por plano, e os dois de jogo ao vivo.
 *
 * O desenho é o mesmo; muda a cor do corpo e o que vai no meio. `none` apaga a
 * peça que o pino não usa: o Elite troca o miolo redondo pela estrela, e a
 * estrela continua quando o jogo ao vivo pinta o corpo de vermelho.
 */
const PINOS = {
  starter: { cor: COLORS.ink, miolo: COLORS.creme, estrela: 'none' },
  pro: { cor: COLORS.ink, miolo: COLORS.acid, estrela: 'none' },
  elite: { cor: COLORS.acid, miolo: 'none', estrela: COLORS.ink },
  live: { cor: COLORS.live, miolo: COLORS.creme, estrela: 'none' },
  'elite-live': { cor: COLORS.live, miolo: 'none', estrela: COLORS.ink }
} as const

export type MapPin = keyof typeof PINOS

/**
 * O pino de um bar. `plan` é o plano vigente (`bar.plan`, WEB-129): plano
 * parado chega aqui como Starter. O vermelho do jogo ao vivo vale mais que a
 * cor do plano, mas não apaga a estrela do Elite.
 */
export function pinDoPlano(
  plan: string | null | undefined,
  aoVivo = false
): MapPin {
  if (plan === 'elite') return aoVivo ? 'elite-live' : 'elite'
  if (aoVivo) return 'live'
  return plan === 'pro' ? 'pro' : 'starter'
}

/**
 * Ordem de empilhamento: o pino em destaque por cima de todos, e o Elite por
 * cima dos outros planos quando dois pinos caem no mesmo lugar.
 */
export function ordemDoPino(pin: MapPin, large: boolean): string {
  if (large) return '999'
  return pin === 'elite' || pin === 'elite-live' ? '20' : '10'
}

/** Proporção entre o pino em destaque e o normal (42/36 do ícone antigo). */
const ESCALA_DESTAQUE = 42 / 36

/**
 * A marcação do pino. Uma só, para todos: o miolo e a estrela estão sempre
 * no SVG, e a variável de cada um decide qual dos dois aparece.
 *
 * Duas escolhas aqui são de desempenho, e as duas vêm do fato de o pino ter
 * deixado de ser imagem (`data:` URI num `google.maps.Icon`) e passado a ser
 * DOM de verdade, no mesmo documento da página:
 *
 *   1. **As cores saem de variáveis CSS.** Trocar de pino vira escrita de
 *      propriedade no contêiner. SVG embutido herda variável CSS dos
 *      ancestrais, então nada é percorrido nem reanalisado.
 *
 *   2. **A sombra saiu do SVG e virou `filter` do CSS.** O `<filter>` do SVG
 *      precisava de um `id`, e trinta pinos no mesmo documento significariam
 *      trinta `id="s"` repetidos — todos resolvendo para o primeiro. Além de
 *      inválido, era trabalho de CPU; `drop-shadow` do CSS é composto na GPU.
 */
const MARCACAO_DO_PINO = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
  <path d="M18 1c8.8 0 16 7.1 16 15.9 0 11.4-14.2 26.4-15 27.2a1.4 1.4 0 0 1-2 0C16.2 43.3 2 28.3 2 16.9 2 8.1 9.2 1 18 1z" fill="var(--pino-cor)" stroke="#12120F" stroke-width="2"/>
  <circle cx="18" cy="17" r="6.5" fill="var(--pino-miolo)"/>
  <path d="M18 9l1.88 5.41 5.73.12-4.57 3.46 1.66 5.48L18 20.2l-4.7 3.27 1.66-5.48-4.57-3.46 5.73-.12z" fill="var(--pino-estrela)"/>
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
  /** Onde `aplicarPino` escreve cores, escala e sombra. */
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
 * Aplica o pino e o destaque.
 *
 * Roda no caminho do hover, que dispara a cada movimento do mouse pela lista.
 * São só escritas de estilo: nenhuma análise de marcação, nenhuma busca no
 * DOM, e `transform`/`filter` não provocam recálculo de layout — o navegador
 * resolve na composição.
 *
 * Antes, cada mudança reescrevia `innerHTML`: o SVG inteiro era reanalisado e
 * os nós, recriados.
 */
export function aplicarPino(
  pintura: HTMLElement,
  pin: MapPin,
  large: boolean
): void {
  const { cor, miolo, estrela } = PINOS[pin]
  pintura.style.setProperty('--pino-cor', cor)
  pintura.style.setProperty('--pino-miolo', miolo)
  pintura.style.setProperty('--pino-estrela', estrela)
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
