import { useMutation } from '@tanstack/react-query'
import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMyBar } from '@/components/admin/admin-queries'
import {
  Badge,
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  EmBreve,
  Icone,
  type IconeNome,
  Toggle
} from '@/components/painel'
import { persistProfileUser } from '@/components/profile/profile-user-update'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { authClient } from '@/lib/auth-client'
import { describeDevice } from '@/lib/describe-device'
import { getErrorCode, getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { PasswordDialog } from './account-settings'
import {
  DeleteAccountDialog,
  useDeletionEligibility
} from './delete-account-settings'
import { useAccountSessions } from './session-settings'
import {
  type DialogMode,
  EnableTwoFactorDialog,
  ManageTwoFactorDialog
} from './two-factor-settings'

/*
 * Configurações do painel do bar (2e/2f): conta e acesso, segurança, avisos,
 * privacidade e exclusão, com a navegação ao lado. Os diálogos (senha, 2FA,
 * exclusão) são os mesmos da conta de antes.
 */

const SECOES = [
  { id: 'conta', rotulo: 'Conta e acesso' },
  { id: 'seguranca', rotulo: 'Segurança' },
  { id: 'avisos', rotulo: 'Avisos' },
  { id: 'privacidade', rotulo: 'Privacidade' },
  { id: 'excluir', rotulo: 'Excluir conta' }
] as const

const PAD: CSSProperties = { padding: '20px 22px' }

export function Configuracoes() {
  const session = useSession()
  const { data: bar } = useMyBar()
  const [ativa, setAtiva] = useState<string>('conta')

  return (
    <>
      <CabecalhoPagina
        kicker={
          bar?.name
            ? `Conta de quem administra o ${bar.name}`
            : 'Conta de quem administra o bar'
        }
        titulo="Configurações"
      />
      <div className="grid items-start gap-7 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Seções das configurações"
          className="flex gap-0.5 overflow-x-auto lg:sticky lg:top-5 lg:flex-col"
        >
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              onClick={() => setAtiva(secao.id)}
              aria-current={ativa === secao.id ? 'true' : undefined}
              className={`flex h-10 flex-none items-center rounded-[6px] px-3 text-[14px] no-underline ${
                ativa === secao.id
                  ? 'bg-[var(--painel-card)] font-bold shadow-[var(--painel-sh)]'
                  : 'font-medium'
              } ${
                secao.id === 'excluir'
                  ? 'text-[var(--painel-live)]'
                  : ativa === secao.id
                    ? 'text-[var(--painel-fg)]'
                    : 'text-[var(--painel-muted)]'
              }`}
            >
              {secao.rotulo}
            </a>
          ))}
        </nav>
        <div className="flex max-w-[820px] flex-col gap-5">
          <ContaEAcesso
            nome={session?.user.name ?? ''}
            email={session?.user.email ?? ''}
          />
          <Seguranca enabled={session?.user.twoFactorEnabled === true} />
          <Avisos />
          <Privacidade />
          <Excluir nomeBar={bar?.name ?? 'O bar'} />
        </div>
      </div>
    </>
  )
}

function Secao({
  id,
  titulo,
  icone,
  selo,
  children
}: {
  id: string
  titulo: string
  icone: IconeNome
  selo?: ReactNode
  children: ReactNode
}) {
  const tituloId = useId()
  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={tituloId}
      style={PAD}
      className="scroll-mt-5"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <Icone nome={icone} tamanho={20} />
        <h2 id={tituloId} className="font-bold text-[17px]">
          {titulo}
        </h2>
        {selo}
      </div>
      {children}
    </Card>
  )
}

/** Linha de ajuste (`setRow`): título, linha de apoio e a ação à direita. */
function Linha({
  titulo,
  sub,
  acao,
  primeira,
  children
}: {
  titulo: string
  sub?: ReactNode
  acao?: ReactNode
  primeira?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={`flex min-h-16 flex-wrap items-center gap-4 py-3 ${primeira ? '' : 'border-[var(--painel-line)] border-t'}`}
    >
      <div className="min-w-0 flex-1 basis-60">
        <h3 className="font-bold text-[15px]">{titulo}</h3>
        {sub ? (
          <p className="break-words text-[13px] text-[var(--painel-muted)] leading-[1.4]">
            {sub}
          </p>
        ) : null}
        {children}
      </div>
      {acao}
    </div>
  )
}

function ContaEAcesso({ nome, email }: { nome: string; email: string }) {
  const signOut = useSignOut('/login')
  const [senha, setSenha] = useState(false)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const salvar = useMutation({
    mutationFn: (name: string) =>
      persistProfileUser(authClient.updateUser, { name }),
    onSuccess: () => {
      setEditando(false)
      toast.success('Nome atualizado.')
    },
    onError: (err) =>
      setErro(getUserFacingMessage(err, 'Não foi possível salvar o nome.'))
  })

  return (
    <Secao id="conta" titulo="Conta e acesso" icone="gear">
      {editando ? (
        <form
          method="post"
          className="flex flex-wrap items-end gap-3 py-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            const name = rascunho.trim()
            if (name.length < 2) {
              setErro('Informe o nome de quem responde pelo bar.')
              return
            }
            setErro(null)
            salvar.mutate(name)
          }}
        >
          <Campo
            className="min-w-0 flex-1 basis-60"
            rotulo="Responsável"
            autoComplete="name"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            aria-invalid={erro ? true : undefined}
            dica={
              erro ? (
                <span role="alert" className="text-[var(--painel-live)]">
                  {erro}
                </span>
              ) : undefined
            }
          />
          <div className="flex gap-2 pb-0.5">
            <Botao altura={38} onClick={() => setEditando(false)}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              variante="ink"
              altura={38}
              disabled={salvar.isPending}
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        </form>
      ) : (
        <Linha
          primeira
          titulo="Responsável"
          sub={nome || '—'}
          acao={
            <Botao
              altura={38}
              onClick={() => {
                setRascunho(nome)
                setErro(null)
                setEditando(true)
              }}
            >
              Editar
            </Botao>
          }
        />
      )}
      <Linha
        titulo="E-mail de acesso"
        sub={email || '—'}
        acao={<Badge tipo="muted">Somente leitura</Badge>}
      />
      <Linha
        titulo="Senha"
        sub="Ao trocar, os outros acessos são encerrados."
        acao={
          <Botao altura={38} onClick={() => setSenha(true)}>
            Alterar senha
          </Botao>
        }
      />
      <Linha
        titulo="Sair"
        sub="Encerrar a sessão neste navegador."
        acao={
          <Botao altura={38} onClick={() => void signOut()}>
            Sair da conta
          </Botao>
        }
      />
      <PasswordDialog open={senha} onOpenChange={setSenha} />
    </Secao>
  )
}

const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit'
})
const DIA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

/** "agora", "hoje, 18:20", "ontem, 23:10", "10 de out., 21:40". */
function quando(valor: Date | string, now = new Date()) {
  const data = new Date(valor)
  if (now.getTime() - data.getTime() < 5 * 60_000) return 'agora'
  const dias = Math.round(
    (new Date(now).setHours(0, 0, 0, 0) - new Date(data).setHours(0, 0, 0, 0)) /
      86_400_000
  )
  const hora = HORA.format(data)
  if (dias === 0) return `hoje, ${hora}`
  if (dias === 1) return `ontem, ${hora}`
  return `${DIA.format(data)}, ${hora}`
}

function Seguranca({ enabled }: { enabled: boolean }) {
  const [modo, setModo] = useState<DialogMode>(null)
  const {
    sessions,
    sessionsErrorFeedback,
    ordered,
    otherCount,
    currentId,
    revoking,
    revoke,
    revokeOthers
  } = useAccountSessions()

  return (
    <Secao id="seguranca" titulo="Segurança" icone="lock">
      <Linha
        primeira
        titulo="Verificação em duas etapas"
        sub="Pede um código do app autenticador ao entrar."
        acao={
          <span className="flex flex-wrap items-center gap-2.5">
            {enabled ? (
              <>
                <Badge tipo="acid">Ativada</Badge>
                <Botao altura={38} onClick={() => setModo('regenerate')}>
                  Gerenciar
                </Botao>
              </>
            ) : (
              <>
                <Badge tipo="muted">Desativada</Badge>
                <Botao
                  variante="ink"
                  altura={38}
                  onClick={() => setModo('enable')}
                >
                  Ativar
                </Botao>
              </>
            )}
          </span>
        }
      />
      <EnableTwoFactorDialog
        open={modo === 'enable'}
        onClose={() => setModo(null)}
      />
      <ManageTwoFactorDialog
        mode={modo === 'regenerate' || modo === 'disable' ? modo : null}
        onModeChange={setModo}
      />

      <div className="mt-1.5 border-[var(--painel-line)] border-t pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-bold text-[15px]">Sessões ativas</h3>
          {sessions.data ? (
            <span className="text-[13px] text-[var(--painel-muted)]">
              {ordered.length === 1
                ? '1 dispositivo'
                : `${ordered.length} dispositivos`}
            </span>
          ) : null}
        </div>
        <div aria-busy={sessions.isLoading || undefined} aria-live="polite">
          {sessions.isLoading ? (
            <p className="py-3 text-[13px] text-[var(--painel-muted)]">
              Carregando acessos ativos…
            </p>
          ) : sessions.isError ? (
            <div
              role="alert"
              className="py-3 text-[13px] text-[var(--painel-live)]"
            >
              {sessionsErrorFeedback?.message}{' '}
              {sessionsErrorFeedback?.retryable ? (
                <button
                  type="button"
                  onClick={() => void sessions.refetch()}
                  className="font-bold underline underline-offset-2"
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : (
            <ul>
              {ordered.map((session, index) => {
                const atual = session.id === currentId
                const device = describeDevice(session.userAgent)
                const celular = /iPhone|Android/.test(session.userAgent ?? '')
                return (
                  <li
                    key={session.id}
                    className={`flex items-center gap-3.5 py-3 ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
                  >
                    <Icone nome={celular ? 'phone' : 'tv'} tamanho={22} />
                    <div className="min-w-0 flex-1">
                      <b className="block text-[14.5px]">{device.label}</b>
                      <span className="block break-all text-[12.5px] text-[var(--painel-muted)]">
                        {/* A string crua só quando o rótulo não reconheceu
                            nada (WEB-310): é a única pista do acesso. */}
                        {device.recognized
                          ? `IP ${session.ipAddress ?? 'não informado'}`
                          : (session.userAgent ??
                            'Navegador não informado')}{' '}
                        · {quando(session.updatedAt)}
                      </span>
                    </div>
                    {atual ? (
                      <Badge tipo="acid">Este navegador</Badge>
                    ) : (
                      <button
                        type="button"
                        disabled={revoking !== null}
                        onClick={() => void revoke(session)}
                        aria-label={`Encerrar ${device.label}`}
                        className="font-bold text-[13.5px] text-[var(--painel-live)] disabled:opacity-50"
                      >
                        {revoking === session.id ? 'Encerrando…' : 'Encerrar'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {otherCount > 0 ? (
          <button
            type="button"
            disabled={revoking !== null}
            onClick={() => void revokeOthers()}
            className="font-bold text-[13.5px] disabled:opacity-50"
          >
            {revoking === 'all' ? 'Encerrando…' : 'Encerrar todas as outras'}
          </button>
        ) : null}
        <p className="mt-2 text-[12.5px] text-[var(--painel-muted)]">
          Dispositivo confiável da verificação em duas etapas não aparece nesta
          lista.
        </p>
      </div>
    </Secao>
  )
}

const AVISOS = [
  {
    titulo: 'Resumo semanal por e-mail',
    sub: 'Toda segunda: quem foi, códigos validados e jogos da semana.'
  },
  {
    titulo: 'Jogo lotando',
    sub: 'Avisa quando mais de 20 pessoas marcarem que vão a um jogo.'
  },
  {
    titulo: 'Grade vazia',
    sub: 'Lembra de cadastrar jogos quando a semana estiver sem nenhum.'
  }
] as const

/** Os avisos por e-mail ainda não existem: a tela mostra o que vem. */
function Avisos() {
  return (
    <Secao id="avisos" titulo="Avisos" icone="bell" selo={<EmBreve />}>
      {AVISOS.map((aviso, index) => (
        <Linha
          key={aviso.titulo}
          primeira={index === 0}
          titulo={aviso.titulo}
          sub={aviso.sub}
          acao={
            <Toggle
              ligado={false}
              onChange={() => {}}
              disabled
              rotulo={`${aviso.titulo} (em breve)`}
            />
          }
        />
      ))}
      <Linha
        titulo="Notificações no celular"
        sub="Gerenciadas no app Onside."
        acao={
          <span className="flex items-center gap-2 font-bold text-[13.5px] text-[var(--painel-muted)]">
            Abrir no app → <EmBreve />
          </span>
        }
      />
    </Secao>
  )
}

function Privacidade() {
  const trpc = useTRPC()
  const pedir = useMutation(
    trpc.account.requestExport.mutationOptions({
      onSuccess: ({ email }) =>
        toast.success(
          `Arquivo enviado para ${email}. Pode levar alguns minutos para chegar.`
        ),
      // A recusa do limite diário já chega escrita para quem usa.
      onError: (err) =>
        toast.error(
          getErrorCode(err) === 'TOO_MANY_REQUESTS'
            ? err.message
            : getUserFacingMessage(
                err,
                'Não conseguimos enviar o arquivo agora. Tente de novo em instantes.'
              )
        )
    })
  )
  return (
    <Secao id="privacidade" titulo="Privacidade" icone="doc">
      <Linha
        primeira
        titulo="Baixar meus dados"
        sub="Um arquivo com os dados da conta e do bar, enviado por e-mail."
        acao={
          <Botao
            altura={38}
            disabled={pedir.isPending}
            onClick={() => pedir.mutate()}
          >
            {pedir.isPending ? 'Enviando…' : 'Pedir arquivo'}
          </Botao>
        }
      />
    </Secao>
  )
}

function Excluir({ nomeBar }: { nomeBar: string }) {
  const [aberto, setAberto] = useState(false)
  const { eligibility, endsSubscription, loading, error } =
    useDeletionEligibility('pub')
  return (
    <section
      id="excluir"
      aria-labelledby="excluir-titulo"
      className="flex scroll-mt-5 flex-wrap items-center gap-4 rounded-[7px] px-[22px] py-5 shadow-[inset_0_0_0_1.5px_rgb(201_43_12/45%)]"
      aria-busy={loading || undefined}
    >
      <div className="min-w-0 flex-1 basis-72">
        <h2
          id="excluir-titulo"
          className="font-bold text-[16px] text-[var(--painel-live)]"
        >
          Excluir conta e bar
        </h2>
        <p className="mt-1 text-[13.5px] text-[var(--painel-muted)] leading-[1.45]">
          {nomeBar} sai do mapa na hora
          {endsSubscription ? ' e a assinatura é cancelada' : ''}. Não dá para
          desfazer.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-2 text-[13px] text-[var(--painel-live)]"
          >
            {error.message}{' '}
            {error.retryable ? (
              <button
                type="button"
                onClick={() => void eligibility.refetch()}
                className="font-bold underline underline-offset-2"
              >
                Tentar novamente
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <Botao
        variante="danger"
        disabled={loading || eligibility.isError}
        onClick={() => setAberto(true)}
      >
        Excluir conta
      </Botao>
      <DeleteAccountDialog
        open={aberto}
        onClose={() => setAberto(false)}
        endsSubscription={endsSubscription}
        onFailed={() => void eligibility.refetch()}
      />
    </section>
  )
}
