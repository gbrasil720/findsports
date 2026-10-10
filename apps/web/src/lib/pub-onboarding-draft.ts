import {
  ehUf,
  mensagemEnderecoIndisponivel,
  mensagemEnderecoNaoEncontrado,
  motivoTelefoneInvalido,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { mensagemCidadeNaoLiberada } from '@findsports_oficial/api/lib/city-match'
import { getErrorCode, getUserFacingMessage } from '@/lib/user-facing-error'

export const PUB_ONBOARDING_DRAFT_KEY = 'onside:pub-onboarding-draft'
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000

export type PubOnboardingDraft = {
  name: string
  neighborhood: string
  city?: string
  /**
   * Ausente em rascunho gravado antes do campo (WEB-270): ele continua
   * abrindo, e quem o lê manda o dono ao formulário para escolher a UF.
   */
  uf?: Uf
  address: string
  phone?: string
  description?: string
  amenities?: number[]
  screenCount?: number
  /**
   * Passo do wizard em que o dono parou, gravado enquanto ele preenche. Ausente
   * no rascunho que passou pela revisão — o formato de antes, e o único que
   * `/verify-email` envia sozinho. Não vai ao servidor.
   */
  step?: number
}

const mesmoEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A chave do `localStorage` é uma só por navegador, então o rascunho leva o
 * dono junto (WEB-262): sem isso a conta seguinte no mesmo navegador abria o
 * cadastro preenchido com o bar da anterior.
 *
 * O dono é o e-mail, e não o id: quem vem do cadastro preenche o onboarding
 * antes de confirmar o e-mail, ainda sem sessão, e a única coisa que a aba
 * sabe dele é o e-mail que acabou de cadastrar.
 */
export function serializePubOnboardingDraft(
  draft: PubOnboardingDraft,
  email: string,
  now = Date.now()
): string {
  return JSON.stringify({ draft, email, expiresAt: now + DRAFT_TTL_MS })
}

/** Só devolve rascunho gravado para esse e-mail; o de outra conta não volta. */
export function parsePubOnboardingDraft(
  value: string | null,
  email: string,
  now = Date.now()
): PubOnboardingDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as {
      draft?: PubOnboardingDraft
      email?: string
      expiresAt?: number
    }
    if (!parsed.draft || !parsed.expiresAt || parsed.expiresAt <= now) {
      return null
    }
    if (typeof parsed.email !== 'string' || !mesmoEmail(parsed.email, email)) {
      return null
    }
    if (
      typeof parsed.draft.name !== 'string' ||
      typeof parsed.draft.neighborhood !== 'string' ||
      typeof parsed.draft.address !== 'string'
    ) {
      return null
    }
    // UF que não é sigla e passo que não é número saem sozinhos, sem derrubar
    // o resto do rascunho.
    const { step } = parsed.draft
    return {
      ...parsed.draft,
      uf: ehUf(parsed.draft.uf) ? parsed.draft.uf : undefined,
      step: Number.isInteger(step) && Number(step) > 0 ? step : undefined
    }
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
 * servidor sem ter passado por ela. `SERVICE_UNAVAILABLE` é o geocoding fora
 * do ar: o endereço pode estar certo, vale tentar de novo (WEB-191).
 */
export function mensagemFalhaCadastroBar(
  error: unknown,
  draft: PubOnboardingDraft
): string {
  const code = getErrorCode(error)
  const city = draft.city ?? 'São Paulo'
  if (code === 'PRECONDITION_FAILED') return mensagemCidadeNaoLiberada(city)
  if (code === 'SERVICE_UNAVAILABLE') return mensagemEnderecoIndisponivel
  if (code === 'UNPROCESSABLE_CONTENT') {
    return (
      motivoTelefoneInvalido(draft.phone) ??
      mensagemEnderecoNaoEncontrado(city, draft.uf)
    )
  }
  return getUserFacingMessage(
    error,
    'Não foi possível salvar o cadastro do bar. Tente novamente.'
  )
}
