import { db, sql } from '@findsports_oficial/db'

const SIGNUP_PATH = '/sign-up/email'
const WAITLIST_MESSAGE =
  'A Onside ainda está abrindo por convite. Entre na lista de espera — avisamos assim que liberarmos seu acesso.'

export type AdmissionMode = 'open' | 'invite-only'

export function acaoDeEntrada(url: string): 'signup' | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url.split('?')[0] ?? ''
  }
  return path.toLowerCase().replace(/\/+$/, '').endsWith(SIGNUP_PATH)
    ? 'signup'
    : null
}

export function decidirEntrada(input: {
  modo: AdmissionMode
  fechadoEmRuntime: boolean
  aprovado: boolean
}): { permitido: true } | { permitido: false; motivo: string } {
  const fechado = input.modo === 'invite-only' || input.fechadoEmRuntime
  if (!fechado || input.aprovado) return { permitido: true }
  return { permitido: false, motivo: WAITLIST_MESSAGE }
}

export async function emailDaRequisicao(clone: {
  json(): Promise<unknown>
}): Promise<string | null> {
  try {
    const body: unknown = await clone.json()
    if (typeof body !== 'object' || body === null) return null
    const email = (body as { email?: unknown }).email
    if (typeof email !== 'string') return null
    const normalized = email.trim().toLowerCase()
    return normalized || null
  } catch {
    return null
  }
}

export async function consultarEntrada(
  email: string
): Promise<{ aprovado: boolean }> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM waitlist_entries
      WHERE email = ${email} AND approved_at IS NOT NULL
    ) AS aprovado
  `)
  const row = result.rows[0] as { aprovado: boolean } | undefined
  return { aprovado: row?.aprovado === true }
}

export function respostaPortaoFechado(motivo: string): Response {
  return jsonResponse(403, motivo, 'WAITLIST_NOT_APPROVED')
}

export function respostaAdmissaoIndisponivel(): Response {
  return jsonResponse(
    503,
    'Não foi possível validar seu convite. Tente novamente.',
    'ADMISSION_CHECK_UNAVAILABLE'
  )
}

function jsonResponse(status: number, message: string, code: string): Response {
  return new Response(JSON.stringify({ message, code }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  })
}
