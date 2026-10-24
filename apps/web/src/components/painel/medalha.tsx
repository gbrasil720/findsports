import type { SubscriptionPlan } from '@findsports_oficial/db'

/*
 * Medalha do plano (`medal` de `w-p3.js`, Rodada 3): um chevron no Starter,
 * dois no Pro, estrela e dois chevrons no Elite. As cores (fundo, desenho e
 * contorno de cada plano, claro e escuro, e a versão sobre tinta) ficam em
 * `painel.css`, `.painel-medalha`.
 */

const ESTRELA =
  '12,2 12.91,4.35 15.42,4.49 13.47,6.08 14.12,8.51 12,7.15 9.88,8.51 10.53,6.08 8.58,4.49 11.09,4.35'

/** O chevron do design com o topo em `y`. */
const chevron = (y: number) => {
  const r = (v: number) => Math.round(v * 10) / 10
  return `5,${r(y + 5)} 12,${y} 19,${r(y + 5)} 19,${r(y + 8.2)} 12,${r(y + 3.2)} 5,${r(y + 8.2)}`
}

const DESENHO: Record<SubscriptionPlan, { cheio: string[]; meio: string[] }> = {
  starter: { cheio: [chevron(8)], meio: [] },
  pro: { cheio: [chevron(5)], meio: [chevron(11.4)] },
  elite: { cheio: [ESTRELA, chevron(10.4)], meio: [chevron(15.4)] }
}

export function Medalha({
  plano,
  tamanho = 44,
  sobreTinta,
  className
}: {
  plano: SubscriptionPlan
  tamanho?: number
  /** Em cima da superfície de tinta (o card escuro do plano): cores do escuro. */
  sobreTinta?: boolean
  className?: string
}) {
  const { cheio, meio } = DESENHO[plano]
  const lado = Math.round(tamanho * 0.74)
  return (
    <span
      className={className ? `painel-medalha ${className}` : 'painel-medalha'}
      data-plano={plano}
      data-sobre-tinta={sobreTinta || undefined}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: Math.round(tamanho * 0.24)
      }}
    >
      <svg width={lado} height={lado} viewBox="0 0 24 24" aria-hidden="true">
        {cheio.map((p) => (
          <polygon key={p} points={p} />
        ))}
        {meio.map((p) => (
          <polygon key={p} points={p} opacity={0.55} />
        ))}
      </svg>
    </span>
  )
}
