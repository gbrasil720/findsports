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

    // Por `auth.api`, e não por `auth.handler`: o login HTTP exige o token do
    // Turnstile (plugin `captcha`), que esta chamada do servidor não tem. Pelo
    // mesmo motivo o rate limit de login não conta aqui — o convite é de uso
    // único e a senha acabou de ser definida. Os headers do cliente vão junto
    // para a sessão gravar IP e user agent dele.
    //
    // WEB-247: o cookie da sessão vai na própria resposta do better-auth
    // (`asResponse`), e não pelo `tanstackStartCookies`. No bundle do Worker o
    // `import()` dinâmico do plugin resolve para o chunk de entrada, que não
    // exporta `setCookie`, e o `catch {}` dele engole o erro: a sessão era
    // criada no banco e o `Set-Cookie` nunca saía. No `vite dev` o plugin
    // funciona, então lá o cookie sai repetido, com o mesmo valor.
    const signedIn = await auth.api
      .signInEmail({
        body: {
          email: result.email,
          password: parsed.data.password,
          rememberMe: true
        },
        headers: request.headers,
        asResponse: true
      })
      .catch((error: unknown) => error)
    if (signedIn instanceof Response && signedIn.ok) return signedIn

    // A conta já está ativada; sem sessão, o formulário manda para o login.
    console.error(
      JSON.stringify({
        event: 'waitlist_activation_signin_failed',
        status: signedIn instanceof Response ? signedIn.status : undefined,
        error: signedIn instanceof Error ? signedIn.message : undefined
      })
    )
    return Response.json({ existingAccount: true, activated: true })
  } catch (error) {
    if (error instanceof InvalidWaitlistInviteError) {
      return Response.json(
        { message: 'Este link não é válido ou já expirou.' },
        { status: 400 }
      )
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
