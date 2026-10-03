import { avatarPathname } from '@findsports_oficial/auth/session-image'
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from './blob-photo'

export { avatarPathname, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES }

export function isOwnAvatarPathname(pathname: string, userId: string): boolean {
  return pathname === avatarPathname(userId)
}
