import { POLITICA_DE_PRIVACIDADE } from '@findsports_oficial/legal/politica-de-privacidade'
import { createFileRoute } from '@tanstack/react-router'
import { legalHead } from '@/components/legal/legal-head'
import { LegalPage } from '@/components/legal/legal-page'

export const Route = createFileRoute('/privacidade')({
  head: () =>
    legalHead({
      path: '/privacidade',
      title: 'Política de privacidade',
      description:
        'Quais dados a Onside coleta, por quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos.'
    }),
  component: () => <LegalPage document={POLITICA_DE_PRIVACIDADE} />
})
