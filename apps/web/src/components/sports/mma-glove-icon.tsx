/**
 * Luva de MMA (dedos abertos), no traço dos ícones do reicon que os outros
 * esportes usam: 24 px, linha de 1,5 px, pontas e cantos arredondados. O
 * reicon não tem ícone de luta; antes, o MMA aparecia como o texto "MMA".
 */
export function MmaGloveIcon({
  size = 24,
  color = 'currentColor',
  className,
  'aria-hidden': ariaHidden
}: {
  size?: number
  color?: string
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* O punho acolchoado. */}
      <path d="M8.5 2.75h7.25A4.25 4.25 0 0 1 20 7v4.5a4.5 4.5 0 0 1-4.5 4.5h-5a4 4 0 0 1-4-4V4.75a2 2 0 0 1 2-2Z" />
      {/* Os dedos saindo da luva aberta. */}
      <path d="M10.25 2.75v3.5M13.25 2.75v3.5M16.25 3v3.25" />
      {/* O polegar, colado na lateral. */}
      <path d="M6.5 9c-1.6 0-2.75 1.05-2.75 2.5S4.9 14 6.5 14" />
      {/* O punho do pulso, com a tira de velcro. */}
      <path d="M9 16v5.25h8V16M9 18.5h8" />
    </svg>
  )
}
