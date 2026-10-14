/** Cartola do Houdini: copa, faixa em meio-tom, aba curvada e a estrela. */
export function HatIcon({
  size = 24,
  sparkle = true
}: {
  size?: number
  sparkle?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 4.5c0-.8 2.2-1.5 5-1.5s5 .7 5 1.5L16.4 12.5H7.6Z" />
      <path d="M7.6 12.9H16.4L16.1 16.1H7.9Z" fillOpacity="0.5" />
      <path d="M2.5 16.4c0-.9 1-1.2 2.2-.9 2 .5 4.4.8 7.3.8s5.3-.3 7.3-.8c1.2-.3 2.2 0 2.2.9 0 1.6-4.3 3.3-9.5 3.3S2.5 18 2.5 16.4Z" />
      {sparkle ? (
        <path d="M20 1.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" />
      ) : null}
    </svg>
  )
}

export const ICON_PATHS = {
  home: 'M3 11 L12 4 L21 11 V20 H3 Z',
  users:
    'M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7 M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14c2.2 0.6 3.5 2.6 3.5 6',
  wand: 'M4 20 L15 9 M17 3v4 M15 5h4 M20 10v2 M19 11h2',
  ghost:
    'M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.3 2-2.4-2-2.4 2-2.3-2Z M9 11h1 M14 11h1',
  store: 'M3 9 L5 4 H19 L21 9 M4 9 V20 H20 V9 M9 20 V14 H15 V20',
  cal: 'M4 5h16v15H4Z M4 9h16 M8 3v4 M16 3v4',
  hourglass: 'M6 3h12 M6 21h12 M7 3l5 9 5-9 M7 21l5-9 5 9',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Z M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z',
  warn: 'M12 3 L22 20 H2 Z M12 10 V14 M12 17 V17.5',
  check: 'M5 12 L10 17 L19 7',
  mask: 'M3 6c3 1 6 1 9 0s6-1 9 0c0 6-3 11-9 11S3 12 3 6Z M8 10h2 M14 10h2',
  vanish: 'M12 3a9 9 0 1 0 0 18 M12 3a9 9 0 0 1 0 18 M3 12h4 M17 12h4',
  back: 'M9 14 L4 9 L9 4 M4 9h11a5 5 0 0 1 0 10h-3',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6'
} as const

export type IconName = keyof typeof ICON_PATHS

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7
}: {
  name: IconName
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
