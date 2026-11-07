import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import { FeedbackDialog } from '@/components/app/feedback-dialog'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { type Acao, lerAcao, semAcao } from './acao'
import { FolhaEntrar, type Pedido } from './entrar'
import { Ic, type IconName } from './icones'

/*
 * A casca do web do torcedor (WEB-501, protótipo
 * `docs/design/redesign-2026-11/torcedor`): o cabeçalho com a busca e a conta,
 * as abas de baixo no celular, o aviso (`.toast`) e a folha de entrar. Ver é
 * aberto; o que grava passa por `pedirLogin`, que conclui a ação depois de
 * entrar (`acao.ts`).
 */

export type Aba =
  | 'explorar'
  | 'meus-jogos'
  | 'pra-voce'
  | 'seus-bares'
  | 'perfil'
  | 'preferencias'

type Torcedor = {
  /** Sessão de torcedor (o resto não grava nada de torcedor). */
  fan: boolean
  logado: boolean
  avisar: (texto: string) => void
  /** Sem sessão de torcedor abre a folha; com, conclui na hora. */
  agir: (pedido: Pedido & { acao: Acao }) => void
  pedirLogin: (pedido: Pedido) => void
}

const TorcedorContext = createContext<Torcedor | null>(null)

export function useTorcedor(): Torcedor {
  const valor = useContext(TorcedorContext)
  if (!valor) throw new Error('useTorcedor fora da TorcedorShell')
  return valor
}

function iniciais(nome: string) {
  return (
    nome
      .split(/\s+/)
      .filter(Boolean)
      .map((parte) => parte[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '…'
  )
}

/** Conclui uma ação que pedia conta: marcar presença, salvar o bar. */
function useAcoes(avisar: (texto: string) => void) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const marcar = useMutation(trpc.attendance.set.mutationOptions())
  const salvar = useMutation(trpc.pubs.favorite.mutationOptions())

  return useCallback(
    async (acao: Acao) => {
      try {
        if (acao.tipo === 'vou') {
          const feito = await marcar.mutateAsync({
            eventId: acao.id,
            attending: true
          })
          await queryClient.invalidateQueries()
          if (feito.code) {
            avisar('Pronto: você vai assistir aqui. Este é o seu código.')
            await navigate({
              to: '/dashboard/codigo/$eventId',
              params: { eventId: acao.id }
            })
          } else {
            avisar(
              'Pronto: você vai assistir aqui. Faça check-in quando chegar.'
            )
          }
          return
        }
        if (acao.tipo === 'fav') {
          await salvar.mutateAsync({ barId: acao.id })
          await queryClient.invalidateQueries({
            queryKey: trpc.pubs.getFavorites.queryKey()
          })
          avisar('Bar salvo em Seus bares.')
          return
        }
        avisar('Lembrete de jogo chega em breve no web.')
      } catch (error) {
        avisar(
          getUserFacingMessage(error, 'Não deu para concluir. Tente de novo.')
        )
      }
    },
    [avisar, marcar, salvar, navigate, queryClient, trpc]
  )
}

const ABAS: [Aba, string, IconName, string][] = [
  ['explorar', 'Bares', 'map', '/dashboard'],
  ['meus-jogos', 'Meus jogos', 'ticket', '/dashboard/games'],
  ['pra-voce', 'Pra você', 'sparkle', '/dashboard/pra-voce'],
  ['perfil', 'Você', 'you', '/dashboard/profile']
]

type Props = {
  aba: Aba
  children: ReactNode
  /** O campo de busca do cabeçalho; só o Explorar o usa. */
  busca?: { valor: string; onMudar: (valor: string) => void }
  /** Ex.: "Vila Madalena, SP", ao lado da busca. */
  onde?: ReactNode
}

export function TorcedorShell({ aba, children, busca, onde }: Props) {
  const session = useSession()
  const router = useRouter()
  const trpc = useTRPC()
  const signOut = useSignOut()
  const logado = Boolean(session?.user)
  const fan = session?.user.role === 'fan'
  const admin = session?.user.role === 'admin'
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null)
  const [menu, setMenu] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const menuBotao = useRef<HTMLButtonElement>(null)

  const avisar = useCallback(
    (texto: string) => setAviso((atual) => ({ texto, n: (atual?.n ?? 0) + 1 })),
    []
  )
  useEffect(() => {
    if (!aviso) return
    const fim = setTimeout(() => setAviso(null), 3600)
    return () => clearTimeout(fim)
  }, [aviso])

  const concluir = useAcoes(avisar)

  // A ação que voltou do cadastro, do 2FA ou do onboarding na URL.
  const feita = useRef(false)
  useEffect(() => {
    if (!fan || feita.current) return
    const acao = lerAcao(
      new URLSearchParams(window.location.search).get('acao')
    )
    if (!acao) return
    feita.current = true
    window.history.replaceState(
      window.history.state,
      '',
      semAcao(
        window.location.pathname + window.location.search + window.location.hash
      )
    )
    void concluir(acao)
  }, [fan, concluir])

  const agir = useCallback(
    (p: Pedido & { acao: Acao }) => {
      if (fan) void concluir(p.acao)
      else if (logado)
        avisar('Só conta de torcedor marca presença e salva bares.')
      else setPedido(p)
    },
    [fan, logado, concluir, avisar]
  )
  const fechar = useCallback(() => setPedido(null), [])

  const meus = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    enabled: fan,
    meta: { errorToast: false }
  })
  const proximos = meus.data?.filter((jogo) => !jogo.ended).length ?? 0

  useEffect(() => {
    if (!menu) return
    const fora = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menuw')) setMenu(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false)
        menuBotao.current?.focus()
      }
    }
    document.addEventListener('click', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('click', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [menu])

  const nome = session?.user.name ?? ''
  const valor: Torcedor = {
    fan,
    logado,
    avisar,
    agir,
    pedirLogin: setPedido
  }

  return (
    <TorcedorContext.Provider value={valor}>
      <div
        className={`tc${logado ? ' logged' : ''}${pedido ? ' open' : ''}`}
        data-aba={aba}
      >
        <header className="hdr">
          <div className="top-in">
            <Link className="logo" to="/dashboard" aria-label="Onside, início">
              <svg
                width="28"
                height="28"
                viewBox="0 0 30 30"
                aria-hidden="true"
              >
                <circle
                  cx="14"
                  cy="14"
                  r="10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.2"
                />
                <circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c" />
              </svg>
              <b>
                ONSIDE
                <i />
              </b>
            </Link>
            {busca ? (
              <label className="q">
                <Ic n="search" s={21} />
                <span className="sr">Buscar</span>
                <input
                  type="search"
                  placeholder="Time, bar ou bairro"
                  autoComplete="off"
                  value={busca.valor}
                  onChange={(e) => busca.onMudar(e.target.value)}
                />
              </label>
            ) : null}
            {onde ? <span className="where">{onde}</span> : null}
            <span className="sp" />
            <nav aria-label="Conta">
              {logado ? null : (
                <>
                  <Link className="lnk" to="/">
                    Para bares
                  </Link>
                  <button
                    className="btn b-acid sm"
                    type="button"
                    onClick={() => setPedido({ tipo: 'entrar' })}
                  >
                    Entrar
                  </button>
                </>
              )}
              {logado ? (
                <span className="acct">
                  {fan ? (
                    <>
                      <Link
                        to="/dashboard/games"
                        className={aba === 'meus-jogos' ? 'cur' : undefined}
                      >
                        Meus jogos
                        {proximos ? (
                          <span className="n">{proximos}</span>
                        ) : null}
                      </Link>
                      <Link
                        to="/dashboard/pra-voce"
                        className={aba === 'pra-voce' ? 'cur' : undefined}
                      >
                        Pra você
                      </Link>
                      <Link
                        to="/dashboard/seus-bares"
                        className={aba === 'seus-bares' ? 'cur' : undefined}
                      >
                        Seus bares
                      </Link>
                    </>
                  ) : null}
                  <span className="menuw">
                    <button
                      ref={menuBotao}
                      className="ava"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={menu}
                      aria-label={
                        nome ? `Menu da conta de ${nome}` : 'Menu da conta'
                      }
                      onClick={() => setMenu((aberto) => !aberto)}
                    >
                      {session?.user.image ? (
                        <img src={session.user.image} alt="" />
                      ) : (
                        iniciais(nome)
                      )}
                    </button>
                    <div
                      className={`umenu${menu ? ' on' : ''}`}
                      role="menu"
                      aria-label="Conta"
                    >
                      {fan ? (
                        <>
                          <MenuLink to="/dashboard/profile" icone="you">
                            Perfil
                          </MenuLink>
                          <MenuLink to="/dashboard/pra-voce" icone="sparkle">
                            Bares pra você
                          </MenuLink>
                          <MenuLink to="/dashboard/games" icone="ticket">
                            Meus jogos
                          </MenuLink>
                          <MenuLink to="/dashboard/seus-bares" icone="heart">
                            Seus bares
                          </MenuLink>
                          <MenuLink to="/dashboard/preferencias" icone="gear">
                            Preferências
                          </MenuLink>
                        </>
                      ) : null}
                      {admin ? (
                        <MenuLink to="/houdini" icone="shield">
                          Houdini
                        </MenuLink>
                      ) : null}
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenu(false)
                          setFeedback(true)
                        }}
                      >
                        <Ic n="mail" s={19} />
                        Enviar feedback
                      </button>
                      <div className="sep" />
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenu(false)
                          void signOut()
                        }}
                      >
                        <Ic n="close" s={19} />
                        Sair
                      </button>
                    </div>
                  </span>
                </span>
              ) : null}
            </nav>
          </div>
        </header>

        <main id="main-content">{children}</main>

        {fan ? (
          <nav className="ftab" aria-label="Sua conta">
            {ABAS.map(([id, rotulo, icone, para]) => (
              <Link
                key={id}
                to={para}
                className={
                  aba === id ||
                  (id === 'perfil' &&
                    (aba === 'seus-bares' || aba === 'preferencias'))
                    ? 'on'
                    : undefined
                }
              >
                <Ic n={icone} s={22} />
                {rotulo}
              </Link>
            ))}
          </nav>
        ) : null}

        <FolhaEntrar
          pedido={pedido}
          onFechar={fechar}
          onEntrou={async (acao) => {
            await router.invalidate()
            if (acao) await concluir(acao)
            else avisar('Você entrou.')
          }}
        />
        <div className={`toast${aviso ? ' on' : ''}`} role="status">
          <i>
            <Ic n="check" s={16} />
          </i>
          <span>{aviso?.texto}</span>
        </div>
        <FeedbackDialog
          open={feedback}
          onClose={() => setFeedback(false)}
          returnFocus={menuBotao}
        />
      </div>
    </TorcedorContext.Provider>
  )
}

function MenuLink({
  to,
  icone,
  children
}: {
  to: string
  icone: IconName
  children: ReactNode
}) {
  return (
    <Link role="menuitem" to={to}>
      <Ic n={icone} s={19} />
      {children}
    </Link>
  )
}
