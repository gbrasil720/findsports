import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { symmetricEncrypt } from 'better-auth/crypto'
import { SERVER_ENV } from '../env'
import { insert, query } from './db'

/**
 * TOTP (RFC 6238, SHA-1, 6 dígitos, 30s) como o plugin `twoFactor` do
 * better-auth calcula. `key` é a chave crua: os bytes que o servidor usa no
 * HMAC — não o base32 do `totpURI`; para esse, `base32Decode` antes.
 */
export function totp(key: Buffer | string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 15
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    '0'
  )
}

/** Base32 (RFC 4648, sem padding) do parâmetro `secret` do `totpURI`. */
export function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  }
  const bytes = bits.match(/.{8}/g) ?? []
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)))
}

/**
 * Liga o 2FA direto no banco, cifrando segredo e códigos como o plugin cifra
 * (`symmetricEncrypt` com o `BETTER_AUTH_SECRET` do servidor de E2E). Pelo
 * fluxo da API custaria `enable` + `verify-totp` no balde de 3 requisições
 * por 10s de `/two-factor/*` que o login em seguida também usa.
 */
export async function seedTwoFactor(userId: string) {
  const key = SERVER_ENV.BETTER_AUTH_SECRET ?? ''
  const secret = randomBytes(16).toString('hex')
  const backupCodes = Array.from({ length: 10 }, () => {
    const code = randomBytes(5).toString('hex')
    return `${code.slice(0, 5)}-${code.slice(5)}`
  })
  await insert('two_factor', {
    id: randomUUID(),
    user_id: userId,
    secret: await symmetricEncrypt({ key, data: secret }),
    backup_codes: await symmetricEncrypt({
      key,
      data: JSON.stringify(backupCodes)
    }),
    verified: true
  })
  await query('UPDATE "user" SET two_factor_enabled = true WHERE id = $1', [
    userId
  ])
  return { secret, backupCodes }
}
