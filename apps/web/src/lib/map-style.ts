import { type Flavor, layers } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

/**
 * O estilo do mapa, versionado (WEB-73).
 *
 * Antes o estilo morava no console do Google Cloud, preso a um Map ID: com
 * `mapId` a API **ignora** `styles` definido em código, então nem o
 * repositório nem o PR viam a aparência do mapa — era configuração remota que
 * ninguém revisava e ninguém conseguia reproduzir em desenvolvimento.
 *
 * Aqui o estilo é um objeto TypeScript. Trocar a cor da água é um diff.
 *
 * ## De onde vêm as camadas
 *
 * As ~70 camadas do esquema Protomaps v4 (água, terra, vias com casing,
 * pontes, túneis, prédios, rótulos) são geradas por `@protomaps/basemaps` a
 * partir de uma paleta — o `Flavor` abaixo. Escrever as camadas à mão
 * significaria manter, para sempre, uma cópia desatualizada do esquema de
 * quem produz os tiles.
 *
 * ## O que este flavor tira de propósito
 *
 * - **`pois` ausente** ⇒ nenhuma camada de ponto de interesse. É a mesma
 *   decisão do mapa antigo (`clickableIcons: false` mais POI escondido no Map
 *   ID): num mapa cuja função é achar bar da Onside, o ícone de outro bar
 *   compete com o pino.
 * - **`landcover` ausente** ⇒ nenhuma mancha de cobertura do solo. São áreas
 *   grandes e saturadas que brigariam com o acid dos pinos.
 */

/** Identidade: tinta, papel e acid. O mapa é o fundo; o pino é o assunto. */
const INK = '#12120F'
const PAPER = '#F1EEE6'
const STONE = '#E7E3DB'

/**
 * A paleta do mapa.
 *
 * Regra que a orienta: o basemap inteiro fica em cinzas quentes derivados de
 * `--onside-paper`, e nenhuma cor forte aparece nele. As duas únicas cores
 * saturadas da tela — o acid `#C9F135` do círculo de raio e o live `#E8320C`
 * do pino ao vivo — vêm do componente, não daqui. Um parque verde ou um POI
 * laranja no basemap roubariam exatamente o contraste que faz o pino ser visto.
 */
const ONSIDE_PAPER_FLAVOR: Flavor = {
  // Fora do recorte do arquivo PMTiles não existe tile: o que aparece é este
  // fundo. Igual ao `--onside-stone` do quadro do mapa, para a borda do
  // arquivo não virar um retângulo de cor diferente.
  background: STONE,
  earth: PAPER,

  water: '#C9D2CF',

  park_a: '#E4E5D8',
  park_b: '#D6DCC4',
  wood_a: '#E1E4D6',
  wood_b: '#D1D9C1',
  scrub_a: '#E4E4D9',
  scrub_b: '#D9DCC9',
  hospital: '#EDE4E0',
  industrial: '#E7E4DA',
  school: '#EDE7DC',
  pedestrian: '#E9E5DA',
  glacier: '#EDEDEA',
  sand: '#EDE8D9',
  beach: '#EFE9D5',
  aerodrome: '#E6E5E2',
  runway: '#F4F2EC',
  zoo: '#E2E6DC',
  military: '#E4E1DA',
  pier: '#E4E0D5',
  buildings: '#E2DCCE',

  tunnel_other_casing: '#E4E0D4',
  tunnel_minor_casing: '#E4E0D4',
  tunnel_link_casing: '#E4E0D4',
  tunnel_major_casing: '#E4E0D4',
  tunnel_highway_casing: '#E4E0D4',
  tunnel_other: '#EAE6DA',
  tunnel_minor: '#EAE6DA',
  tunnel_link: '#EAE6DA',
  tunnel_major: '#EAE6DA',
  tunnel_highway: '#EAE6DA',

  // Via clara sobre terra levemente mais escura: é o que dá legibilidade de
  // rua sem precisar de contorno forte.
  minor_service_casing: '#DAD4C5',
  minor_casing: '#DAD4C5',
  link_casing: '#DAD4C5',
  major_casing_late: '#D3CCBB',
  highway_casing_late: '#CFC7B4',
  other: '#F7F5EF',
  minor_service: '#F7F5EF',
  minor_a: '#F7F5EF',
  minor_b: '#FFFFFF',
  link: '#FFFFFF',
  major_casing_early: '#D3CCBB',
  major: '#FFFFFF',
  highway_casing_early: '#CFC7B4',
  highway: '#FFFFFF',

  railway: '#BFB9AA',
  boundaries: '#A5A096',

  bridges_other_casing: '#DAD4C5',
  bridges_minor_casing: '#DAD4C5',
  bridges_link_casing: '#DAD4C5',
  bridges_major_casing: '#D3CCBB',
  bridges_highway_casing: '#CFC7B4',
  bridges_other: '#F7F5EF',
  bridges_minor: '#FFFFFF',
  bridges_link: '#FFFFFF',
  bridges_major: '#FFFFFF',
  bridges_highway: '#FFFFFF',

  // Halo de papel: o rótulo tem que ser lido por cima de via branca e de
  // parque, sem caixa e sem sombra.
  roads_label_minor: '#6B675E',
  roads_label_minor_halo: PAPER,
  roads_label_major: '#55554F',
  roads_label_major_halo: PAPER,
  ocean_label: '#8A9A96',
  subplace_label: '#6B675E',
  subplace_label_halo: PAPER,
  city_label: INK,
  city_label_halo: PAPER,
  state_label: '#8A867C',
  state_label_halo: PAPER,
  country_label: '#8A867C',
  address_label: '#7A766C',
  address_label_halo: PAPER
}

/** Nome da fonte vetorial dentro do estilo. Só importa para as camadas. */
const SOURCE = 'protomaps'

/**
 * Glyphs e sprite (Delta 3 do WEB-73).
 *
 * Sem endpoint de glyphs o MapLibre não renderiza texto nenhum — o mapa fica
 * mudo, sem nome de rua nem de bairro, e sem erro que aponte para a causa.
 *
 * Estão em `apps/web/public/map/`, e não num bucket, por três motivos: são
 * 1,2 MB estáticos que nunca mudam, ficam na mesma origem (nenhum CORS,
 * nenhuma variável de ambiente a esquecer), e passam a ser versionados junto
 * do estilo que os referencia. É o item que o ticket chamou de "o mais fácil
 * de esquecer"; assim não há o que esquecer.
 *
 * Faixas incluídas por fonte: `0-255` e `256-511` (latino e latino estendido),
 * `7680-7935` (latino adicional) e `8192-8447` (pontuação — travessão e aspas
 * tipográficas aparecem em nome de logradouro). O conteúdo dentro do recorte
 * é todo latino; faixas de outros alfabetos só somariam peso.
 *
 * Os caminhos são relativos à origem, mas entram no estilo já absolutos: o
 * MapLibre recusa `sprite` relativo com
 * `Invalid sprite URL "…", must be absolute` e nem chega a carregar o estilo.
 */
const GLYPHS = '/map/fonts/{fontstack}/{range}.pbf'
const SPRITE = '/map/sprite/light'

/**
 * Atribuição.
 *
 * Obrigatória em dois pontos, e os dois são condição de uso do que é grátis:
 * OpenStreetMap pela ODbL (os tiles derivam dela) e LocationIQ pelo tier
 * grátis do geocoder que posiciona os pinos.
 */
const ATRIBUICAO = [
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>',
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noreferrer">Protomaps</a>',
  '<a href="https://locationiq.com" target="_blank" rel="noreferrer">LocationIQ</a>'
].join(' · ')

/**
 * Monta o estilo apontando para o arquivo PMTiles informado.
 *
 * `pmtiles://` é resolvido pelo protocolo registrado em `onside-map.tsx`: o
 * navegador lê faixas de bytes do arquivo único por HTTP Range, sem servidor
 * de tiles no meio.
 *
 * `lang: 'pt'` faz os rótulos preferirem `name:pt` — "Oceano Atlântico" em
 * vez de "Atlantic Ocean" —, caindo no nome local quando não existe tradução,
 * que dentro do Brasil é o nome certo de qualquer forma.
 */
export function criarEstiloDoMapa(
  tilesUrl: string,
  /**
   * Origem que prefixa glyphs e sprite. Vem de `window.location.origin` no
   * componente; é parâmetro, e não leitura global, para o estilo continuar
   * montável fora do navegador — é o que permite validá-lo contra o spec do
   * MapLibre em teste, sem DOM.
   */
  origem: string
): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origem}${GLYPHS}`,
    sprite: `${origem}${SPRITE}`,
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: `pmtiles://${tilesUrl}`,
        attribution: ATRIBUICAO
      }
    },
    layers: layers(SOURCE, ONSIDE_PAPER_FLAVOR, { lang: 'pt' })
  }
}
