import { useState } from 'react'
import { toast } from 'sonner'
import { PasswordDialog } from '@/components/account/account-settings'
import {
  DeleteAccountDialog,
  useDeletionEligibility
} from '@/components/account/delete-account-settings'
import { CONSENT_COPY } from '@/components/account/privacy-settings'
import {
  formatDate,
  useAccountSessions
} from '@/components/account/session-settings'
import {
  type DialogMode,
  EnableTwoFactorDialog,
  ManageTwoFactorDialog
} from '@/components/account/two-factor-settings'
import { useMyBar } from '@/components/admin/admin-queries'
import {
  Bell,
  Close,
  Lock,
  Person,
  Shield
} from '@/components/landing/v3/icons'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import {
  analyticsConfigured,
  setAnalyticsConsent,
  useAnalyticsConsent
} from '@/lib/analytics-consent'
import { authClient } from '@/lib/auth-client'
import { describeDevice } from '@/lib/describe-device'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/*
 * Configurações do painel novo (WEB-501, fase 4; protótipo `config`): conta,
 * segurança, avisos, privacidade e exclusão. Os diálogos (senha, 2FA,
 * exclusão) são os de `components/account/*`, os mesmos do torcedor.
 */

const SECOES = [
  ['cfg-conta', 'Conta e acesso', <Person key="p" size={18} />],
  ['cfg-seg', 'Segurança', <Shield key="s" size={18} />],
  ['cfg-av', 'Avisos', <Bell key="b" size={18} />],
  ['cfg-priv', 'Privacidade', <Lock key="l" size={18} />],
  ['cfg-del', 'Excluir conta', <Close key="c" size={18} />]
] as const

export function ConfiguracoesPage() {
  const session = useSession()
  const barName = useMyBar().data?.name ?? 'seu bar'
  const signOut = useSignOut('/login')
  const [senha, setSenha] = useState(false)
  const [twoFactor, setTwoFactor] = useState<DialogMode>(null)
  const [excluir, setExcluir] = useState(false)
  const del = useDeletionEligibility('pub')
  const twoFactorOn = session?.user.twoFactorEnabled === true

  const pular = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="pn-head">
        <div>
          <p className="pn-k">Conta de quem administra o {barName}</p>
          <h1 className="pn-disp">Configurações</h1>
        </div>
      </div>

      <div className="pn-cfg">
        <nav className="pn-subnav" aria-label="Seções">
          {SECOES.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={id === 'cfg-del' ? 'is-dz' : undefined}
              onClick={() => pular(id)}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>

        <div>
          <section
            className="pn-card pn-sec2"
            id="cfg-conta"
            aria-labelledby="cfg-conta-t"
          >
            <div className="pn-chd">
              <h3 id="cfg-conta-t">Conta e acesso</h3>
            </div>
            <div className="pn-lines">
              <Responsavel name={session?.user.name ?? ''} />
              <div className="pn-ln">
                <span>
                  <b>E-mail de acesso</b>
                  <span>{session?.user.email ?? '—'}</span>
                </span>
                <span className="pn-badge">SÓ LEITURA</span>
              </div>
              <div className="pn-ln">
                <span>
                  <b>Senha</b>
                  <span>Ao trocar, os outros acessos são encerrados.</span>
                </span>
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  onClick={() => setSenha(true)}
                >
                  Alterar senha
                </button>
              </div>
              <div className="pn-ln">
                <span>
                  <b>Sair</b>
                  <span>Encerrar a sessão neste navegador.</span>
                </span>
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  onClick={() => void signOut()}
                >
                  Sair da conta
                </button>
              </div>
            </div>
          </section>

          <section
            className="pn-card pn-sec2"
            id="cfg-seg"
            aria-labelledby="cfg-seg-t"
          >
            <div className="pn-chd">
              <h3 id="cfg-seg-t">Segurança</h3>
            </div>
            <div className="pn-lines">
              <div className="pn-ln">
                <span>
                  <b>
                    Verificação em duas etapas{' '}
                    <span className={`pn-badge${twoFactorOn ? ' is-pub' : ''}`}>
                      {twoFactorOn ? 'ATIVADA' : 'DESATIVADA'}
                    </span>
                  </b>
                  <span>
                    {twoFactorOn
                      ? 'Sua conta pede um código do app autenticador ou de recuperação ao entrar.'
                      : 'Pede um código do app autenticador ao entrar, como Google Authenticator, 1Password ou Authy.'}
                  </span>
                </span>
                <button
                  type="button"
                  className={`pn-btn pn-sm ${twoFactorOn ? 'pn-ghost' : 'pn-ink'}`}
                  onClick={() =>
                    setTwoFactor(twoFactorOn ? 'regenerate' : 'enable')
                  }
                >
                  {twoFactorOn ? 'Gerenciar' : 'Ativar'}
                </button>
              </div>
            </div>
            <Sessoes />
          </section>

          <section
            className="pn-card pn-sec2"
            id="cfg-av"
            aria-labelledby="cfg-av-t"
          >
            <div className="pn-chd">
              <h3 id="cfg-av-t">Avisos</h3>
            </div>
            <div className="pn-lines">
              <div className="pn-ln">
                <span>
                  <b>Avisos por e-mail</b>
                  <span>
                    Resumo da semana, jogo lotando e grade vazia, no seu e-mail.
                  </span>
                </span>
                <span className="pn-badge">EM BREVE</span>
              </div>
              <div className="pn-ln">
                <span>
                  <b>Notificações no celular</b>
                  <span>Pelo app Onside, quando ele abrir por link.</span>
                </span>
                <span className="pn-badge">EM BREVE</span>
              </div>
            </div>
          </section>

          <section
            className="pn-card pn-sec2"
            id="cfg-priv"
            aria-labelledby="cfg-priv-t"
          >
            <div className="pn-chd">
              <h3 id="cfg-priv-t">Privacidade</h3>
            </div>
            <div className="pn-lines">
              <Cookies />
              <div className="pn-ln">
                <span>
                  <b>Baixar meus dados</b>
                  <span>
                    Um arquivo com os dados da conta e do bar, enviado por
                    e-mail.
                  </span>
                </span>
                <span className="pn-badge">EM BREVE</span>
              </div>
            </div>
          </section>

          <div className="pn-dz" id="cfg-del">
            <span>
              <b>Excluir conta e bar</b>
              <p>
                O {barName} sai do mapa na hora
                {del.endsSubscription
                  ? ' e a assinatura é encerrada no Stripe'
                  : ''}
                . Não dá para desfazer. Registros fiscais podem continuar com o
                provedor de pagamento.
              </p>
            </span>
            <button
              type="button"
              className="pn-btn pn-danger pn-sm"
              disabled={del.blocked}
              onClick={() => setExcluir(true)}
            >
              Excluir minha conta
            </button>
            {del.eligibility.isLoading ? (
              <p className="sr-only" role="status">
                Verificando a assinatura antes de liberar a exclusão da conta…
              </p>
            ) : null}
            {del.errorFeedback ? (
              <div className="pn-err" role="alert">
                <p>{del.errorFeedback.message}</p>
                {del.errorFeedback.retryable ? (
                  <button
                    type="button"
                    className="pn-btn pn-ghost pn-sm"
                    onClick={() => void del.eligibility.refetch()}
                  >
                    Tentar de novo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PasswordDialog open={senha} onOpenChange={setSenha} />
      <EnableTwoFactorDialog
        open={twoFactor === 'enable'}
        onClose={() => setTwoFactor(null)}
      />
      <ManageTwoFactorDialog
        mode={
          twoFactor === 'regenerate' || twoFactor === 'disable'
            ? twoFactor
            : null
        }
        onModeChange={setTwoFactor}
      />
      <DeleteAccountDialog
        open={excluir}
        onClose={() => setExcluir(false)}
        endsSubscription={del.endsSubscription}
        onFailed={() => void del.eligibility.refetch()}
      />
    </>
  )
}

/** O nome de quem administra: edita na própria linha. */
function Responsavel({ name }: { name: string }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(name)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novo = valor.trim()
    if (novo.length < 2) {
      setErro('Informe o nome de quem administra o bar.')
      return
    }
    setSalvando(true)
    setErro(null)
    const result = await authClient.updateUser({ name: novo })
    setSalvando(false)
    if (result.error) {
      setErro(
        getUserFacingMessage(
          result.error,
          'Não foi possível salvar o nome. Tente novamente.'
        )
      )
      return
    }
    setEditando(false)
    toast.success('Nome salvo.')
  }

  if (!editando)
    return (
      <div className="pn-ln">
        <span>
          <b>Responsável</b>
          <span>{name || '—'}</span>
        </span>
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          onClick={() => {
            setValor(name)
            setErro(null)
            setEditando(true)
          }}
        >
          Editar
        </button>
      </div>
    )

  return (
    <form className="pn-ln pn-ln-ed" onSubmit={salvar} noValidate>
      <label className="pn-fl" htmlFor="cfg-nome">
        <span className="pn-fl-l">Responsável</span>
        <input
          id="cfg-nome"
          className="pn-inp"
          value={valor}
          maxLength={100}
          autoComplete="name"
          aria-invalid={erro ? true : undefined}
          // biome-ignore lint/a11y/noAutofocus: abriu para editar este campo.
          autoFocus
          onChange={(e) => setValor(e.target.value)}
        />
        {erro ? (
          <span className="pn-ferr" role="alert">
            {erro}
          </span>
        ) : null}
      </label>
      <span className="pn-acts">
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          onClick={() => setEditando(false)}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="pn-btn pn-acid pn-sm"
          disabled={salvando}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </span>
    </form>
  )
}

function Sessoes() {
  const {
    current,
    sessions,
    sessionsErrorFeedback,
    ordered,
    otherCount,
    revoking,
    revoke,
    revokeOthers
  } = useAccountSessions()

  return (
    <div className="pn-sessoes" aria-busy={sessions.isLoading || undefined}>
      <div className="pn-chd">
        <h4>Sessões ativas</h4>
        {sessions.data ? (
          <small>
            {ordered.length === 1
              ? '1 aparelho'
              : `${ordered.length} aparelhos`}
          </small>
        ) : null}
      </div>
      {sessions.isLoading ? (
        <p className="pn-note" role="status">
          Carregando acessos ativos…
        </p>
      ) : sessions.isError ? (
        <div className="pn-err" role="alert">
          <p>{sessionsErrorFeedback?.message}</p>
          {sessionsErrorFeedback?.retryable ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void sessions.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {ordered.map((s) => {
            const isCurrent = s.id === current?.session.id
            const device = describeDevice(s.userAgent)
            return (
              <article key={s.id} className="pn-sess">
                <span className="pn-sess-i">
                  <Lock size={18} />
                </span>
                <span>
                  <b>{device.label}</b>
                  {/* Sem rótulo reconhecido, a string crua é a única pista (WEB-310). */}
                  {device.recognized ? null : (
                    <span className="pn-sess-ua">
                      {s.userAgent ?? 'Navegador não informado'}
                    </span>
                  )}
                  <span>
                    IP {s.ipAddress ?? 'não informado'} · atividade{' '}
                    {formatDate(s.updatedAt)}
                  </span>
                </span>
                {isCurrent ? (
                  <span className="pn-ok">Este navegador</span>
                ) : (
                  <button
                    type="button"
                    className="pn-lnk-b pn-rm"
                    disabled={revoking !== null}
                    onClick={() => void revoke(s)}
                  >
                    {revoking === s.id ? 'Encerrando…' : 'Encerrar'}
                  </button>
                )}
              </article>
            )
          })}
          {otherCount > 0 ? (
            <button
              type="button"
              className="pn-go pn-lnk-b"
              disabled={revoking !== null}
              onClick={() => void revokeOthers()}
            >
              {revoking === 'all' ? 'Encerrando…' : 'Encerrar todas as outras'}
            </button>
          ) : null}
          <p className="pn-hint">
            Aparelho confiável da verificação em duas etapas não aparece aqui.
          </p>
        </>
      )}
    </div>
  )
}

/** Cookies de análise (WEB-244): a mesma escolha do aviso das páginas públicas. */
function Cookies() {
  const consent = useAnalyticsConsent()
  // Só há o que escolher onde a análise existe, e a escolha mora no navegador.
  if (!analyticsConfigured() || consent === 'ssr') return null
  const copy = CONSENT_COPY[consent]
  return (
    <div className="pn-ln">
      <span>
        <b>{copy.title}</b>
        <span>
          {copy.description} Detalhes na{' '}
          <a href="/privacidade#s-8">Política de Privacidade</a>.
        </span>
      </span>
      <span className="pn-acts">
        {consent !== 'denied' ? (
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            onClick={() => setAnalyticsConsent('denied')}
          >
            Recusar
          </button>
        ) : null}
        {consent !== 'granted' ? (
          <button
            type="button"
            className="pn-btn pn-ink pn-sm"
            onClick={() => setAnalyticsConsent('granted')}
          >
            Aceitar
          </button>
        ) : null}
      </span>
    </div>
  )
}
