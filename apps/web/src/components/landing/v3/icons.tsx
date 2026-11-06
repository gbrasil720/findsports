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

/* Os do painel do bar (WEB-501), dos `ICONS` do app. */

export function Ranking({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M2 11.5h6V21H2zM16 14h6v7h-6z"
        fill="currentColor"
        opacity="0.35"
      />
      <path d="M8.7 7.5h6.6V21H8.7z" fill="currentColor" />
      <path
        d="M12 1.1Q12.45 3.15 14.5 3.6Q12.45 4.05 12 6.1Q11.55 4.05 9.5 3.6Q11.55 3.15 12 1.1Z"
        fill="var(--spark,#e8320c)"
      />
    </Svg>
  )
}

export function Medal({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M6.5 2h4.2l2.4 6.2H8.9zM13.3 2h4.2l-2.4 6.2h-4.2z"
        fill="currentColor"
        opacity="0.35"
      />
      <circle cx="12" cy="15" r="6.6" fill="currentColor" />
      <path
        d="m12 11.6 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z"
        fill="var(--medal-star,#12120f)"
      />
    </Svg>
  )
}

export function Gear({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.3" />
      <path
        fillRule="evenodd"
        d="M10.6 2h2.8l.5 2.7 1.9.8 2.3-1.6 2 2-1.6 2.3.8 1.9 2.7.5v2.8l-2.7.5-.8 1.9 1.6 2.3-2 2-2.3-1.6-1.9.8-.5 2.7h-2.8l-.5-2.7-1.9-.8-2.3 1.6-2-2 1.6-2.3-.8-1.9L2 13.4v-2.8l2.7-.5.8-1.9-1.6-2.3 2-2 2.3 1.6 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Qr({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="currentColor"
        opacity="0.3"
      />
      <g fill="currentColor">
        <rect x="5.5" y="5.5" width="5" height="5" rx="1" />
        <rect x="13.5" y="5.5" width="5" height="5" rx="1" />
        <rect x="5.5" y="13.5" width="5" height="5" rx="1" />
        <rect x="13.5" y="13.5" width="2.2" height="2.2" />
        <rect x="16.3" y="16.3" width="2.2" height="2.2" />
      </g>
      <g fill="var(--spark,#e8320c)">
        <rect x="16.3" y="13.5" width="2.2" height="2.2" />
        <rect x="13.5" y="16.3" width="2.2" height="2.2" />
      </g>
    </Svg>
  )
}

export function Close({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Sound({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M16 7.5a6 6 0 0 1 0 9M18.6 4.8a10 10 0 0 1 0 14.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.3"
      />
      <path d="M3 9h4l5-4.5v15L7 15H3z" fill="currentColor" />
    </Svg>
  )
}

export function Share({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z"
        fill="currentColor"
      />
    </Svg>
  )
}

export function Sparkle({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M18.6 1.7Q19.3 4.7 22.3 5.4Q19.3 6.1 18.6 9.1Q17.9 6.1 14.9 5.4Q17.9 4.7 18.6 1.7Z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M10 5.4Q11.35 11.85 17.8 13.2Q11.35 14.55 10 21Q8.65 14.55 2.2 13.2Q8.65 11.85 10 5.4Z"
        fill="currentColor"
      />
      <path
        d="M19.2 15.1Q19.7 17.3 21.9 17.8Q19.7 18.3 19.2 20.5Q18.7 18.3 16.5 17.8Q18.7 17.3 19.2 15.1Z"
        fill="var(--spark,#e8320c)"
      />
    </Svg>
  )
}

/** O "+" de "Novo jogo", na cor do texto (o `Plus` da landing é tinta fixa). */
export function Add({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z"
        fill="currentColor"
      />
    </Svg>
  )
}
