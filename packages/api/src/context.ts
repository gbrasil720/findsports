import { auth } from '@findsports_oficial/auth'

import { extrairIp } from './lib/client-ip'

type Session = Omit<typeof auth.$Infer.Session, 'user'> & {
  user: Omit<typeof auth.$Infer.Session.user, 'admittedAt'> & {
    role: 'fan' | 'pub' | 'admin'
    onboardingCompleted: boolean
    admittedAt?: Date | null
    searchRadiusKm: number
  }
}

export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({
    headers: req.headers
  })

  return {
    auth: null,
    session: session as Session | null,
    clientIp: extrairIp(req.headers)
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
