import { createFileRoute } from '@tanstack/react-router'
import { entradaHead } from '@/components/entrada/auth'
import { NoApp } from '@/components/entrada/no-app'

/*
 * O link de convite dos amigos do app (S1 do design do app mobile). Os amigos
 * não têm tela no web: esta página só existe porque link de WhatsApp não abre
 * `onside://` direto. É a página "está no app" sem bar (WEB-468), que no
 * celular tenta abrir o app no convite e, se não abrir, oferece o botão. O app
 * cuida do resto (`apps/mobile/app/convite/[code].tsx`).
 */

export const Route = createFileRoute('/convite/$code')({
  head: ({ params }) =>
    entradaHead({
      path: `/convite/${params.code}`,
      title: 'Convite de amigo — Onside',
      description: 'Abra no app da Onside para aceitar o convite.',
      indexable: false
    }),
  component: InvitePage
})

function InvitePage() {
  const { code } = Route.useParams()
  return <NoApp bar={null} convite={code} />
}
