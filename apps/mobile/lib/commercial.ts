import { authClient } from './auth-client'
import { env } from './env'

/**
 * Evento comercial do bar (visita ao perfil, rota, telefone), o mesmo que o
 * web manda para `/api/bar/commercial-event`: é o que aparece no painel que o
 * bar paga para ver. O servidor decide se conta (só torcedor, sem dono nem
 * admin). Sem garantia de entrega: falhar aqui não atrapalha a tela.
 */
export function trackCommercialEvent(payload: {
  pubId: string
  type: 'profile_view' | 'directions_opened' | 'phone_clicked'
}) {
  const cookie = authClient.getCookie()
  fetch(`${env.EXPO_PUBLIC_SERVER_URL}/api/bar/commercial-event`, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(payload)
  }).catch(() => {})
}
