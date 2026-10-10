// Gerado manualmente para o Worker `onside-tiles` (WEB-218).
// Rode `bun run cf-typegen` aqui depois de mudar wrangler.jsonc.

interface Env {
  ALLOWED_ORIGINS: string
  BUCKET: R2Bucket
  CACHE_CONTROL: string
  PMTILES_PATH: string
  PUBLIC_HOSTNAME: string
}
