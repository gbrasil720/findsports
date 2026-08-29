import {
  activateWaitlistInvite,
  InvalidWaitlistInviteError
} from '@findsports_oficial/api/lib/waitlist-activation'
import { auth } from '@findsports_oficial/auth'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const bodySchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(128)
})

async function activate(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ message: 'Confira nome e senha.' }, { status: 400 })
  }

  try {
    const result = await activateWaitlistInvite(parsed.data)
    if (result.existingAccount) {
      return Response.json({ existingAccount: true })
    }

    const signInRequest = new Request(
      new URL('/api/auth/sign-in/email', request.url),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: new URL(request.url).origin
        },
        body: JSON.stringify({
          email: result.email,
          password: parsed.data.password,
          rememberMe: true
        })
      }
    )
    const signInResponse = await auth.handler(signInRequest)
    return signInResponse.ok
      ? signInResponse
      : Response.json({ existingAccount: true, activated: true })
  } catch (error) {
    if (error instanceof InvalidWaitlistInviteError) {
      return Response.json({ message: error.message }, { status: 400 })
    }
    console.error(JSON.stringify({ event: 'waitlist_activation_failed' }))
    return Response.json(
      { message: 'Não foi possível ativar a conta. Tente novamente.' },
      { status: 500 }
    )
  }
}

export const Route = createFileRoute('/api/waitlist/activate')({
  server: { handlers: { POST: ({ request }) => activate(request) } }
})
