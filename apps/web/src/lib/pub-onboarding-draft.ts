import {
  mensagemEnderecoNaoEncontrado,
  motivoTelefoneInvalido
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { mensagemCidadeNaoLiberada } from '@findsports_oficial/api/lib/city-match'
import { getUserFacingMessage } from '@/lib/user-facing-error'

export const PUB_ONBOARDING_DRAFT_KEY = 'onside:pub-onboarding-draft'
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000

export type PubOnboardingDraft = {
  name: string
  neighborhood: string
  city?: string
  address: string
  phone?: string
  description?: string
  amenities?: number[]
  screenCount?: number
}

export function serializePubOnboardingDraft(
  draft: PubOnboardingDraft,
  now = Date.now()
): string {
  return JSON.stringify({ draft, expiresAt: now + DRAFT_TTL_MS })
}

export function parsePubOnboardingDraft(
  value: string | null,
  now = Date.now()
): PubOnboardingDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as {
      draft?: PubOnboardingDraft
      expiresAt?: number
    }
    if (!parsed.draft || !parsed.expiresAt || parsed.expiresAt <= now) {
      return null
    }
    if (
      typeof parsed.draft.name !== 'string' ||
      typeof parsed.draft.neighborhood !== 'string' ||
      typeof parsed.draft.address !== 'string'
    ) {
      return null
    }
    return parsed.draft
  } catch {
    return null
  }
}

/**
 * A recusa de `onboarding.completePub` no texto que diz ao dono do bar o que
 * corrigir. Serve ao onboarding e ao `/verify-email`, que envia o rascunho
 * depois da confirmação, longe do formulário.
 *
 * `UNPROCESSABLE_CONTENT` é telefone ou endereço (WEB-115). O telefone é
 * conferido de novo aqui porque um rascunho salvo antes da regra chega ao
 * servidor sem ter passado por ela.
 */
export function mensagemFalhaCadastroBar(
  error: unknown,
  draft: PubOnboardingDraft
): string {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code
  const city = draft.city ?? 'São Paulo'
  if (code === 'PRECONDITION_FAILED') return mensagemCidadeNaoLiberada(city)
  if (code === 'UNPROCESSABLE_CONTENT') {
    return (
      motivoTelefoneInvalido(draft.phone) ?? mensagemEnderecoNaoEncontrado(city)
    )
  }
  return getUserFacingMessage(
    error,
    'Não foi possível salvar o cadastro do bar. Tente novamente.'
  )
}
