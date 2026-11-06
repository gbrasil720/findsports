/*
 * Ícones da landing v3, os mesmos do protótipo (duotom, `currentColor` e o
 * ponto em `--spark`). Todos decorativos: quem lê é o texto ao lado.
 */

type IconProps = { size?: number }

function Svg({
  size = 18,
  children
}: {
  size?: number
  children: React.ReactNode
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function Arrow({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Check({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Pin({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        fillRule="evenodd"
        d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Tv({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect
        x="2.5"
        y="4"
        width="19"
        height="13"
        rx="2.5"
        fill="currentColor"
        opacity="0.3"
      />
      <rect
        x="8"
        y="18.6"
        width="8"
        height="2.4"
        rx="1.2"
        fill="currentColor"
      />
      <path d="M4.5 6.5h15v8h-15z" fill="currentColor" opacity="0.55" />
      <circle cx="18" cy="8.2" r="1.7" fill="var(--spark,#e8320c)" />
    </Svg>
  )
}

export function Beer({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
        fill="currentColor"
      />
      <circle cx="7.4" cy="5.6" r="2.6" fill="var(--spark,#e8320c)" />
      <circle cx="11" cy="4.6" r="2.9" fill="var(--spark,#e8320c)" />
      <circle cx="14.2" cy="5.8" r="2.3" fill="var(--spark,#e8320c)" />
    </Svg>
  )
}

export function People({ size }: IconProps) {
  return (
    <Svg size={size}>
      <g fill="currentColor" opacity="0.3">
        <circle cx="16.5" cy="8" r="3.4" />
        <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
      </g>
      <circle cx="9" cy="8" r="4" fill="currentColor" />
      <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" />
    </Svg>
  )
}

export function Calendar({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10H3z"
        fill="currentColor"
      />
      <rect x="7" y="2.5" width="2.4" height="5" rx="1.2" fill="currentColor" />
      <rect
        x="14.6"
        y="2.5"
        width="2.4"
        height="5"
        rx="1.2"
        fill="currentColor"
      />
      <rect
        x="13"
        y="13.5"
        width="4.5"
        height="4.5"
        rx="1"
        fill="var(--spark,#e8320c)"
      />
    </Svg>
  )
}

export function Search({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="m15.5 15.5 5 5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function Star() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
        fill="currentColor"
      />
    </svg>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {Array.from({ length: n }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: estrelas iguais, ordem fixa.
        <Star key={i} />
      ))}
    </span>
  )
}

export function Plus() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color: '#12120f' }}
    >
      <path
        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
        fill="currentColor"
      />
    </svg>
  )
}

export function Logo({ size = 30 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <circle
        cx="14"
        cy="14"
        r="10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
      />
      <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
    </svg>
  )
}
