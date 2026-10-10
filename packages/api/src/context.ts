import { auth } from '@findsports_oficial/auth'

import { extrairIp } from './lib/client-ip'

type Session = Omit<typeof auth.$Infer.Session, 'user'> & {
  user: typeof auth.$Infer.Session.user & {
    role: 'fan' | 'pub' | 'admin'
    onboardingCompleted: boolean
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
    clientIp: extrairIp(req.headers),
    headers: req.headers
  }
}

/** `headers` é opcional só por causa do contexto montado à mão nos testes. */
export type Context = Omit<
  Awaited<ReturnType<typeof createContext>>,
  'headers'
> & { headers?: Headers }
