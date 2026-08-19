import { describe, expect, it } from 'bun:test'

import {
  acaoDeEntrada,
  decidirEntrada,
  emailDaRequisicao,
  type PortaoWaitlist,
  respostaPortaoFechado
} from './waitlist-gate'

const DESLIGADO: PortaoWaitlist = { signup: false, signin: false }
const LIGADO: PortaoWaitlist = { signup: true, signin: true }

describe('reconhecimento da tentativa de entrada', () => {
  it('pega cadastro e login', () => {
    expect(acaoDeEntrada('https://onside.app/api/auth/sign-up/email')).toBe(
      'signup'
    )
    expect(acaoDeEntrada('https://onside.app/api/auth/sign-in/email')).toBe(
      'signin'
    )
    expect(acaoDeEntrada('/api/auth/sign-in/email?redirect=/dashboard')).toBe(
      'signin'
    )
  })

  /**
   * Só cadastro e login passam pelo portão. Sair, trocar senha e ler sessão
   * são de quem já está dentro — barrá-los transformaria o portão em prisão.
   */
  it('não pega o resto do fluxo de auth', () => {
    for (const caminho of [
      '/api/auth/sign-out',
      '/api/auth/get-session',
      '/api/auth/forget-password',
      '/api/auth/reset-password',
      '/api/auth/dodopayments/webhooks'
    ]) {
      expect(acaoDeEntrada(`https://onside.app${caminho}`)).toBeNull()
    }
  })
})

describe('decisão do portão da waitlist', () => {
  it('desligado deixa passar quem não foi aprovado', () => {
    expect(
      decidirEntrada({
        acao: 'signup',
        portao: DESLIGADO,
        aprovado: false,
        papelExistente: null
      })
    ).toEqual({ permitido: true })
  })

  it('ligado barra quem não foi aprovado e libera quem foi', () => {
    const barrado = decidirEntrada({
      acao: 'signup',
      portao: LIGADO,
      aprovado: false,
      papelExistente: null
    })
    expect(barrado.permitido).toBe(false)

    expect(
      decidirEntrada({
        acao: 'signup',
        portao: LIGADO,
        aprovado: true,
        papelExistente: null
      })
    ).toEqual({ permitido: true })
  })

  /**
   * Os dois lados são independentes: fechar o cadastro e deixar o login
   * aberto é o estado normal de um beta fechado que já tem gente dentro.
   */
  it('cadastro e login são interruptores separados', () => {
    const soCadastro: PortaoWaitlist = { signup: true, signin: false }

    expect(
      decidirEntrada({
        acao: 'signup',
        portao: soCadastro,
        aprovado: false,
        papelExistente: null
      }).permitido
    ).toBe(false)

    expect(
      decidirEntrada({
        acao: 'signin',
        portao: soCadastro,
        aprovado: false,
        papelExistente: 'fan'
      }).permitido
    ).toBe(true)
  })

  /**
   * A asserção mais importante do arquivo.
   *
   * O painel que desliga este portão está atrás de login de admin. Se o
   * portão pudesse barrar um admin, ligá-lo por engano — ou aprovar a lista
   * errada — trancaria a chave do lado de dentro, sem nenhum caminho de volta
   * pela aplicação.
   */
  it('admin nunca é barrado no login, nem sem aprovação', () => {
    expect(
      decidirEntrada({
        acao: 'signin',
        portao: LIGADO,
        aprovado: false,
        papelExistente: 'admin'
      })
    ).toEqual({ permitido: true })
  })

  /**
   * A isenção vale só para o login. No cadastro `role` é limitado a
   * `fan`/`pub` pelo plugin de auth, então não há admin nascendo por ali — e
   * aceitar `papelExistente: 'admin'` num cadastro seria confiar num campo
   * que quem pede controla.
   */
  it('a isenção de admin não vale para cadastro', () => {
    expect(
      decidirEntrada({
        acao: 'signup',
        portao: LIGADO,
        aprovado: false,
        papelExistente: 'admin'
      }).permitido
    ).toBe(false)
  })

  it('conta comum já existente continua precisando de aprovação', () => {
    expect(
      decidirEntrada({
        acao: 'signin',
        portao: LIGADO,
        aprovado: false,
        papelExistente: 'pub'
      }).permitido
    ).toBe(false)
  })
})

describe('leitura do e-mail da requisição', () => {
  function pedido(corpo: unknown) {
    return new Request('https://onside.app/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { 'content-type': 'application/json' }
    })
  }

  it('normaliza caixa e espaço', async () => {
    expect(
      await emailDaRequisicao(pedido({ email: '  Fan@Exemplo.COM ' }))
    ).toBe('fan@exemplo.com')
  })

  /**
   * Corpo ilegível não pode virar exceção no caminho de login. O portão
   * devolve `null` e o `better-auth` recusa em seguida, com a mensagem de
   * validação dele.
   */
  it('corpo inválido devolve null em vez de lançar', async () => {
    expect(await emailDaRequisicao(pedido({ email: 42 }))).toBeNull()
    expect(await emailDaRequisicao(pedido({ email: '   ' }))).toBeNull()
    expect(await emailDaRequisicao(pedido(null))).toBeNull()

    const quebrado = new Request('https://onside.app/api/auth/sign-in/email', {
      method: 'POST',
      body: 'isto não é json'
    })
    expect(await emailDaRequisicao(quebrado)).toBeNull()
  })

  /**
   * O corpo só pode ser lido uma vez, e a requisição original ainda vai para
   * o `better-auth`. Se o portão consumisse o original, o cadastro chegaria
   * lá sem corpo nenhum.
   */
  it('ler o clone deixa o original intacto', async () => {
    const original = pedido({ email: 'fan@exemplo.com', password: 'x' })
    expect(await emailDaRequisicao(original.clone())).toBe('fan@exemplo.com')
    expect(original.bodyUsed).toBe(false)
    await expect(original.json()).resolves.toMatchObject({
      email: 'fan@exemplo.com'
    })
  })
})

describe('resposta do portão fechado', () => {
  /**
   * 403 e não 503: a porta não está fechada para todos, está fechada para
   * este e-mail — e volta a abrir por uma ação de outra pessoa, não do tempo.
   */
  it('responde 403 sem cache, com a mensagem que a tela mostra', async () => {
    const resposta = respostaPortaoFechado('Acesso ainda não liberado.')
    expect(resposta.status).toBe(403)
    expect(resposta.headers.get('cache-control')).toBe('no-store')
    expect(await resposta.json()).toEqual({
      message: 'Acesso ainda não liberado.',
      code: 'WAITLIST_NOT_APPROVED'
    })
  })
})
