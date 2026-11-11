import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { authClient } from './auth-client'
import { env } from './env'

/*
 * Foto nova do bar pelo app (rodada 10, Fotos): o mesmo caminho do painel
 * (`/api/bar/photo`, URL assinada do R2, depois `pub.addPhoto`, que põe em
 * revisão). Aqui só escolhe, reduz e sobe; quem grava é a tela.
 */

const WIDTH = 1600

export class BarPhotoError extends Error {}

/** Escolhe da galeria (ou tira); `null` se a pessoa desistiu. */
export async function pickBarPhoto(source: 'library' | 'camera') {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
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
  return result.canceled ? null : (result.assets[0] ?? null)
}

/**
 * Reduz para 1600 de largura em JPEG e sobe. `cover`: a capa vale em todo
 * plano (`?capa`); as outras fotos são do Pro e do Elite.
 */
export async function uploadBarPhoto(
  asset: { uri: string; width: number },
  cover: boolean
) {
  const context = ImageManipulator.manipulate(asset.uri)
  if (asset.width > WIDTH) context.resize({ width: WIDTH })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG
  })
  // Bytes, não `Blob`: com `Blob` o content-type sai vazio e o R2 recusa.
  const file = await new File(saved.uri).bytes()
  const cookie = authClient.getCookie()
  const sign = await fetch(
    `${env.EXPO_PUBLIC_SERVER_URL}/api/bar/photo${cover ? '?capa' : '?galeria'}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify({ contentType: 'image/jpeg', size: file.byteLength })
    }
  )
  const body = (await sign.json().catch(() => ({}))) as {
    uploadUrl?: string
    url?: string
    error?: string
  }
  if (!sign.ok || !body.uploadUrl || !body.url)
    throw new BarPhotoError(body.error ?? 'Não foi possível enviar a foto.')
  const put = await fetch(body.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: file
  })
  if (!put.ok) throw new BarPhotoError('Não foi possível enviar a foto.')
  return body.url
}
