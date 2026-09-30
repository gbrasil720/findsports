import { describe, expect, it } from 'bun:test'
import { mensagemEnderecoNaoEncontrado } from '@findsports_oficial/api/lib/bar-profile-validation'
import { mensagemCidadeNaoLiberada } from '@findsports_oficial/api/lib/city-match'
import {
  mensagemFalhaCadastroBar,
  parsePubOnboardingDraft,
  serializePubOnboardingDraft
} from './pub-onboarding-draft'

const DRAFT = {
  name: 'Bar do Teste',
  neighborhood: 'Centro',
  address: 'Rua Um, 10'
}

describe('rascunho do onboarding de bar', () => {
  it('sobrevive ao retorno do e-mail por até duas horas', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 1_000)
    expect(parsePubOnboardingDraft(serialized, 2_000)).toEqual(DRAFT)
  })

  it('recusa rascunho expirado ou malformado', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 1_000)
    expect(parsePubOnboardingDraft(serialized, 7_201_001)).toBeNull()
    expect(parsePubOnboardingDraft('{')).toBeNull()
    expect(parsePubOnboardingDraft(JSON.stringify({ draft: {} }))).toBeNull()
  })
})

describe('recusa do cadastro do bar', () => {
  const recusa = (code: string, message = 'texto do servidor') =>
    Object.assign(new Error(message), { data: { code } })

  it('diz que a cidade não abriu, e não que falta permissão', () => {
    expect(
      mensagemFalhaCadastroBar(recusa('PRECONDITION_FAILED'), {
        ...DRAFT,
        city: 'Curitiba'
      })
    ).toBe(mensagemCidadeNaoLiberada('Curitiba'))
  })

  it('aponta o telefone quando é ele que o servidor recusa', () => {
    expect(
      mensagemFalhaCadastroBar(recusa('UNPROCESSABLE_CONTENT'), {
        ...DRAFT,
        phone: '+552099999999'
      })
    ).toBe('DDD 20 não existe. Confira o telefone.')
  })

  it('senão, a recusa de conteúdo é do endereço, na cidade do rascunho', () => {
    expect(
      mensagemFalhaCadastroBar(recusa('UNPROCESSABLE_CONTENT'), DRAFT)
    ).toBe(mensagemEnderecoNaoEncontrado('São Paulo'))
  })

  it('outras falhas seguem o padrão do WEB-118', () => {
    expect(
      mensagemFalhaCadastroBar(recusa('INTERNAL_SERVER_ERROR'), DRAFT)
    ).toBe('Não foi possível salvar o cadastro do bar. Tente novamente.')
  })
})
