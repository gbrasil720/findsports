/**
 * Oferta da casa no perfil público (WEB-120).
 *
 * O servidor só manda o texto quando o bar tem Elite vigente, então a regra de
 * plano não mora aqui: `null` quer dizer "não mostre", seja porque o bar não
 * escreveu nada, seja porque perdeu o plano. Sem oferta, a seção não existe —
 * nem para o dono, porque a prévia é a página como o torcedor vê.
 *
 * A linha de rodapé é o que separa a promessa do bar de uma promessa da
 * Onside: a plataforma não define nem confere o conteúdo.
 */
export function HouseOfferSection({ offer }: { offer: string | null }) {
  if (!offer) return null

  return (
    <section
      className="onside-panel border-l-[6px] border-l-[var(--onside-acid)] p-5 md:p-6"
      aria-labelledby="bar-house-offer-title"
    >
      <p className="onside-kicker mb-2">Para quem chega pela Onside</p>
      <h2 id="bar-house-offer-title" className="onside-display mb-3 text-2xl">
        Oferta da casa
      </h2>
      <p className="text-[var(--onside-ink)] text-base leading-relaxed [overflow-wrap:anywhere]">
        {offer}
      </p>
      <p className="mt-4 text-[var(--onside-muted)] text-xs">
        Oferta definida e cumprida pelo estabelecimento.
      </p>
    </section>
  )
}
