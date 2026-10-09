import { describe, expect, it } from 'bun:test'
import {
  mensagemEnderecoIndisponivel,
  mensagemEnderecoNaoEncontrado
} from '@findsports_oficial/api/lib/bar-profile-validation'
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
    const serialized = serializePubOnboardingDraft(DRAFT, 'dona', 1_000)
    expect(parsePubOnboardingDraft(serialized, 'dona', 2_000)).toEqual(DRAFT)
  })

  it('recusa rascunho expirado ou malformado', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 'dona', 1_000)
    expect(parsePubOnboardingDraft(serialized, 'dona', 7_201_001)).toBeNull()
    expect(parsePubOnboardingDraft('{', 'dona')).toBeNull()
    expect(
      parsePubOnboardingDraft(JSON.stringify({ draft: {} }), 'dona')
    ).toBeNull()
  })

  it('não devolve o rascunho de outra conta, nem o sem dono (WEB-262)', () => {
    const serialized = serializePubOnboardingDraft(DRAFT, 'dona', 1_000)
    expect(parsePubOnboardingDraft(serialized, 'outra', 2_000)).toBeNull()
    const semDono = JSON.stringify({ draft: DRAFT, expiresAt: 9_000 })
    expect(parsePubOnboardingDraft(semDono, 'dona', 2_000)).toBeNull()
    // O e-mail do cadastro e o da sessão diferem só em caixa e espaço.
    expect(parsePubOnboardingDraft(serialized, ' DONA ', 2_000)).toEqual(DRAFT)
  })

  it('carrega a UF, e o rascunho antigo sem ela continua abrindo (WEB-270)', () => {
    const comUf = { ...DRAFT, city: 'Bonito', uf: 'MS' as const }
    expect(
      parsePubOnboardingDraft(
        serializePubOnboardingDraft(comUf, 'dona', 1_000),
        'dona',
        2_000
      )
    ).toEqual(comUf)

    // Gravado antes do campo: volta inteiro, só sem UF.
    const antigo = parsePubOnboardingDraft(
      serializePubOnboardingDraft(DRAFT, 'dona', 1_000),
      'dona',
      2_000
    )
    expect(antigo).toEqual(DRAFT)
    expect(antigo?.uf).toBeUndefined()

    // UF que não é sigla sai, e o resto fica.
    const adulterado = JSON.stringify({
      draft: { ...DRAFT, uf: 'XX' },
      email: 'dona',
      expiresAt: 9_000
    })
    expect(parsePubOnboardingDraft(adulterado, 'dona', 2_000)).toEqual(DRAFT)
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
    expect(
      mensagemFalhaCadastroBar(recusa('UNPROCESSABLE_CONTENT'), {
        ...DRAFT,
        city: 'Bonito',
        uf: 'MS'
      })
    ).toBe(mensagemEnderecoNaoEncontrado('Bonito', 'MS'))
  })

  it('geocoding fora do ar pede para tentar de novo, sem culpar o endereço', () => {
    expect(mensagemFalhaCadastroBar(recusa('SERVICE_UNAVAILABLE'), DRAFT)).toBe(
      mensagemEnderecoIndisponivel
    )
  })

  it('outras falhas seguem o padrão do WEB-118', () => {
    expect(
      mensagemFalhaCadastroBar(recusa('INTERNAL_SERVER_ERROR'), DRAFT)
    ).toBe('Não foi possível salvar o cadastro do bar. Tente novamente.')
  })
})
