/*
 * Os ícones do web do torcedor (WEB-501): o conjunto do protótipo
 * `docs/design/redesign-2026-11/torcedor` (o mesmo do app, duotom, 24 × 24),
 * copiado do `IC` dele. O acento é `--spark`: vermelho no claro, acid no
 * escuro e sobre tinta.
 */

const IC = {
  arrowUp:
    '<path d="M12 3.5 19 10.5l-1.7 1.7-4.1-4.1V20.5h-2.4V8.1l-4.1 4.1L5 10.5z" fill="currentColor" />',
  back: '<path d="M15.6 3.4 17.4 5.2 10.6 12l6.8 6.8-1.8 1.8L7 12z" fill="currentColor" />',
  bar: '<g fill="currentColor" opacity="0.3"> <path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" /> <path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" /> </g> <path d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" fill="currentColor" /> <g fill="var(--spark,#e8320c)"> <circle cx="7.4" cy="5.6" r="2.6" /> <circle cx="11" cy="4.6" r="2.9" /> <circle cx="14.2" cy="5.8" r="2.3" /> </g>',
  beer: '<path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" fill="currentColor" opacity="0.3" /> <path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" fill="currentColor" opacity="0.3" /> <path d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" fill="currentColor" /> <circle cx="7.4" cy="5.6" r="2.6" fill="var(--spark,#e8320c)" /> <circle cx="11" cy="4.6" r="2.9" fill="var(--spark,#e8320c)" /> <circle cx="14.2" cy="5.8" r="2.3" fill="var(--spark,#e8320c)" />',
  bell: '<path d="M5 17V11a7 7 0 0 1 14 0v6l1.6 2H3.4z" fill="currentColor" opacity="0.3" /> <path d="M9.4 20a2.6 2.6 0 0 0 5.2 0z" fill="currentColor" /> <path d="M3.4 19 5 17h14l1.6 2z" fill="currentColor" /> <circle cx="18" cy="5.5" r="3.2" fill="var(--spark,#e8320c)" />',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="currentColor" opacity="0.3" /> <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10H3z" fill="currentColor" /> <rect x="7" y="2.5" width="2.4" height="5" rx="1.2" fill="currentColor" /> <rect x="14.6" y="2.5" width="2.4" height="5" rx="1.2" fill="currentColor" /> <rect x="13" y="13.5" width="4.5" height="4.5" rx="1" fill="var(--spark,#e8320c)" />',
  camera:
    '<path fill-rule="evenodd" d="M8.6 4h6.8l1.5 2.4H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.4a2 2 0 0 1 2-2h3.1zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="currentColor" />',
  check:
    '<path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill="currentColor" />',
  close:
    '<path d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z" fill="currentColor" />',
  crew: '<g fill="currentColor" opacity="0.35"> <circle cx="4.8" cy="9" r="2.6" /> <circle cx="19.2" cy="9" r="2.6" /> <path d="M.8 18.5a4 4 0 0 1 7.2-2.4V18.5zM23.2 18.5a4 4 0 0 0-7.2-2.4V18.5z" /> </g> <circle cx="12" cy="7.6" r="3.6" fill="currentColor" /> <path d="M5.8 20.5a6.2 6.2 0 0 1 12.4 0z" fill="currentColor" /> <circle cx="19.6" cy="3.4" r="2" fill="var(--spark,#e8320c)" />',
  doc: '<path d="M5 2.5h9.5L19 7v14.5H5z" fill="currentColor" opacity="0.35" /> <path d="M14.5 2.5V7H19zM8 11h8v2H8zM8 15h6v2H8z" fill="currentColor" />',
  eye: '<path d="M12 5c5.2 0 9 4.4 10 7-1 2.6-4.8 7-10 7S3 14.6 2 12c1-2.6 4.8-7 10-7z" fill="currentColor" opacity="0.3" /> <circle cx="12" cy="12" r="3.6" fill="currentColor" />',
  fan: '<path d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z" fill="currentColor" opacity="0.3" /> <path d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z" fill="currentColor" /> <path d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" fill="var(--spark,#e8320c)" />',
  fire: '<path d="M12 22a7 7 0 0 1-7-7c0-4.6 3.5-6 3.5-10.5 3.5 2.3 4.7 4.7 4.7 7 1.2-1.2 1.7-2.3 1.7-3.5C17.2 10.3 19 12.6 19 15a7 7 0 0 1-7 7z" fill="currentColor" opacity="0.3" /> <path d="M12 22a3.6 3.6 0 0 1-3.6-3.6c0-2.4 1.8-3.4 2.4-5.4 2.6 1.5 4.8 3 4.8 5.4A3.6 3.6 0 0 1 12 22z" fill="currentColor" />',
  gear: '<circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.3" /> <path fill-rule="evenodd" d="M10.6 2h2.8l.5 2.7 1.9.8 2.3-1.6 2 2-1.6 2.3.8 1.9 2.7.5v2.8l-2.7.5-.8 1.9 1.6 2.3-2 2-2.3-1.6-1.9.8-.5 2.7h-2.8l-.5-2.7-1.9-.8-2.3 1.6-2-2 1.6-2.3-.8-1.9L2 13.4v-2.8l2.7-.5.8-1.9-1.6-2.3 2-2 2.3 1.6 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="currentColor" />',
  heart:
    '<path d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z" fill="currentColor" opacity="0.3" /> <path d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z" fill="currentColor" /> <path d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" fill="var(--spark,#e8320c)" />',
  link: '<path d="M14.5 6.5H17a5.5 5.5 0 0 1 0 11h-2.5v-2.6H17a2.9 2.9 0 0 0 0-5.8h-2.5z" fill="currentColor" opacity="0.35" /> <path d="M9.5 6.5H7a5.5 5.5 0 0 0 0 11h2.5v-2.6H7a2.9 2.9 0 0 1 0-5.8h2.5z" fill="currentColor" /> <rect x="7.6" y="10.7" width="8.8" height="2.6" rx="1.3" fill="var(--spark,#e8320c)" />',
  lock: '<rect x="4" y="10" width="16" height="11.5" rx="2.5" fill="currentColor" opacity="0.3" /> <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10h-2.4V7.5a2.1 2.1 0 0 0-4.2 0V10z" fill="currentColor" /> <circle cx="12" cy="15.6" r="2" fill="var(--spark,#e8320c)" />',
  mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="currentColor" opacity="0.3" /> <path d="m3.2 6.6 8.8 6.4 8.8-6.4v2.6L12 15.6 3.2 9.2z" fill="currentColor" />',
  map: '<path d="M2.5 6.2 8.6 4l6.2 2.2L21 4v13.8L14.8 20l-6.2-2.2-6.1 2.2z" fill="currentColor" opacity="0.3" /> <path d="M15.2 4.6a3.9 3.9 0 0 1 3.9 3.9c0 2.9-3.9 6.9-3.9 6.9s-3.9-4-3.9-6.9a3.9 3.9 0 0 1 3.9-3.9z" fill="currentColor" /> <circle cx="15.2" cy="8.5" r="1.45" fill="var(--spark,#e8320c)" />',
  medal:
    '<path d="M6.5 2h4.2l2.4 6.2H8.9zM13.3 2h4.2l-2.4 6.2h-4.2z" fill="currentColor" opacity="0.35" /> <circle cx="12" cy="15" r="6.6" fill="currentColor" /> <path d="m12 11.6 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#12120f" />',
  next: '<path d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z" fill="currentColor" />',
  outdoor:
    '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z" fill="currentColor" opacity="0.3" /> <rect x="11" y="11" width="2.2" height="10" rx="1.1" fill="currentColor" /> <path d="M3 12h18v1.4H3z" fill="currentColor" /> <circle cx="12" cy="3.4" r="1.5" fill="var(--spark,#e8320c)" />',
  people:
    '<g fill="currentColor" opacity="0.3"> <circle cx="16.5" cy="8" r="3.4" /> <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" /> </g> <circle cx="9" cy="8" r="4" fill="currentColor" /> <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" />',
  person:
    '<path d="M3.5 21a8.5 8.5 0 0 1 17 0z" fill="currentColor" opacity="0.3" /> <circle cx="12" cy="8" r="4.6" fill="currentColor" />',
  pin: '<path fill-rule="evenodd" d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z" fill="currentColor" />',
  plus: '<path d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z" fill="currentColor" />',
  premiere:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="3" fill="currentColor" opacity="0.3" /> <path d="m10 8.4 6 3.6-6 3.6z" fill="currentColor" />',
  qr: '<rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.3" /> <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" /> <rect x="13.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" /> <rect x="5.5" y="13.5" width="5" height="5" rx="1" fill="currentColor" /> <rect x="13.5" y="13.5" width="2.2" height="2.2" fill="currentColor" /> <rect x="16.3" y="16.3" width="2.2" height="2.2" fill="currentColor" /> <rect x="16.3" y="13.5" width="2.2" height="2.2" fill="var(--spark,#e8320c)" /> <rect x="13.5" y="16.3" width="2.2" height="2.2" fill="var(--spark,#e8320c)" />',
  ranking:
    '<path d="M2 11.5h6V21H2zM16 14h6v7h-6z" fill="currentColor" opacity="0.35" /> <path d="M8.7 7.5h6.6V21H8.7z" fill="currentColor" /> <path d="M12 1.1Q12.45 3.15 14.5 3.6Q12.45 4.05 12 6.1Q11.55 4.05 9.5 3.6Q11.55 3.15 12 1.1Z" fill="var(--spark,#e8320c)" />',
  search:
    '<circle cx="10.5" cy="10.5" r="7" fill="currentColor" opacity="0.3" /> <path fill-rule="evenodd" d="M10.5 2.5a8 8 0 0 1 6.3 12.9l4.4 4.4-1.6 1.6-4.4-4.4A8 8 0 1 1 10.5 2.5zm0 2.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z" fill="currentColor" />',
  share:
    '<path d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z" fill="currentColor" opacity="0.3" /> <path d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z" fill="currentColor" />',
  shield:
    '<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10.2z" fill="currentColor" opacity="0.35" /> <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10.2z" fill="currentColor" />',
  sound:
    '<path d="M16 7.5a6 6 0 0 1 0 9M18.6 4.8a10 10 0 0 1 0 14.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.3" /> <path d="M3 9h4l5-4.5v15L7 15H3z" fill="currentColor" />',
  sparkle:
    '<path d="M18.6 1.7Q19.3 4.7 22.3 5.4Q19.3 6.1 18.6 9.1Q17.9 6.1 14.9 5.4Q17.9 4.7 18.6 1.7Z" fill="currentColor" opacity="0.3" /> <path d="M10 5.4Q11.35 11.85 17.8 13.2Q11.35 14.55 10 21Q8.65 14.55 2.2 13.2Q8.65 11.85 10 5.4Z" fill="currentColor" /> <path d="M19.2 15.1Q19.7 17.3 21.9 17.8Q19.7 18.3 19.2 20.5Q18.7 18.3 16.5 17.8Q18.7 17.3 19.2 15.1Z" fill="var(--spark,#e8320c)" />',
  star: '<path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" />',
  ticket:
    '<path d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z" fill="currentColor" opacity="0.25" /> <path d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z" fill="currentColor" /> <circle cx="8.6" cy="12" r="2" fill="var(--spark,#e8320c)" />',
  tv: '<rect x="2.5" y="4" width="19" height="13" rx="2.5" fill="currentColor" opacity="0.3" /> <rect x="8" y="18.6" width="8" height="2.4" rx="1.2" fill="currentColor" /> <path d="M4.5 6.5h15v8h-15z" fill="currentColor" opacity="0.55" /> <circle cx="18" cy="8.2" r="1.7" fill="var(--spark,#e8320c)" />',
  userplus:
    '<circle cx="9" cy="8" r="4.2" fill="currentColor" /> <path d="M1.8 20.8a7.2 7.2 0 0 1 14.4 0z" fill="currentColor" /> <path d="M18 3.6h2.4V7h3.4v2.4h-3.4v3.4H18V9.4h-3.4V7H18z" fill="var(--spark,#e8320c)" />',
  you: '<path fill-rule="evenodd" d="M11 2.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm0 3.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8z" fill="currentColor" /> <circle cx="17.6" cy="17.6" r="3.4" fill="var(--spark,#e8320c)" />'
} as const

export type IconName = keyof typeof IC

export function Ic({ n, s = 20 }: { n: IconName; s?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: desenho fixo deste arquivo, sem dado de fora.
      dangerouslySetInnerHTML={{ __html: IC[n] }}
    />
  )
}
