import { auth } from '@findsports_oficial/auth'

type Session = typeof auth.$Infer.Session & {
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
    session: session as Session | null
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
