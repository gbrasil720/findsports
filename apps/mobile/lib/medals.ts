/*
 * O desenho das medalhas da seção 09 (`o3d.js` do design): formato, metal,
 * esmalte e o que vai gravado na face. Só dados: a medalha 3D é montada no
 * visualizador (`scripts/medals/`), e o app mostra as miniaturas prontas.
 */

export type MedalShape = 'round' | 'hex' | 'oct' | 'shield' | 'star'
export type MedalMetal = 'gold' | 'silver' | 'bronze'

export type MedalLook = {
  shape: MedalShape
  metal: MedalMetal
  enamel: string
  /** Número grande da face e a unidade embaixo dele. */
  num: string
  unit: string
  /** Texto em arco no alto da face. */
  top: string
}

/** O desenho de cada medalha, pelo id da conquista (`ACHIEVEMENTS` da API). */
export const MEDAL_LOOKS = {
  bar1: {
    shape: 'round',
    metal: 'bronze',
    enamel: '#12120f',
    num: '1',
    unit: 'BAR',
    top: 'PRIMEIRA RODADA'
  },
  bar5: {
    shape: 'hex',
    metal: 'silver',
    enamel: '#c9f135',
    num: '5',
    unit: 'BARES',
    top: 'DESBRAVADOR'
  },
  bar10: {
    shape: 'shield',
    metal: 'gold',
    enamel: '#e8320c',
    num: '10',
    unit: 'BARES',
    top: 'RATO DE BAR'
  },
  bar25: {
    shape: 'star',
    metal: 'gold',
    enamel: '#12120f',
    num: '25',
    unit: 'BARES',
    top: 'LENDA DO BAIRRO'
  },
  bai3: {
    shape: 'oct',
    metal: 'bronze',
    enamel: '#e7e3db',
    num: '3',
    unit: 'BAIRROS',
    top: 'RODOU A CIDADE'
  },
  bai6: {
    shape: 'round',
    metal: 'silver',
    enamel: '#e8320c',
    num: '6',
    unit: 'BAIRROS',
    top: 'CIDADÃO'
  },
  esp2: {
    shape: 'round',
    metal: 'silver',
    enamel: '#12120f',
    num: '2',
    unit: 'ESPORTES',
    top: 'ECLÉTICO'
  },
  esp4: {
    shape: 'hex',
    metal: 'gold',
    enamel: '#c9f135',
    num: '4',
    unit: 'ESPORTES',
    top: 'POLIESPORTIVO'
  },
  ava1: {
    shape: 'shield',
    metal: 'bronze',
    enamel: '#c9f135',
    num: '1',
    unit: 'RESENHA',
    top: 'PRIMEIRA RESENHA'
  },
  ava10: {
    shape: 'star',
    metal: 'silver',
    enamel: '#e8320c',
    num: '10',
    unit: 'RESENHAS',
    top: 'CRÍTICO'
  }
} satisfies Record<string, MedalLook>

export type MedalId = keyof typeof MEDAL_LOOKS

/**
 * A bloqueada no tema claro: o design só tem a escura, que no papel vira uma
 * mancha preta. Mesmo desenho, em cinza-pedra.
 */
export const LOCKED_LIGHT = { lockedMetal: '#aaa69c', lockedEnamel: '#dcd8cf' }
