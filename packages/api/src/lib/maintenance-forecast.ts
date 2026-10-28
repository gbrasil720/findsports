import { BRASILIA_TIME_ZONE } from '@findsports_oficial/db/event-window'

/**
 * WEB-466: a previsão de volta da manutenção como o app (26d) e o Houdini a
 * mostram: "23:30" e "Faltam cerca de 40 min". Pura e sem banco: o app a
 * importa.
 *
 * Sem previsão, previsão inválida ou já passada: `null`, e a tela não mostra
 * hora nem contagem (uma previsão vencida não é previsão).
 */
export function maintenanceForecast(
  backAt: string | null,
  now: number
): { time: string; left: string } | null {
  const at = backAt ? Date.parse(backAt) : Number.NaN
  if (!(at > now)) return null
  const minutes = Math.ceil((at - now) / 60_000)
  // "Cerca de": de 5 em 5 a partir de 10 min; abaixo disso, o minuto.
  const rounded = minutes < 10 ? minutes : Math.round(minutes / 5) * 5
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return {
    time: new Date(at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: BRASILIA_TIME_ZONE
    }),
    left:
      hours === 0
        ? `${rest} min`
        : rest === 0
          ? `${hours} h`
          : `${hours} h ${rest} min`
  }
}
