import { Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

function Check({ color }: { color: string }) {
  return (
    <span
      className={`size-5 rounded-full ${color} flex shrink-0 items-center justify-center text-white`}
    >
      <HugeiconsIcon icon={Tick01Icon} size={12} color="currentColor" strokeWidth={2} />
    </span>
  )
}

type AudiencePanelProps = {
  id: string
  className: string
  overlineColor: string
  overline: string
  heading: string
  checkColor: string
  items: string[]
  ctaColor: string
  cta: string
}

function AudiencePanel({
  id,
  className,
  overlineColor,
  overline,
  heading,
  checkColor,
  items,
  ctaColor,
  cta
}: AudiencePanelProps) {
  return (
    <div
      id={id}
      className={`flex flex-col justify-center p-8 md:p-16 lg:p-20 ${className}`}
    >
      <span
        className={`mb-4 font-bold text-xs uppercase tracking-[0.25em] ${overlineColor}`}
      >
        {overline}
      </span>
      <h2 className="mb-6 font-bold font-heading text-4xl leading-tight md:text-5xl">
        {heading}
      </h2>
      <ul className="mb-8 flex flex-col gap-4 text-base md:text-lg">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <Check color={checkColor} /> {item}
          </li>
        ))}
      </ul>
      <a
        href="#waitlist"
        className={`self-start rounded-full ${ctaColor} px-6 py-3 font-bold text-white transition-transform hover:scale-105`}
      >
        {cta}
      </a>
    </div>
  )
}

export function DualAudience() {
  return (
    <section
      className="grid md:grid-cols-2"
      aria-label="Para torcedores e bares"
    >
      <AudiencePanel
        id="torcedores"
        className="border-black/5 border-b bg-brand-orange/5 md:border-r md:border-b-0"
        overlineColor="text-brand-orange"
        overline="Para torcedores"
        heading="Barulho de bar é melhor que silêncio de sofá."
        checkColor="bg-brand-orange"
        items={[
          'Busca por partida específica, não só por esporte',
          'Filtre por som no jogo, narração ao vivo ou clima família',
          'Reserve mesa pra galera antes do apito',
          'Mapa em tempo real com lotação atualizada'
        ]}
        ctaColor="bg-brand-orange"
        cta="Garantir meu acesso antecipado"
      />
      <AudiencePanel
        id="bares"
        className="bg-brand-blue/5"
        overlineColor="text-brand-blue"
        overline="Para bares & pubs"
        heading="Lote suas mesas até nas terças de chuva."
        checkColor="bg-brand-blue"
        items={[
          'Atraia torcedores do time certo, no jogo certo',
          'Publique sua grade semanal de transmissões',
          'Receba reservas direto pelo app',
          'Painel com analytics de público e horários'
        ]}
        ctaColor="bg-brand-blue"
        cta="Garantir condições de lançamento"
      />
    </section>
  )
}
