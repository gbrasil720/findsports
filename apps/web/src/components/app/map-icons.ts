const COLORS = {
  live: '#E8320C',
  acid: '#C9F135',
  ink: '#12120F',
  creme: '#F1EEE6'
} as const

/**
 * Os pinos que existem: a gota da família do app (Rodada 21, 21a), no
 * desenho do web do torcedor (WEB-501): corpo de tinta com o copo, acid no
 * Elite e vermelho com o jogo ao vivo. O desenho é um só; muda a cor do corpo
 * e a do copo. Starter e Pro têm o mesmo pino desde o redesenho.
 */
const PINOS = {
  starter: { cor: COLORS.ink, copo: COLORS.creme },
  pro: { cor: COLORS.ink, copo: COLORS.creme },
  elite: { cor: COLORS.acid, copo: COLORS.ink },
  live: { cor: COLORS.live, copo: COLORS.ink },
  'elite-live': { cor: COLORS.live, copo: COLORS.ink },
  // Bar sem jogo no dia (Explorar do web): o ponto oco pequeno, abaixo das
  // gotas; em destaque vira a gota de tinta.
  quiet: { cor: COLORS.ink, copo: COLORS.creme }
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
  if (pin === 'quiet') return '5'
  return pin === 'elite' || pin === 'elite-live' ? '20' : '10'
}

/** Proporção entre o pino em destaque e o normal (42/36 do ícone antigo). */
const ESCALA_DESTAQUE = 42 / 36

/**
 * A marcação do pino. Uma só, para todos: o corpo e o copo estão sempre
 * no SVG, e a variável de cada um decide a cor.
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
  <path d="M3 2h30a1 1 0 0 1 1 1v27a2 2 0 0 1-.7 1.5L18 44 2.7 31.5A2 2 0 0 1 2 30V3a1 1 0 0 1 1-1z" fill="var(--pino-cor)" stroke="#12120F" stroke-width="2"/>
  <path d="M12 10h12l-1.6 14h-8.8z" fill="var(--pino-copo)"/>
  <path d="M12.6 15h10.8" stroke="var(--pino-cor)" stroke-width="1.6"/>
</svg><span style="display:none;width:9px;height:9px;border-radius:50%;background:#F1EEE6;border:2.5px solid #12120F"></span>`

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
  const { cor, copo } = PINOS[pin]
  pintura.style.setProperty('--pino-cor', cor)
  pintura.style.setProperty('--pino-copo', copo)
  pintura.style.transform = large ? `scale(${ESCALA_DESTAQUE})` : ''
  // O ponto oco no lugar da gota: o SVG e o ponto já estão na marcação.
  const oco = pin === 'quiet' && !large
  const [gota, ponto] = pintura.children as unknown as HTMLElement[]
  if (gota && ponto) {
    gota.style.display = oco ? 'none' : ''
    ponto.style.display = oco ? 'block' : 'none'
  }
  // O nome aparece no pino em destaque (`.pino-nome` no CSS do torcedor).
  pintura.toggleAttribute('data-destaque', large)
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
