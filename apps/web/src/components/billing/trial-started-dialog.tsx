import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { getPlan } from '@/lib/plan-catalog'

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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        initialFocus={startRef}
        className="onside-dialog flex max-w-[calc(100vw-2rem)] flex-col p-6 sm:max-w-lg"
      >
        <p className="onside-kicker onside-kicker-live">Teste grátis</p>
        <DialogTitle className="onside-display text-2xl">
          Seu bar está no ar com o {name} grátis.
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--onside-ink)] text-sm">
          O teste vai até {date}, sem cartão e sem cobrança. Nesse período você
          pode trocar de plano quantas vezes quiser. Contratar só é preciso para
          continuar depois do teste.
        </DialogDescription>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            ref={startRef}
            to="/admin"
            className="onside-btn onside-btn-acid"
          >
            Começar o teste
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="onside-btn onside-btn-outline"
          >
            Ver os planos
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
