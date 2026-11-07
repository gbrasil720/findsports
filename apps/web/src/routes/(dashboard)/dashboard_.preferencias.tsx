import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PasswordDialog } from '@/components/account/account-settings'
import {
  DeleteAccountDialog,
  useDeletionEligibility
} from '@/components/account/delete-account-settings'
import {
  type DialogMode,
  EnableTwoFactorDialog,
  ManageTwoFactorDialog
} from '@/components/account/two-factor-settings'
import {
  CityField,
  type CityFieldValue,
  cityFieldValue,
  isCityPending
} from '@/components/app/city-field'
import {
  BaixarDados,
  Cookies,
  Responsavel,
  Sessoes
} from '@/components/painel/configuracoes'
import { compressProfileImage } from '@/components/profile/profile-image'
import { persistProfileUser } from '@/components/profile/profile-user-update'
import { type FavoriteTeam, TeamPicker } from '@/components/sports/team-picker'
import { Ic, type IconName } from '@/components/torcedor/icones'
import { TorcedorShell, useTorcedor } from '@/components/torcedor/shell'
import { normalizeRadiusKm } from '@/domain/discovery'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { authClient, refreshSessionCache } from '@/lib/auth-client'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { uploadMedia } from '@/lib/upload-media'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Aba = 'pref' | 'avisos' | 'conta' | 'priv'

export const Route = createFileRoute('/(dashboard)/dashboard_/preferencias')({
  head: () => ({
    meta: [
      { title: 'Preferências — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  validateSearch: (search: Record<string, unknown>): { aba?: Aba } =>
    search.aba === 'avisos' || search.aba === 'conta' || search.aba === 'priv'
      ? { aba: search.aba }
      : {},
  component: Preferencias
})

const ABAS: [Aba, string, IconName][] = [
  ['pref', 'Preferências', 'fan'],
  ['avisos', 'Avisos', 'bell'],
  ['conta', 'Conta', 'person'],
  ['priv', 'Privacidade', 'lock']
]

/**
 * Preferências do torcedor no web (WEB-501, protótipo `#preferencias`): o
 * que a busca e as sugestões levam em conta, os avisos (em breve), a conta e
 * a privacidade. Conta e privacidade usam as peças das Configurações do
 * painel, que já são do redesign.
 */
function Preferencias() {
  return (
    <TorcedorShell aba="preferencias">
      <Conteudo />
    </TorcedorShell>
  )
}

function Conteudo() {
  const session = useSession()
  const aba: Aba = Route.useSearch().aba ?? 'pref'
  return (
    <div className="page">
      <div className="k">{session?.user.name}</div>
      <h1 className="disp">Preferências</h1>
      <div className="prefs">
        <nav className="pnav" aria-label="Seções">
          {ABAS.map(([id, rotulo, icone]) => (
            <Link
              key={id}
              to="/dashboard/preferencias"
              search={id === 'pref' ? {} : { aba: id }}
              replace
              className={aba === id ? 'on' : undefined}
              aria-current={aba === id ? 'page' : undefined}
            >
              <Ic n={icone} s={18} />
              {rotulo}
            </Link>
          ))}
        </nav>
        <div>
          {aba === 'pref' ? <Gosto /> : null}
          {aba === 'avisos' ? <Avisos /> : null}
          {aba === 'conta' ? <Conta /> : null}
          {aba === 'priv' ? <Privacidade /> : null}
        </div>
      </div>
    </div>
  )
}

function Gosto() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const session = useSession()
  const { avisar } = useTorcedor()
  const esportes = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY
  })
  const meus = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const times = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const cidade = useQuery(trpc.pubs.getMyCity.queryOptions())
  const [raio, setRaio] = useState(
    normalizeRadiusKm(session?.user.searchRadiusKm)
  )
  const [local, setLocal] = useState<CityFieldValue>(cityFieldValue(null))
  useEffect(() => {
    if (cidade.data) setLocal(cityFieldValue(cidade.data))
  }, [cidade.data])

  const erro = (texto: string) => (e: unknown) =>
    avisar(getUserFacingMessage(e, texto))
  const salvarEsportes = useMutation(
    trpc.pubs.updateMyPreferences.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyPreferences.queryKey()
        }),
      onError: erro('Não deu para salvar seus esportes.')
    })
  )
  const salvarTimes = useMutation(
    trpc.pubs.updateMyTeams.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyTeams.queryKey()
        }),
      onError: erro('Não deu para salvar seus times.')
    })
  )
  const salvarCidade = useMutation(
    trpc.pubs.updateMyCity.mutationOptions({
      onSuccess: () => {
        avisar('Cidade salva.')
        return queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyCity.queryKey()
        })
      },
      onError: erro('Não deu para salvar a cidade.')
    })
  )
  const recomecar = useMutation(
    trpc.recommendations.reset.mutationOptions({
      onSuccess: () =>
        avisar('Sugestões recomeçadas. A próxima rodada começa do zero.'),
      onError: erro('Não deu para recomeçar as sugestões.')
    })
  )

  const marcados = new Set((meus.data ?? []).map((p) => p.sportId))
  const escolhidos = (esportes.data ?? []).filter((s) => marcados.has(s.id))
  const alternar = (id: string) => {
    const novos = marcados.has(id)
      ? [...marcados].filter((x) => x !== id)
      : [...marcados, id]
    if (!novos.length) {
      avisar('Fique com pelo menos um esporte.')
      return
    }
    salvarEsportes.mutate({ sportIds: novos })
  }
  const salvarRaio = async () => {
    const { error } = await authClient.updateUser({ searchRadiusKm: raio })
    if (error) {
      avisar(getUserFacingMessage(error, 'Não deu para salvar o raio.'))
      return
    }
    await refreshSessionCache()
    await queryClient.invalidateQueries()
    avisar(`Raio salvo: até ${raio} km.`)
  }

  return (
    <>
      <section className="box2" aria-labelledby="p-esp">
        <h3 id="p-esp">Esportes</h3>
        <p className="d">O que aparece primeiro na régua e nas sugestões.</p>
        <div className="chips2">
          {(esportes.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={marcados.has(s.id)}
              disabled={salvarEsportes.isPending}
              onClick={() => alternar(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </section>
      <section className="box2" aria-labelledby="p-times">
        <h3 id="p-times">Seus times</h3>
        <p className="d">
          Avisamos no app quando um bar perto passar o jogo deles.
        </p>
        {escolhidos.length ? (
          <div className="tc-picker">
            <TeamPicker
              sports={escolhidos}
              selected={(times.data ?? []) as FavoriteTeam[]}
              onChange={(lista) =>
                salvarTimes.mutate({ teamIds: lista.map((t) => t.id) })
              }
            />
          </div>
        ) : (
          <p className="d">Escolha um esporte para ver os times.</p>
        )}
      </section>
      <section className="box2" aria-labelledby="p-raio">
        <h3 id="p-raio">Até onde você topa ir</h3>
        <p className="d">
          Raio da busca: <b>{raio} km</b>
        </p>
        <input
          className="rng"
          type="range"
          min={1}
          max={50}
          step={1}
          value={raio}
          aria-label="Raio em km"
          onChange={(e) => setRaio(Number(e.target.value))}
          onPointerUp={() => void salvarRaio()}
          onKeyUp={() => void salvarRaio()}
        />
        <div className="rngl">
          <span>1 km</span>
          <span>50 km</span>
        </div>
        <form
          className="row2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (local.city) salvarCidade.mutate(local.city)
          }}
        >
          <div className="tc-cidade">
            <CityField
              label="Cidade"
              value={local}
              onChange={setLocal}
              hint="Sem a localização do navegador, a busca parte do centro dela."
            />
          </div>
          <button
            className="btn b-ghost sm"
            type="submit"
            disabled={
              !local.city || isCityPending(local) || salvarCidade.isPending
            }
          >
            {salvarCidade.isPending ? 'Salvando…' : 'Salvar cidade'}
          </button>
        </form>
      </section>
      <section className="box2" aria-labelledby="p-sug">
        <h3 id="p-sug">Sugestões</h3>
        <div className="row2" style={{ border: 0 }}>
          <span>
            <b>Recomeçar sugestões</b>
            <span>
              Esquece os bares que você passou e começa do zero na próxima
              rodada.
            </span>
          </span>
          <button
            className="btn b-ghost sm"
            type="button"
            disabled={recomecar.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Recomeçar suas sugestões? Esportes, raio, favoritos e avaliações continuam.'
                )
              )
                recomecar.mutate()
            }}
          >
            {recomecar.isPending ? 'Recomeçando…' : 'Recomeçar'}
          </button>
        </div>
      </section>
    </>
  )
}

function Avisos() {
  const linhas: [string, string][] = [
    ['Jogo dos seus times perto', 'Quando um bar no seu raio publica o jogo.'],
    ['Lembrete do jogo marcado', '3 horas antes, com o código.'],
    ['Rodada de Bares pra você', 'Todo dia às 10:00.']
  ]
  return (
    <section className="box2" aria-labelledby="p-av">
      <h3 id="p-av">Avisos</h3>
      <p className="d">
        Os avisos chegam pelo app. Escolher aqui no web chega em breve.
      </p>
      {linhas.map(([titulo, texto]) => (
        <div key={titulo} className="row2">
          <span>
            <b>{titulo}</b>
            <span>{texto}</span>
          </span>
          <span className="soonb">EM BREVE</span>
        </div>
      ))}
      <div className="row2">
        <span>
          <b>Notificação no celular</b>
          <span>Pelo app, quando chegar às lojas.</span>
        </span>
        <span className="soonb">EM BREVE</span>
      </div>
    </section>
  )
}

function Conta() {
  const session = useSession()
  const signOut = useSignOut('/')
  const [senha, setSenha] = useState(false)
  const [twoFactor, setTwoFactor] = useState<DialogMode>(null)
  const [excluir, setExcluir] = useState(false)
  const del = useDeletionEligibility('fan')
  const ligado = session?.user.twoFactorEnabled === true
  return (
    <div className="pn3 tc-pn">
      <section className="box2" aria-labelledby="p-dados">
        <h3 id="p-dados">Seus dados</h3>
        <div className="pn-lines">
          <Responsavel
            name={session?.user.name ?? ''}
            rotulo="Nome"
            vazio="Informe seu nome."
          />
          <div className="pn-ln">
            <span>
              <b>E-mail</b>
              <span>{session?.user.email ?? '—'}</span>
            </span>
            <span className="pn-badge">SÓ LEITURA</span>
          </div>
          <Foto />
        </div>
      </section>
      <section className="box2" aria-labelledby="p-acesso">
        <h3 id="p-acesso">Acesso</h3>
        <div className="pn-lines">
          <div className="pn-ln">
            <span>
              <b>Senha</b>
              <span>Ao trocar, os outros aparelhos saem.</span>
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
              <b>Duas etapas</b>
              <span>Código do app autenticador ao entrar.</span>
            </span>
            <button
              type="button"
              className={`pn-btn pn-sm ${ligado ? 'pn-ghost' : 'pn-ink'}`}
              onClick={() => setTwoFactor(ligado ? 'regenerate' : 'enable')}
            >
              {ligado ? 'Gerenciar' : 'Ativar'}
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
        <Sessoes />
      </section>
      <section className="box2 dz2" aria-labelledby="p-del">
        <h3 id="p-del">Excluir conta</h3>
        <p className="d">
          Apaga seus jogos, avaliações e amigos. Não dá para desfazer.
        </p>
        <button
          type="button"
          className="pn-btn pn-danger pn-sm"
          disabled={del.blocked}
          onClick={() => setExcluir(true)}
        >
          Excluir conta
        </button>
      </section>
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
    </div>
  )
}

function Privacidade() {
  return (
    <div className="pn3 tc-pn">
      <section className="box2" aria-labelledby="p-onde">
        <h3 id="p-onde">Onde você foi</h3>
        <p className="d">
          Quem vê os bares e jogos que você marcou e o ranking da cidade se
          escolhem no app, onde ficam os amigos.
        </p>
        <span className="soonb">NO WEB EM BREVE</span>
      </section>
      <section className="box2" aria-labelledby="p-seus">
        <h3 id="p-seus">Seus dados</h3>
        <div className="pn-lines">
          <Cookies />
          <BaixarDados descricao="Enviamos um arquivo para o seu e-mail com perfil, jogos, avaliações e favoritos. Um pedido a cada 24 h." />
        </div>
      </section>
    </div>
  )
}

/** A foto do perfil: o mesmo envio do perfil antigo (`/api/user/avatar`). */
function Foto() {
  const session = useSession()
  const { avisar } = useTorcedor()
  const arquivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const tem = Boolean(session?.user.image)

  const trocar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      avisar('Imagem muito grande. Máximo 5 MB.')
      return
    }
    setEnviando(true)
    try {
      const image = await uploadMedia(
        '/api/user/avatar',
        await compressProfileImage(file)
      )
      await persistProfileUser(authClient.updateUser, { image })
      avisar('Foto trocada.')
    } catch {
      avisar('Não deu para enviar a foto. Tente de novo.')
    } finally {
      setEnviando(false)
      if (arquivo.current) arquivo.current.value = ''
    }
  }
  const remover = async () => {
    if (!window.confirm('Remover sua foto de perfil?')) return
    setEnviando(true)
    try {
      // Arquivo primeiro: repetir conserta uma falha no meio.
      const removed = await fetch('/api/user/avatar', { method: 'DELETE' })
      if (!removed.ok) throw new Error(`remoção ${removed.status}`)
      await persistProfileUser(authClient.updateUser, { image: null })
      avisar('Foto removida.')
    } catch {
      avisar('Não deu para remover a foto. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pn-ln">
      <span>
        <b>Foto</b>
        <span>Aparece no seu perfil e para os amigos no app.</span>
      </span>
      <span className="pn-acts">
        {tem ? (
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            disabled={enviando}
            onClick={() => void remover()}
          >
            Remover
          </button>
        ) : null}
        <label className="pn-btn pn-ghost pn-sm">
          {enviando ? 'Enviando…' : 'Trocar foto'}
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={enviando}
            onChange={(e) => void trocar(e)}
          />
        </label>
      </span>
    </div>
  )
}
