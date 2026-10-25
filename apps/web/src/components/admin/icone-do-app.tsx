/*
 * Os ícones do app (`ICONS` em `apps/mobile/components/ui.tsx`), copiados
 * para SVG do navegador: a prévia do Meu espaço desenha a página do bar com
 * os mesmos ícones que o torcedor vê. Só os que a prévia usa; ao mudar um lá,
 * mude aqui. A cor vai no `style` (não no atributo) para aceitar `var()`.
 */

const INK = '#12120f'

const ICONS = {
  back: (c: string) => (
    <path
      d="M15.6 3.4 17.4 5.2 10.6 12l6.8 6.8-1.8 1.8L7 12z"
      style={{ fill: c }}
    />
  ),
  close: (c: string) => (
    <path
      d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
      style={{ fill: c }}
    />
  ),
  check: (c: string) => (
    <path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" style={{ fill: c }} />
  ),
  people: (c: string) => (
    <>
      <g style={{ fill: c }} opacity={0.3}>
        <circle cx={16.5} cy={8} r={3.4} />
        <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
      </g>
      <circle cx={9} cy={8} r={4} style={{ fill: c }} />
      <path d="M2 20.5a7 7 0 0 1 14 0z" style={{ fill: c }} />
    </>
  ),
  share: (c: string) => (
    <>
      <path
        d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z"
        style={{ fill: c }}
        opacity={0.3}
      />
      <path
        d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z"
        style={{ fill: c }}
      />
    </>
  ),
  fan: (c: string, a: string) => (
    <>
      <path
        d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z"
        style={{ fill: c }}
        opacity={0.3}
      />
      <path
        d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z"
        style={{ fill: c }}
      />
      <path
        d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        style={{ fill: a }}
      />
    </>
  ),
  medal: (c: string) => (
    <>
      <path
        d="M6.5 2h4.2l2.4 6.2H8.9zM13.3 2h4.2l-2.4 6.2h-4.2z"
        style={{ fill: c }}
        opacity={0.35}
      />
      <circle cx={12} cy={15} r={6.6} style={{ fill: c }} />
      <path
        d="m12 11.6 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z"
        style={{ fill: INK }}
      />
    </>
  ),
  ticket: (c: string, a: string) => (
    <>
      <path
        d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z"
        style={{ fill: c }}
        opacity={0.25}
      />
      <path
        d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z"
        style={{ fill: c }}
      />
      <circle cx={8.6} cy={12} r={2} style={{ fill: a }} />
    </>
  ),
  tv: (c: string, a: string) => (
    <>
      <rect
        x={2.5}
        y={4}
        width={19}
        height={13}
        rx={2.5}
        style={{ fill: c }}
        opacity={0.3}
      />
      <rect
        x={8}
        y={18.6}
        width={8}
        height={2.4}
        rx={1.2}
        style={{ fill: c }}
      />
      <path d="M4.5 6.5h15v8h-15z" style={{ fill: c }} opacity={0.55} />
      <circle cx={18} cy={8.2} r={1.7} style={{ fill: a }} />
    </>
  ),
  sound: (c: string) => (
    <>
      <path
        d="M16 7.5a6 6 0 0 1 0 9M18.6 4.8a10 10 0 0 1 0 14.4"
        style={{ stroke: c }}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.3}
      />
      <path d="M3 9h4l5-4.5v15L7 15H3z" style={{ fill: c }} />
    </>
  ),
  premiere: (c: string) => (
    <>
      <rect
        x={2.5}
        y={4.5}
        width={19}
        height={15}
        rx={3}
        style={{ fill: c }}
        opacity={0.3}
      />
      <path d="m10 8.4 6 3.6-6 3.6z" style={{ fill: c }} />
    </>
  ),
  outdoor: (c: string, a: string) => (
    <>
      <path
        d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"
        style={{ fill: c }}
        opacity={0.3}
      />
      <rect
        x={11}
        y={11}
        width={2.2}
        height={10}
        rx={1.1}
        style={{ fill: c }}
      />
      <path d="M3 12h18v1.4H3z" style={{ fill: c }} />
      <circle cx={12} cy={3.4} r={1.5} style={{ fill: a }} />
    </>
  ),
  pin: (c: string) => (
    <path
      fillRule="evenodd"
      d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
      style={{ fill: c }}
    />
  ),
  star: (c: string) => (
    <path
      d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
      style={{ fill: c }}
    />
  ),
  bar: (c: string, a: string) => (
    <>
      <g style={{ fill: c }} opacity={0.3}>
        <path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" />
        <path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" />
      </g>
      <path
        d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
        style={{ fill: c }}
      />
      <g style={{ fill: a }}>
        <circle cx={7.4} cy={5.6} r={2.6} />
        <circle cx={11} cy={4.6} r={2.9} />
        <circle cx={14.2} cy={5.8} r={2.3} />
      </g>
    </>
  )
}

export type IconeDoAppNome = keyof typeof ICONS

/** O `Icon` do app: 24 x 24, cor e acento. */
export function IconeDoApp({
  nome,
  tamanho = 19,
  cor,
  acento = cor
}: {
  nome: IconeDoAppNome
  tamanho?: number
  cor: string
  acento?: string
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="flex-none"
    >
      {ICONS[nome](cor, acento)}
    </svg>
  )
}
