import { Icone } from '@/components/painel'

/**
 * Peças da avaliação no painel (2c, 1r; WEB-451): as estrelas e o quadrinho
 * de quem avaliou. Quem não se identificou aparece como "Anônimo", sem
 * iniciais: o quadrinho mostra o "voltaria" no lugar.
 */

/** Cinco estrelas, cheias até a nota (4,6 mostra quatro, como no design). */
export function Estrelas({
  nota,
  tamanho = 16
}: {
  nota: number
  tamanho?: number
}) {
  const cheias = Math.floor(nota)
  return (
    <span
      role="img"
      aria-label={`${nota.toLocaleString('pt-BR')} de 5 estrelas`}
      className="flex gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icone
          key={n}
          nome="star"
          tamanho={tamanho}
          style={{
            color: n <= cheias ? 'var(--painel-fg)' : 'var(--painel-track)'
          }}
        />
      ))}
    </span>
  )
}

/** "Marina Costa" vira "MC". */
export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const letras =
    partes.length > 1
      ? `${partes[0]?.[0] ?? ''}${partes.at(-1)?.[0] ?? ''}`
      : (partes[0] ?? '').slice(0, 2)
  return letras.toLocaleUpperCase('pt-BR')
}

export const nomeDeQuemAvaliou = (nome: string | null) => nome ?? 'Anônimo'
