import { isCloudflareWorkers } from '@findsports_oficial/auth/runtime'

export function extrairIp(
  headers: Headers,
  onWorkers = isCloudflareWorkers
): string {
  // No Workers, só o `cf-connecting-ip` não vem do cliente (WEB-199). Fora
  // dele (dev, testes) não há proxy: o E2E manda um `x-forwarded-for` por teste.
  if (onWorkers) return headers.get('cf-connecting-ip')?.trim() || 'unknown'
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
