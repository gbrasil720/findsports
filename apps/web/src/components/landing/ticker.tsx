const ITEMS = [
  'AO VIVO • Flamengo x Palmeiras no Bar do Zé',
  'GP de Interlagos • Pub The Box • começa 14h',
  "NBA Finals • Sports Central • telão 120''",
  'Champions League • The Red Lion • lotação 80%',
  'UFC 305 • Octagon Pub • portas às 22h'
]

export function Ticker() {
  const loop = [...ITEMS, ...ITEMS]

  return (
    <div className="overflow-hidden border-white/10 border-y bg-black py-3 text-white">
      <div className="flex w-max animate-marquee whitespace-nowrap">
        {loop.map((item, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={index + 1}
            className="flex items-center gap-4 px-8"
          >
            <span className="size-2 shrink-0 rounded-full bg-brand-orange" />
            <span className="font-mono text-[11px] text-zinc-300 uppercase tracking-[0.2em]">
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
