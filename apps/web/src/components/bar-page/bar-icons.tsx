/*
 * Ícones da página do bar, os do protótipo (os `ICONS` do app): duotom em
 * `currentColor`, o ponto em `--spark`. Decorativos: quem lê é o texto ao lado.
 */

const SPARK = 'var(--spark,#e8320c)'

const PATHS = {
  heart: (
    <>
      <path
        d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z"
        fill="currentColor"
      />
      <path
        d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        fill={SPARK}
      />
    </>
  ),
  share: (
    <>
      <path
        d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z"
        fill="currentColor"
      />
    </>
  ),
  star: (
    <path
      d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
      fill="currentColor"
    />
  ),
  tv: (
    <>
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
      <circle cx="18" cy="8.2" r="1.7" fill={SPARK} />
    </>
  ),
  sound: (
    <>
      <path
        d="M16 7.5a6 6 0 0 1 0 9M18.6 4.8a10 10 0 0 1 0 14.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.3"
      />
      <path d="M3 9h4l5-4.5v15L7 15H3z" fill="currentColor" />
    </>
  ),
  premiere: (
    <>
      <rect
        x="2.5"
        y="4.5"
        width="19"
        height="15"
        rx="3"
        fill="currentColor"
        opacity="0.3"
      />
      <path d="m10 8.4 6 3.6-6 3.6z" fill="currentColor" />
    </>
  ),
  outdoor: (
    <>
      <path
        d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"
        fill="currentColor"
        opacity="0.3"
      />
      <rect
        x="11"
        y="11"
        width="2.2"
        height="10"
        rx="1.1"
        fill="currentColor"
      />
      <path d="M3 12h18v1.4H3z" fill="currentColor" />
      <circle cx="12" cy="3.4" r="1.5" fill={SPARK} />
    </>
  ),
  beer: (
    <>
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
      <circle cx="7.4" cy="5.6" r="2.6" fill={SPARK} />
      <circle cx="11" cy="4.6" r="2.9" fill={SPARK} />
      <circle cx="14.2" cy="5.8" r="2.3" fill={SPARK} />
    </>
  ),
  pin: (
    <path
      fillRule="evenodd"
      d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
      fill="currentColor"
    />
  ),
  map: (
    <>
      <path
        d="M2.5 6.2 8.6 4l6.2 2.2L21 4v13.8L14.8 20l-6.2-2.2-6.1 2.2z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M15.2 4.6a3.9 3.9 0 0 1 3.9 3.9c0 2.9-3.9 6.9-3.9 6.9s-3.9-4-3.9-6.9a3.9 3.9 0 0 1 3.9-3.9z"
        fill="currentColor"
      />
      <circle cx="15.2" cy="8.5" r="1.45" fill={SPARK} />
    </>
  ),
  chat: (
    <>
      <path
        d="M12 3a9 9 0 0 1 0 18 9 9 0 0 1-4.3-1.1L3 21l1.2-4.4A9 9 0 0 1 12 3z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M8.6 7.6h1.6l1 2.4-1 1a6 6 0 0 0 2.8 2.8l1-1 2.4 1v1.6a1.4 1.4 0 0 1-1.4 1.4A7.8 7.8 0 0 1 7.2 9a1.4 1.4 0 0 1 1.4-1.4z"
        fill="currentColor"
      />
    </>
  ),
  phone: (
    <>
      <path
        d="M6.6 2.5h3.2l1.6 4.6-2.2 1.6a12 12 0 0 0 6.1 6.1l1.6-2.2 4.6 1.6v3.2a2.6 2.6 0 0 1-2.6 2.6C10.3 20 4 13.7 4 5.1a2.6 2.6 0 0 1 2.6-2.6z"
        fill="currentColor"
      />
      <circle cx="18.5" cy="5.5" r="2.6" fill={SPARK} />
    </>
  ),
  ext: (
    <>
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v2.4H6.4v11.2h11.2V13H20v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M13.5 4H20v6.5h-2.4V8.1l-6.3 6.3-1.7-1.7 6.3-6.3h-2.4z"
        fill="currentColor"
      />
    </>
  ),
  copy: (
    <>
      <rect
        x="8"
        y="8"
        width="12.5"
        height="12.5"
        rx="2.5"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M5.5 3.5h9A2 2 0 0 1 16.5 5.5V7h-2.4v-1.1H5.9v8.2H7v2.4H5.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
        fill="currentColor"
      />
    </>
  ),
  check: (
    <path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill="currentColor" />
  ),
  next: (
    <path
      d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z"
      fill="currentColor"
    />
  ),
  close: (
    <path
      d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
      fill="currentColor"
    />
  ),
  qr: (
    <>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="currentColor"
        opacity="0.3"
      />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="13.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="5.5" y="13.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="13.5" y="13.5" width="2.2" height="2.2" fill="currentColor" />
      <rect x="16.3" y="16.3" width="2.2" height="2.2" fill="currentColor" />
      <rect x="16.3" y="13.5" width="2.2" height="2.2" fill={SPARK} />
      <rect x="13.5" y="16.3" width="2.2" height="2.2" fill={SPARK} />
    </>
  ),
  ticket: (
    <>
      <path
        d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z"
        fill="currentColor"
      />
      <circle cx="8.6" cy="12" r="2" fill={SPARK} />
    </>
  ),
  people: (
    <>
      <g fill="currentColor" opacity="0.3">
        <circle cx="16.5" cy="8" r="3.4" />
        <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
      </g>
      <circle cx="9" cy="8" r="4" fill="currentColor" />
      <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" />
    </>
  ),
  calendar: (
    <>
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
      <rect x="13" y="13.5" width="4.5" height="4.5" rx="1" fill={SPARK} />
    </>
  )
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/** As características com ícone próprio; o resto leva o ponto. */
export const AMENITY_ICON: Partial<Record<number, IconName>> = {
  1: 'tv',
  2: 'sound',
  3: 'premiere',
  4: 'outdoor',
  13: 'beer',
  22: 'pin'
}
