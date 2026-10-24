import type { CSSProperties, ReactNode } from 'react'

/**
 * Ícones duotom do design do painel (`Q` em `w-core.js` do projeto "Bar Web"):
 * base em `currentColor` com opacidade, desenho em `currentColor` e acento na
 * cor de destaque do tema (vermelho no claro, acid no escuro).
 */
const ICONES = {
  map: {
    b: (
      <>
        <path d="M2.5 6.2 8.6 4l6.2 2.2L21 4v13.8L14.8 20l-6.2-2.2-6.1 2.2z" />
      </>
    ),
    d: (
      <>
        <path d="M15.2 4.6a3.9 3.9 0 0 1 3.9 3.9c0 2.9-3.9 6.9-3.9 6.9s-3.9-4-3.9-6.9a3.9 3.9 0 0 1 3.9-3.9z" />
      </>
    ),
    a: (
      <>
        <circle cx="15.2" cy="8.5" r="1.45" />
      </>
    )
  },
  heart: {
    b: (
      <>
        <path d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z" />
      </>
    ),
    d: (
      <>
        <path d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z" />
      </>
    ),
    a: null
  },
  medal: {
    b: (
      <>
        <path d="M6.5 2h4.2l2.4 6.2H8.9zM13.3 2h4.2l-2.4 6.2h-4.2z" />
      </>
    ),
    d: (
      <>
        <circle cx="12" cy="15" r="6.6" />
      </>
    ),
    a: (
      <>
        <path d="m12 11.6 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" />
      </>
    )
  },
  ticket: {
    b: (
      <>
        <path d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z" />
      </>
    ),
    d: (
      <>
        <path d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z" />
      </>
    ),
    a: (
      <>
        <circle cx="8.6" cy="12" r="2" />
      </>
    )
  },
  cal: {
    b: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
      </>
    ),
    d: (
      <>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10H3z" />
        <rect x="7" y="2.5" width="2.4" height="5" rx="1.2" />
        <rect x="14.6" y="2.5" width="2.4" height="5" rx="1.2" />
      </>
    ),
    a: (
      <>
        <rect x="13" y="13.5" width="4.5" height="4.5" rx="1" />
      </>
    )
  },
  beer: {
    b: (
      <>
        <path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" />
        <path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" />
      </>
    ),
    d: (
      <>
        <path d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" />
      </>
    ),
    a: (
      <>
        <circle cx="7.4" cy="5.6" r="2.6" />
        <circle cx="11" cy="4.6" r="2.9" />
        <circle cx="14.2" cy="5.8" r="2.3" />
      </>
    )
  },
  code: {
    b: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </>
    ),
    d: (
      <>
        <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
        <rect x="13.5" y="5.5" width="5" height="5" rx="1" />
        <rect x="5.5" y="13.5" width="5" height="5" rx="1" />
        <rect x="13.5" y="13.5" width="2.2" height="2.2" />
        <rect x="16.3" y="16.3" width="2.2" height="2.2" />
      </>
    ),
    a: (
      <>
        <rect x="16.3" y="13.5" width="2.2" height="2.2" />
        <rect x="13.5" y="16.3" width="2.2" height="2.2" />
      </>
    )
  },
  search: {
    b: (
      <>
        <circle cx="10.5" cy="10.5" r="7" />
      </>
    ),
    d: (
      <>
        <path
          fillRule="evenodd"
          d="M10.5 2.5a8 8 0 0 1 6.3 12.9l4.4 4.4-1.6 1.6-4.4-4.4A8 8 0 1 1 10.5 2.5zm0 2.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z"
        />
      </>
    ),
    a: null
  },
  bell: {
    b: (
      <>
        <path d="M5 17V11a7 7 0 0 1 14 0v6l1.6 2H3.4z" />
      </>
    ),
    d: (
      <>
        <path d="M9.4 20a2.6 2.6 0 0 0 5.2 0z" />
        <path d="M3.4 19 5 17h14l1.6 2z" />
      </>
    ),
    a: (
      <>
        <circle cx="18" cy="5.5" r="3.2" />
      </>
    )
  },
  sliders: {
    b: (
      <>
        <rect x="3" y="5.5" width="18" height="3" rx="1.5" />
        <rect x="3" y="15.5" width="18" height="3" rx="1.5" />
      </>
    ),
    d: (
      <>
        <circle cx="15.5" cy="7" r="3.2" />
      </>
    ),
    a: (
      <>
        <circle cx="8.5" cy="17" r="3.2" />
      </>
    )
  },
  share: {
    b: (
      <>
        <path d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z" />
      </>
    ),
    d: (
      <>
        <path d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z" />
      </>
    ),
    a: null
  },
  back: {
    b: null,
    d: (
      <>
        <path d="M15.6 3.4 17.4 5.2 10.6 12l6.8 6.8-1.8 1.8L7 12z" />
      </>
    ),
    a: null
  },
  x: {
    b: null,
    d: (
      <>
        <path d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z" />
      </>
    ),
    a: null
  },
  gear: {
    b: (
      <>
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    d: (
      <>
        <path
          fillRule="evenodd"
          d="M10.6 2h2.8l.5 2.7 1.9.8 2.3-1.6 2 2-1.6 2.3.8 1.9 2.7.5v2.8l-2.7.5-.8 1.9 1.6 2.3-2 2-2.3-1.6-1.9.8-.5 2.7h-2.8l-.5-2.7-1.9-.8-2.3 1.6-2-2 1.6-2.3-.8-1.9L2 13.4v-2.8l2.7-.5.8-1.9-1.6-2.3 2-2 2.3 1.6 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"
        />
      </>
    ),
    a: null
  },
  tv: {
    b: (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
      </>
    ),
    d: (
      <>
        <rect x="8" y="18.6" width="8" height="2.4" rx="1.2" />
        <path d="M4.5 6.5h15v8h-15z" opacity=".55" />
      </>
    ),
    a: (
      <>
        <circle cx="18" cy="8.2" r="1.7" />
      </>
    )
  },
  sun: {
    b: (
      <>
        <path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z" />
      </>
    ),
    d: (
      <>
        <rect x="11" y="11" width="2.2" height="10" rx="1.1" />
        <path d="M3 12h18v1.4H3z" />
      </>
    ),
    a: (
      <>
        <circle cx="12" cy="3.4" r="1.5" />
      </>
    )
  },
  people: {
    b: (
      <>
        <circle cx="16.5" cy="8" r="3.4" />
        <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
      </>
    ),
    d: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 20.5a7 7 0 0 1 14 0z" />
      </>
    ),
    a: null
  },
  check: {
    b: null,
    d: (
      <>
        <path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" />
      </>
    ),
    a: null
  },
  spark: {
    b: (
      <>
        <path d="M18.5 13.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
      </>
    ),
    d: (
      <>
        <path d="M10 2.5l2.2 6.1 6.1 2.2-6.1 2.2L10 19.2l-2.2-6.2-6.1-2.2 6.1-2.2z" />
      </>
    ),
    a: null
  },
  star: {
    b: null,
    d: (
      <>
        <path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
      </>
    ),
    a: null
  },
  chat: {
    b: (
      <>
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4h.5A2.5 2.5 0 0 1 3 14.5z" />
      </>
    ),
    d: (
      <>
        <circle cx="8" cy="10" r="1.6" />
        <circle cx="12" cy="10" r="1.6" />
        <circle cx="16" cy="10" r="1.6" />
      </>
    ),
    a: null
  },
  up: {
    b: null,
    d: (
      <>
        <path d="M12 3.5 19 10.5l-1.7 1.7-4.1-4.1V20.5h-2.4V8.1l-4.1 4.1L5 10.5z" />
      </>
    ),
    a: null
  },
  pin: {
    b: null,
    d: (
      <>
        <path
          fillRule="evenodd"
          d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
        />
      </>
    ),
    a: null
  },
  fire: {
    b: (
      <>
        <path d="M12 22a7 7 0 0 1-7-7c0-4.6 3.5-6 3.5-10.5 3.5 2.3 4.7 4.7 4.7 7 1.2-1.2 1.7-2.3 1.7-3.5C17.2 10.3 19 12.6 19 15a7 7 0 0 1-7 7z" />
      </>
    ),
    d: (
      <>
        <path d="M12 22a3.6 3.6 0 0 1-3.6-3.6c0-2.4 1.8-3.4 2.4-5.4 2.6 1.5 4.8 3 4.8 5.4A3.6 3.6 0 0 1 12 22z" />
      </>
    ),
    a: null
  },
  right: {
    b: null,
    d: (
      <>
        <path d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z" />
      </>
    ),
    a: null
  },
  down: {
    b: null,
    d: (
      <>
        <path d="M3.4 8.4 5.2 6.6 12 13.4l6.8-6.8 1.8 1.8L12 17z" />
      </>
    ),
    a: null
  },
  card: {
    b: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2.5" />
      </>
    ),
    d: (
      <>
        <path d="M2 8.4h20v3H2z" />
      </>
    ),
    a: (
      <>
        <rect x="5" y="14.4" width="5" height="2.2" rx="1" />
      </>
    )
  },
  doc: {
    b: (
      <>
        <path d="M5 2.5h9.5L19 7v14.5H5z" />
      </>
    ),
    d: (
      <>
        <path d="M14.5 2.5V7H19zM8 11h8v2H8zM8 15h6v2H8z" />
      </>
    ),
    a: null
  },
  bolt: {
    b: null,
    d: (
      <>
        <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" />
      </>
    ),
    a: null
  },
  plus: {
    b: null,
    d: (
      <>
        <path d="M10.8 4h2.4v6.8H20v2.4h-6.8V20h-2.4v-6.8H4v-2.4h6.8z" />
      </>
    ),
    a: null
  },
  lock: {
    b: (
      <>
        <rect x="4" y="10" width="16" height="11.5" rx="2.5" />
      </>
    ),
    d: (
      <>
        <path
          fillRule="evenodd"
          d="M12 2.5a5 5 0 0 1 5 5V10h-2.4V7.5a2.6 2.6 0 0 0-5.2 0V10H7V7.5a5 5 0 0 1 5-5z"
        />
      </>
    ),
    a: (
      <>
        <rect x="10.8" y="14" width="2.4" height="4" rx="1.2" />
      </>
    )
  },
  phone: {
    b: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
      </>
    ),
    d: (
      <>
        <rect x="9.5" y="18" width="5" height="1.6" rx=".8" />
      </>
    ),
    a: null
  },
  photo: {
    b: (
      <>
        <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      </>
    ),
    d: (
      <>
        <path d="M2.5 17.5 8 12l4 4 3-3 6.5 6.5v.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
      </>
    ),
    a: (
      <>
        <circle cx="16.5" cy="8.5" r="2" />
      </>
    )
  }
} satisfies Record<string, { b: ReactNode; d: ReactNode; a: ReactNode }>

export type IconeNome = keyof typeof ICONES

type Props = {
  nome: IconeNome
  tamanho?: number
  /** Cor do acento; o padrão é a de destaque do tema (`--painel-acc`). */
  acento?: string
  /** Opacidade da base; o padrão segue o tema (`--painel-icone-base`). */
  base?: number
  className?: string
  style?: CSSProperties
}

export function Icone({
  nome,
  tamanho = 20,
  acento = 'var(--painel-acc)',
  base,
  className,
  style
}: Props) {
  const { b, d, a } = ICONES[nome]
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ? `painel-icone ${className}` : 'painel-icone'}
      style={style}
    >
      {b ? (
        <g
          fill="currentColor"
          style={{ opacity: base ?? 'var(--painel-icone-base)' }}
        >
          {b}
        </g>
      ) : null}
      <g fill="currentColor">{d}</g>
      {/* `var()` não vale em atributo de apresentação do SVG: vai no `style`. */}
      {a ? <g style={{ fill: acento }}>{a}</g> : null}
    </svg>
  )
}
