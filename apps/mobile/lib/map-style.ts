import type { MapStyleElement } from 'react-native-maps'

/*
 * Estilo do Google Maps no Android (`customMapStyle`), nas cores da Onside:
 * quadras em papel, ruas claras, rótulos em tinta apagada, sem pontos de
 * interesse nem transporte (os pinos são dos bares). No iOS o Apple Maps não
 * aceita estilo: lá vale a versão apagada (`mutedStandard`).
 *
 * ponytail: conferido só no papel; ajustar as cores quando houver emulador
 * Android para ver lado a lado com o design.
 */

function style(c: {
  land: string
  block: string
  road: string
  highway: string
  water: string
  park: string
  label: string
  halo: string
}): MapStyleElement[] {
  return [
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.halo }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ visibility: 'on' }, { color: c.park }]
    },
    {
      featureType: 'landscape.man_made',
      elementType: 'geometry',
      stylers: [{ color: c.block }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: c.road }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: c.highway }]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: c.water }]
    }
  ]
}

export const MAP_STYLE = {
  light: style({
    land: '#ece9e1',
    block: '#e5e1d7',
    road: '#faf8f3',
    highway: '#f6f3ea',
    water: '#c9d1cf',
    park: '#dfe4cf',
    label: '#6b6860',
    halo: '#f1eee6'
  }),
  dark: style({
    land: '#1a1a17',
    block: '#20201c',
    road: '#2c2c27',
    highway: '#35352f',
    water: '#0f1416',
    park: '#1f241a',
    label: '#8f8b81',
    halo: '#12120f'
  })
}
