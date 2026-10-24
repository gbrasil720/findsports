import type { SubscriptionPlan } from '@findsports_oficial/db'
import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { Botao, propsBotao } from '@/components/painel'
import { getPlan } from '@/lib/plan-catalog'
import { Medalha, PainelModal } from './planos'

/**
 * Chegada em `/plan` logo depois do cadastro do bar. O primeiro dono leu o
 * aviso do topo como enfeite e clicou em "Contratar" achando que era o teste:
 * o teste já começou no cadastro, e o diálogo diz isso antes dos planos.
 */
export function TrialStartedDialog({
  plan,
  until,
  onClose
}: {
  plan: SubscriptionPlan
  until: string | Date
  onClose: () => void
}) {
  const startRef = useRef<HTMLAnchorElement>(null)
  const name = getPlan(plan).name
  const date = new Date(until).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <PainelModal
      titulo={`Seu bar está no ar com o ${name} grátis.`}
      tamanhoTitulo={30}
      icone={<Medalha plano={plan} tamanho={52} />}
      inicio={startRef}
      onClose={onClose}
    >
      <p className="text-[15px] text-[var(--painel-muted)] leading-normal">
        O teste vai até {date}, sem cartão e sem cobrança. Nesse período você
        pode trocar de plano quantas vezes quiser. Contratar só é preciso para
        continuar depois do teste.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Link
          ref={startRef}
          to="/admin"
          {...propsBotao({ variante: 'acid', altura: 48 }, '!flex-1')}
        >
          Começar o teste
        </Link>
        <Botao altura={48} className="!flex-1" onClick={onClose}>
          Ver os planos
        </Botao>
      </div>
    </PainelModal>
  )
}
