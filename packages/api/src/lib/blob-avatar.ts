import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from './blob-photo'

export { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES }

export function avatarPathname(userId: string): string {
  return `users/${userId}/avatar`
}

export function isOwnAvatarPathname(pathname: string, userId: string): boolean {
  return pathname === avatarPathname(userId)
}

export function isOwnAvatarUrl(
  url: string,
  userId: string,
  storeId: string | undefined
): boolean {
  if (!storeId) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.port) return false
  if (
    parsed.hostname !==
    `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
  ) {
    return false
  }

  return parsed.pathname === `/${avatarPathname(userId)}`
}
