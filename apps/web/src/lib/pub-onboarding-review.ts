import {
  groupOpeningHours,
  type OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'
import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'

/** `titulo` e `tint` são as duas linhas do título; a segunda em destaque. */
type Review = { titulo: string; tint: string; texto: string; botao: string }

/**
 * O que o último passo do cadastro de bar promete (WEB-238): concluir publica
 * o bar e já dá o plano do teste grátis.
 *
 * A promessa segue o que acontece de fato ao continuar. Sem e-mail confirmado
 * o cadastro só é enviado de `/verify-email`: o bar entra no ar depois da
 * confirmação, e de lá o dono vai sempre para `/plan`. Com o e-mail
 * confirmado, quem veio de um link (`callbackUrl`) volta para ele, sem passar
 * pelos planos.
 */
export function getPubOnboardingReview({
  emailVerified,
  goesToPlan
}: {
  emailVerified: boolean
  goesToPlan: boolean
}): Review {
  const oferta = `seu bar entra no ar e você ganha o plano ${PLAN_NAMES[ONBOARDING_TRIAL.plan]} grátis por ${ONBOARDING_TRIAL.days} dias, sem cartão.`
  if (!emailVerified) {
    return {
      titulo: 'Falta só',
      tint: 'confirmar seu e-mail',
      texto: `Revise os dados do bar. Ao continuar, você confirma seu e-mail. Depois disso salvamos o cadastro, ${oferta} Em seguida você conhece os planos.`,
      botao: 'Confirmar meu e-mail'
    }
  }
  return {
    titulo: 'Pronto para colocar',
    tint: 'seu bar no ar',
    texto: `Revise os dados do bar. Ao continuar, salvamos o cadastro, ${oferta}${goesToPlan ? ' Em seguida você conhece os planos.' : ''}`,
    botao: 'Colocar meu bar no ar'
  }
}

const horaCurta = (hora: string) =>
  hora.endsWith(':00') ? hora.slice(0, 2) : hora

/**
 * A linha "Horário" da Revisão (4q): "Seg a qui 17–00 · Sex e sáb 17–02 ·
 * Dom 12–22". Agrupa como a página do bar (`groupOpeningHours`); dia fechado
 * não aparece. `null` sem horário.
 */
export function resumoDoHorario(hours: OpeningHours | null): string | null {
  if (!hours?.some(Boolean)) return null
  return groupOpeningHours(hours)
    .flatMap(({ days, hours: faixa }) => {
      if (!faixa) return []
      const [abre = '', fecha = ''] = faixa.split(' – ')
      // Dia sozinho vem por extenso ("Domingo"); a linha usa a sigla.
      const dias = days.includes(' ') ? days : days.slice(0, 3)
      return `${dias} ${horaCurta(abre)}–${horaCurta(fecha)}`
    })
    .join(' · ')
}
