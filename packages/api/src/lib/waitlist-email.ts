import {
  createOnsideEmailTemplate,
  sendEmailWithResend
} from '@findsports_oficial/auth/verification-email'
import { env } from '@findsports_oficial/env/server'

export type WaitlistEmailKind =
  | 'confirm'
  | 'joined'
  | 'invite'
  | 'approved-existing'
  | 'launch'

const content: Record<
  WaitlistEmailKind,
  {
    subject: string
    preheader: string
    eyebrow: string
    heading: string
    intro: string
    highlights: string[]
    action: string
    note: string
    actionTone?: 'primary' | 'secondary'
  }
> = {
  confirm: {
    subject: 'Confirme sua entrada na waitlist da Onside',
    preheader: 'Um clique confirma sua inscrição na waitlist da Onside.',
    eyebrow: 'Confirmação da waitlist',
    heading: 'Confirme sua entrada',
    intro:
      'Recebemos seus dados. Confirme que este endereço é seu para ativar ou atualizar sua inscrição na waitlist.',
    highlights: [
      'Sua inscrição só fica ativa depois desta confirmação.',
      'Se você já estava na lista, seus dados serão atualizados sem criar uma inscrição duplicada.',
      'Quando seu acesso for liberado, o convite chegará neste mesmo e-mail.'
    ],
    action: 'Confirmar meu e-mail',
    note: 'Se você não pediu para entrar na waitlist da Onside, ignore esta mensagem.'
  },
  joined: {
    subject: 'Você está na waitlist da Onside',
    preheader: 'Sua inscrição está confirmada. Agora é só aguardar o convite.',
    eyebrow: 'Inscrição confirmada',
    heading: 'Você está na lista',
    intro:
      'Pronto: seu e-mail foi confirmado e sua inscrição está ativa. Não é preciso preencher outro cadastro agora.',
    highlights: [
      'Os acessos são liberados manualmente durante o beta fechado.',
      'Quando chegar sua vez, enviaremos um convite de uso único para este e-mail.',
      'O convite mostrará o prazo para ativar sua conta e continuar no Onside.'
    ],
    action: 'Sair da waitlist',
    actionTone: 'secondary',
    note: 'Quer continuar na lista? Não precisa fazer nada. Use o botão apenas se quiser cancelar sua inscrição.'
  },
  invite: {
    subject: 'Seu convite para testar a Onside chegou',
    preheader: 'Seu acesso antecipado está reservado por 7 dias.',
    eyebrow: 'Convite de acesso',
    heading: 'Você foi convidado',
    intro:
      'Chegou sua vez de testar a Onside. Seu e-mail já está aprovado; falta apenas definir os dados de acesso.',
    highlights: [
      'Seu acesso fica reservado por 7 dias a partir do envio deste convite.',
      'O link é de uso único e está ligado a este endereço de e-mail.',
      'Você cria sua senha, entra automaticamente e segue direto para configurar seu perfil.'
    ],
    action: 'Ativar minha conta',
    note: 'Não reconhece este convite? Ignore a mensagem. Se o prazo expirar, um administrador poderá liberar um novo convite.'
  },
  'approved-existing': {
    subject: 'Seu acesso à Onside foi liberado',
    preheader: 'Sua conta existente agora tem acesso à Onside.',
    eyebrow: 'Acesso liberado',
    heading: 'Você está dentro',
    intro:
      'Seu acesso antecipado foi liberado na conta que você já criou. Não é necessário fazer outro cadastro.',
    highlights: [
      'Entre com o mesmo e-mail e a senha que você já usa.',
      'Sua conta e seus dados continuam os mesmos.',
      'Depois do login, você poderá concluir qualquer etapa pendente no app.'
    ],
    action: 'Entrar na Onside',
    note: 'Se você não reconhece esta conta, não tente entrar e ignore esta mensagem.'
  },
  launch: {
    subject: 'A Onside está aberta',
    preheader: 'A espera acabou: agora você já pode criar sua conta Onside.',
    eyebrow: 'Abertura da Onside',
    heading: 'Pode entrar',
    intro:
      'A Onside agora está aberta. Crie sua conta e comece a encontrar onde assistir aos jogos que importam para você.',
    highlights: [
      'Torcedores encontram bares transmitindo seus jogos favoritos.',
      'Bares divulgam sua programação para quem já está procurando onde assistir.',
      'O cadastro começa pelo seu perfil e leva poucos passos.'
    ],
    action: 'Criar minha conta',
    note: 'Você recebeu esta mensagem porque confirmou interesse na Onside durante a waitlist.'
  }
}

export function createWaitlistEmail(input: {
  kind: WaitlistEmailKind
  url: string
  logoUrl: string
  heroImageUrl: string
}) {
  const copy = content[input.kind]
  return {
    subject: copy.subject,
    ...createOnsideEmailTemplate({
      preheader: copy.preheader,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      intro: copy.intro,
      highlights: copy.highlights,
      action: copy.action,
      actionUrl: input.url,
      logoUrl: input.logoUrl,
      heroImageUrl: input.heroImageUrl,
      note: copy.note,
      actionTone: copy.actionTone
    })
  }
}

export async function sendWaitlistEmail(input: {
  kind: WaitlistEmailKind
  to: string
  url: string
  idempotencyKey?: string
}): Promise<{ delivered: boolean }> {
  const baseUrl = env.BETTER_AUTH_URL
  const email = createWaitlistEmail({
    kind: input.kind,
    url: input.url,
    logoUrl: new URL('/onside-wordmark-paper.png', baseUrl).toString(),
    heroImageUrl: new URL('/og-image.jpg', baseUrl).toString()
  })
  return sendEmailWithResend({
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    idempotencyKey: input.idempotencyKey
  })
}

export function waitlistUrl(path: string, token?: string) {
  const url = new URL(path, env.BETTER_AUTH_URL)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}
