import Check from 'reicon-react/icons/Check'

interface AuthBrandCopyProps {
  role: 'fan' | 'pub'
}

const COPY = {
  fan: {
    badge: 'Acesso antecipado',
    title: (
      <>
        NUNCA MAIS
        <br />
        <span className="text-[var(--onside-acid)]">PERCA UM GOL.</span>
      </>
    ),
    description:
      'Cadastre-se e descubra qual bar está passando o seu jogo favorito, em tempo real.',
    benefits: [
      'Encontre bares com seu jogo ao vivo',
      'Saiba se o bar está cheio antes de sair de casa',
      'Notificações antes do apito'
    ]
  },
  pub: {
    badge: 'Acesso antecipado',
    title: (
      <>
        LOTE O SEU BAR
        <br />
        <span className="text-[var(--onside-acid)]">EM TODO JOGO.</span>
      </>
    ),
    description:
      'Cadastre seu bar e apareça para torcedores que procuram onde assistir ao jogo — em tempo real.',
    benefits: [
      'Apareça na busca de torcedores',
      'Atualize quais jogos você está exibindo',
      'Receba clientes nos horários certos'
    ]
  }
} as const

export function AuthBrandCopy({ role }: AuthBrandCopyProps) {
  const c = COPY[role]

  return (
    <>
      <div className="mb-3 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
        <span className="onside-live-dot" aria-hidden="true" />
        {c.badge}
      </div>
      <h2 className="onside-display mb-6 text-4xl text-[var(--onside-paper)] xl:text-5xl">
        {c.title}
      </h2>
      <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
        {c.description}
      </p>
      <ul className="mt-10 flex flex-col gap-3">
        {c.benefits.map((item) => (
          <li
            key={item}
            className="onside-text-muted-on-ink grid grid-cols-[20px_1fr] items-start gap-3 text-sm"
          >
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-[var(--onside-acid)] bg-[var(--onside-acid)] text-[var(--onside-ink)]"
              aria-hidden="true"
            >
              <Check size={12} color="currentColor" />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </>
  )
}
