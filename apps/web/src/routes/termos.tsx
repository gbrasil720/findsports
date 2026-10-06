import { createFileRoute } from '@tanstack/react-router'
import { legalHead } from '@/components/legal/legal-head'
import { LegalPage } from '@/components/legal/legal-page'
import { TERMOS_DE_USO } from '@/components/legal/termos-de-uso'

export const Route = createFileRoute('/termos')({
  head: () =>
    legalHead({
      path: '/termos',
      title: 'Termos de uso',
      description:
        'As regras da Onside para torcedores e estabelecimentos: conta, benefícios, avaliações, planos e responsabilidades.'
    }),
  component: () => <LegalPage document={TERMOS_DE_USO} />
})
