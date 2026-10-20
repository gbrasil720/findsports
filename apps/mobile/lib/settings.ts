/*
 * Contas puras das Configurações (11f–11i do design); a tela fica em
 * `app/configuracoes.tsx`.
 */

const TZ = 'America/Sao_Paulo'

/** "a", "a e b", "a, b e c". */
export function listJoin(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`
}

/** "Futebol" vira "futebol"; sigla ("F1", "MMA/UFC") fica como está. */
const sportWord = (name: string) =>
  name === 'Fórmula 1'
    ? 'F1'
    : /^[A-Z0-9/ ]+$/.test(name)
      ? name
      : name.toLocaleLowerCase('pt-BR')

/**
 * A frase do topo de Preferências (11f), em pedaços: os `strong` saem em
 * acid. Sem esporte, time ou lugar, a parte some.
 */
export function preferenceSummary({
  sports,
  teams,
  radiusKm,
  place
}: {
  sports: string[]
  teams: string[]
  radiusKm: number
  place: string | null
}) {
  const parts: { text: string; strong?: boolean }[] = []
  if (sports.length) {
    parts.push({ text: 'Você acompanha ' })
    parts.push({ text: listJoin(sports.map(sportWord)), strong: true })
  }
  if (teams.length) {
    parts.push({ text: sports.length ? ', torce para ' : 'Você torce para ' })
    parts.push({ text: listJoin(teams), strong: true })
  }
  parts.push({
    text: parts.length ? ' e procura bares a até ' : 'Você procura bares a até '
  })
  parts.push({ text: `${radiusKm} km`, strong: true })
  if (place) {
    parts.push({ text: ' de ' })
    parts.push({ text: place, strong: true })
  }
  parts.push({ text: '.' })
  return parts
}

/** O aparelho de uma sessão, pelo `User-Agent`: "Chrome no Mac". */
export function deviceLabel(userAgent: string | null | undefined): {
  name: string
  computer: boolean
} {
  const ua = userAgent ?? ''
  // O app (Expo Go e o build) fala pelo CFNetwork, sem navegador.
  if (/^Expo\/|CFNetwork/.test(ua))
    return { name: 'App no iPhone', computer: false }
  if (/okhttp/i.test(ua)) return { name: 'App no Android', computer: false }
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  const computer =
    device === 'Mac' || device === 'Windows' || device === 'Linux'
  if (!device) return { name: browser ?? 'Outro aparelho', computer: true }
  return { name: browser ? `${browser} no ${device}` : device, computer }
}

const dayKey = (date: Date | number) =>
  new Date(date).toLocaleDateString('en-CA', { timeZone: TZ })

/** Quando a sessão foi usada: "agora", "hoje, 21:30", "ontem, 23:10", "12 out". */
export function lastSeen(date: Date | string, now: number) {
  const at = new Date(date)
  if (now - at.getTime() < 5 * 60_000) return 'agora'
  const time = at.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
  if (dayKey(at) === dayKey(now)) return `hoje, ${time}`
  if (dayKey(at) === dayKey(now - 86_400_000)) return `ontem, ${time}`
  return at
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: TZ
    })
    .replace(/\.| de/g, '')
}
