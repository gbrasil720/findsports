import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AnalyticsOverviewData } from './admin-model'
import { AnalyticsOverview } from './analytics-overview'

/** Um torcedor abriu o perfil uma vez e clicou em WhatsApp e em Rota. */
const data = {
  uniqueVisitors: 1,
  interestedPeople: 1,
  highIntentActions: 2,
  profileViews: 1,
  directionsOpened: 1,
  phoneClicked: 0,
  whatsappOpened: 1,
  classicExposures: 3,
  classicClicks: 1,
  uniqueVisitorsPrev: 0,
  interestedPeoplePrev: 0,
  highIntentActionsPrev: 0,
  profileViewsPrev: 0,
  directionsOpenedPrev: 0,
  phoneClickedPrev: 0,
  whatsappOpenedPrev: 0,
  classicExposuresPrev: 0,
  classicClicksPrev: 0,
  uniqueVisitorsChange: null,
  interestedPeopleChange: null,
  highIntentActionsChange: null,
  profileViewsChange: null,
  directionsOpenedChange: null,
  phoneClickedChange: null,
  whatsappOpenedChange: null,
  classicExposuresChange: null,
  classicClicksChange: null,
  dailyProfileViews: null,
  dailyDirectionsOpened: null,
  dailyPhoneClicked: null,
  dailyWhatsappOpened: null,
  from: '2026-09-28',
  to: '2026-10-04',
  limitations: [],
  plan: 'elite'
} as unknown as AnalyticsOverviewData

const render = (showComparison?: boolean) =>
  renderToStaticMarkup(
    <AnalyticsOverview
      overviewState={{ status: 'ready', data }}
      showComparison={showComparison}
    />
  )

describe('AnalyticsOverview', () => {
  test('WEB-251: um visitante com duas ações é 100% de interesse, não 200%', () => {
    const html = render()
    expect(html).toContain('100.0%')
    expect(html).not.toContain('200.0%')
  })

  test('WEB-301: todo card compara com o período consultado', () => {
    const html = render()
    expect(html).not.toContain('30 dias anteriores')
    // Três cards de KPI e a entrega nos clássicos.
    expect(html.split('vs 7 dias anteriores')).toHaveLength(5)
  })

  test('WEB-263: "Tudo" não tem período anterior para comparar', () => {
    const html = render(false)
    expect(html).not.toContain('dias anteriores')
    expect(html).not.toContain('Comparado com')
  })

  test('WEB-302: o plano aparece pelo nome do catálogo', () => {
    expect(render()).toContain('Plano: Elite')
  })
})
