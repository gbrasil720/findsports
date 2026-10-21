import { APP_SCHEME } from '@findsports_oficial/auth/trusted-origins'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { pageHead } from '@/lib/page-head'

/*
 * O link de convite dos amigos do app (S1 do design do app mobile). Os amigos
 * não têm tela no web: esta página só existe porque link de WhatsApp não abre
 * `onside://` direto. Tenta abrir o app no convite e, se não abrir, oferece o
 * botão. O app cuida do resto (`apps/mobile/app/convite/[code].tsx`).
 */

export const Route = createFileRoute('/convite/$code')({
  head: ({ params }) =>
    pageHead({
      path: `/convite/${params.code}`,
      title: 'Convite de amigo — Onside',
      description: 'Abra no app da Onside para aceitar o convite.',
      indexable: false
    }),
  component: InvitePage
})

function InvitePage() {
  const { code } = Route.useParams()
  const appLink = `${APP_SCHEME}://convite/${encodeURIComponent(code)}`

  useEffect(() => {
    window.location.href = appLink
  }, [appLink])

  return (
    <OnboardingLayout>
      <OnboardingHeader label="Convite de amigo" />
      <main className="mx-auto grid max-w-xl gap-5 border border-[var(--onside-line)] bg-[var(--onside-paper)] p-6 text-[var(--onside-ink)] shadow-[8px_8px_0_var(--onside-acid)] sm:p-10">
        <p className="onside-kicker onside-kicker-live">Bora ver junto</p>
        <h1 className="onside-display text-4xl sm:text-5xl">
          TE CHAMARAM PARA A ONSIDE.
        </h1>
        <p className="text-[var(--onside-muted)] leading-relaxed">
          Abra no app para aceitar o convite. Se você ainda não tem conta, é só
          criar pelo app: quem entra pelo convite já vira amigo de quem chamou.
        </p>
        <div>
          <a href={appLink} className="onside-btn onside-btn-acid">
            Abrir no app
          </a>
        </div>
      </main>
    </OnboardingLayout>
  )
}
