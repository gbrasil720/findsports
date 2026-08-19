type Props = {
  description: string | null
}

/**
 * O que o bar diz de si.
 *
 * Fica no fim de propósito: quem chegou por um jogo já decidiu antes daqui, e
 * quem está explorando lê. É também onde cardápio e avaliações entram quando
 * existirem — a seção nasce como o lugar deles.
 */
export function BarAbout({ description }: Props) {
  if (!description) return null

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-3 text-2xl">Sobre o bar</h2>
      <p className="text-[var(--onside-ink)] text-sm leading-relaxed">
        {description}
      </p>
    </section>
  )
}
