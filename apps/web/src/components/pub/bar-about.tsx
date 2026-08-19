import { OwnerNudge } from './owner-notice'

type Props = {
  description: string | null
  isOwner: boolean
}

/**
 * O que o bar diz de si.
 *
 * Fica no fim de propósito: quem chegou por um jogo já decidiu antes daqui, e
 * quem está explorando lê. É também onde cardápio e avaliações entram quando
 * existirem — a seção nasce como o lugar deles.
 */
export function BarAbout({ description, isOwner }: Props) {
  if (!description && !isOwner) return null

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-3 text-2xl">Sobre o bar</h2>
      {description ? (
        <p className="text-[var(--onside-ink)] text-sm leading-relaxed">
          {description}
        </p>
      ) : (
        <OwnerNudge
          action={{ label: 'Escrever', to: '/admin', hash: 'admin-espaco' }}
        >
          Sem descrição, o torcedor que está explorando não sabe o que
          diferencia o seu bar dos outros da lista.
        </OwnerNudge>
      )}
    </section>
  )
}
