import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { authClient, refreshSession } from './auth-client'
import { env } from './env'

/*
 * A foto do perfil (WEB-419), pelo mesmo caminho do web
 * (`apps/web/src/lib/upload-media.ts`): `POST /api/user/avatar` assina um
 * `PUT` de 5 minutos para o R2, o arquivo sobe direto e o `updateUser` grava
 * a URL pública. Sem as chaves do R2 o servidor responde 503 ("Upload de
 * foto indisponível no momento."), e é essa frase que a tela mostra.
 */

/** O lado da foto quadrada que sobe: sobra para a tela 2l (76 pt a 3x). */
const SIDE = 512

/** O que o servidor recusou, com a frase dele (formato, tamanho, R2). */
export class AvatarError extends Error {}

const authHeaders = (): Record<string, string> => {
  const cookie = authClient.getCookie()
  return cookie ? { Cookie: cookie } : {}
}

/**
 * Escolhe (ou tira) a foto, recortada em quadrado pelo próprio sistema.
 * `null`: a pessoa desistiu ou não deu permissão.
 */
export async function pickSquarePhoto(source: 'library' | 'camera') {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return null
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  return result.canceled ? null : (result.assets[0]?.uri ?? null)
}

/** Reduz para 512 x 512 em JPEG e sobe; devolve a URL gravada no perfil. */
export async function uploadAvatar(uri: string) {
  const context = ImageManipulator.manipulate(uri)
  context.resize({ width: SIDE, height: SIDE })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({
    compress: 0.8,
    format: SaveFormat.JPEG
  })
  const file = await (await fetch(saved.uri)).blob()

  const sign = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}/api/user/avatar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ contentType: 'image/jpeg', size: file.size })
  })
  const body = (await sign.json().catch(() => ({}))) as {
    uploadUrl?: string
    url?: string
    error?: string
  }
  if (!sign.ok || !body.uploadUrl || !body.url)
    throw new AvatarError(body.error ?? 'Não foi possível enviar a foto.')

  const put = await fetch(body.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: file
  })
  if (!put.ok) throw new AvatarError('Não foi possível enviar a foto.')
  const update = await authClient.updateUser({ image: body.url })
  if (update.error) throw new AvatarError('Não foi possível salvar a foto.')
  await refreshSession()
  return body.url
}

/** Tira a foto: o arquivo primeiro, como no web (repetir conserta). */
export async function removeAvatar() {
  const removed = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}/api/user/avatar`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!removed.ok) {
    const body = (await removed.json().catch(() => ({}))) as {
      error?: string
    }
    throw new AvatarError(body.error ?? 'Não foi possível remover a foto.')
  }
  const update = await authClient.updateUser({ image: null })
  if (update.error) throw new AvatarError('Não foi possível remover a foto.')
  await refreshSession()
}
