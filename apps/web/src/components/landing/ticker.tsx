/** biome-ignore-all lint/suspicious/noArrayIndexKey: <explanation> */
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/utils/trpc'

const FALLBACK_ITEMS = [
  'AO VIVO • Flamengo x Palmeiras no Bar do Zé',
  'GP de Interlagos • Pub The Box • começa 14h',
  "NBA Finals • Sports Central • telão 120''",
  'Champions League • The Red Lion • lotação 80%',
  'UFC 305 • Octagon Pub • portas às 22h'
]

function formatTickerItem(item: {
  bar_name: string
  championship: string
  starts_at: string
  sport_name: string
}): string {
  const time = new Date(item.starts_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  const date = (() => {
    const d = new Date(item.starts_at)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return `hoje às ${time}`
    return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} às ${time}`
  })()

  return `${item.sport_name.toUpperCase()} • ${item.championship} • ${item.bar_name} • ${date}`
}

export function Ticker() {
  const trpc = useTRPC()

  const { data: eliteEvents = [] } = useQuery(
    trpc.pubs.getEliteEvents.queryOptions()
  )

  const items =
    eliteEvents.length > 0
      ? eliteEvents.map((e: any) => formatTickerItem(e))
      : FALLBACK_ITEMS

  const loop = [...items, ...items]

  return (
    <div className="overflow-hidden border-white/10 border-y bg-black py-3 text-white">
      <div className="flex w-max animate-marquee whitespace-nowrap">
        {loop.map((item, index) => (
          <div key={index + 1} className="flex items-center gap-4 px-8">
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
