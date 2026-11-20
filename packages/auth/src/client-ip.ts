import { isCloudflareWorkers } from './runtime'

export function extrairIp(
  headers: Headers,
  onWorkers = isCloudflareWorkers
): string {
  // No Workers, só o `cf-connecting-ip` não vem do cliente (WEB-199). Fora
  // dele (dev, testes) não há proxy: o E2E manda um `x-forwarded-for` por teste.
  if (onWorkers) return headers.get('cf-connecting-ip')?.trim() || 'unknown'
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/**
 * IPv6 vira o prefixo /64: quem tem um /64 (o normal de um provedor) troca de
 * endereço à vontade e passaria por baixo de todo limite por IP. IPv4 mapeado
 * (`::ffff:1.2.3.4`) vira o IPv4. O que não é IPv6 válido sai como veio.
 */
export function chaveDeIp(ip: string): string {
  if (!ip.includes(':')) return ip
  const hextetos = expandirIpv6(ip.toLowerCase().replace(/%.*$/, ''))
  if (!hextetos) return ip
  if (hextetos.slice(0, 5).every((h) => h === 0) && hextetos[5] === 0xffff) {
    const [a = 0, b = 0] = hextetos.slice(6)
    return [a >> 8, a & 255, b >> 8, b & 255].join('.')
  }
  return `${hextetos
    .slice(0, 4)
    .map((h) => h.toString(16))
    .join(':')}::/64`
}

/** Os oito hextetos, com `::` aberto e IPv4 no fim convertido; inválido, null. */
function expandirIpv6(ip: string): number[] | null {
  let texto = ip
  const ipv4 = texto.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const octetos = ipv4.slice(2).map(Number)
    if (octetos.some((o) => o > 255)) return null
    const [a = 0, b = 0, c = 0, d = 0] = octetos
    texto = `${ipv4[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const lados = texto.split('::')
  if (lados.length > 2) return null
  const partes = (lado: string | undefined) => (lado ? lado.split(':') : [])
  const inicio = partes(lados[0])
  const fim = partes(lados[1])
  const faltam = 8 - inicio.length - fim.length
  if (lados.length === 2 ? faltam < 1 : faltam !== 0) return null
  const todos = [...inicio, ...Array(faltam).fill('0'), ...fim]
  if (!todos.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return null
  return todos.map((h) => Number.parseInt(h, 16))
}
