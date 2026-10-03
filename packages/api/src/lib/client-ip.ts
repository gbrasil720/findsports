import { isCloudflareWorkers } from '@findsports_oficial/auth/runtime'

export function extrairIp(
  headers: Headers,
  onWorkers = isCloudflareWorkers
): string {
  // No Workers, só o `cf-connecting-ip` não vem do cliente (WEB-199).
  if (onWorkers) return headers.get('cf-connecting-ip')?.trim() || 'unknown'

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    headers.get('x-real-ip')?.trim() ||
    headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  )
}
