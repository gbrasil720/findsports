import { createFileRoute, redirect } from '@tanstack/react-router'
import { FAN_HOME } from '@/utils/auth-guards'

/**
 * `start_url` do manifest (WEB-72). O web é do bar: o dono abre no painel, e
 * quem não é bar vai à página do app (`FAN_HOME`). Está em
 * `AUTHENTICATED_PREFIXES`: abrir o ícone sem sessão cai no login.
 */
export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    throw redirect({
      to: context.session?.user.role === 'pub' ? '/admin' : FAN_HOME
    })
  }
})
