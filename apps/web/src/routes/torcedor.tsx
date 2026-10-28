import { createFileRoute } from '@tanstack/react-router'
import { entradaHead } from '@/components/entrada/auth'
import { NoApp, SEM_BAR_HEAD } from '@/components/entrada/no-app'

/**
 * Onde o torcedor cai no web (`FAN_HOME`, em `utils/auth-guards.ts`): o web é
 * só para bares e a Onside de torcedor está no app (decisão do dono,
 * 24/10/2026). É o layout de `/pub/$pubId` sem o cartão do bar. Pública:
 * é também o "Baixar →" do card "É torcedor?" do login e do cadastro.
 */
export const Route = createFileRoute('/torcedor')({
  head: () =>
    entradaHead({
      path: '/torcedor',
      ...SEM_BAR_HEAD,
      indexable: false
    }),
  component: () => <NoApp bar={null} />
})
