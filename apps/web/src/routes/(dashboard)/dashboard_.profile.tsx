import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AppChegando } from '@/components/torcedor/app-chegando'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell } from '@/components/torcedor/shell'
import { maisVisitados, visitasDoAno } from '@/domain/seus-bares'
import { useSession } from '@/hooks/use-session'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/profile')({
  head: () => ({
    meta: [
      { title: 'Meu perfil — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: Perfil
})

/**
 * O perfil do torcedor no web (WEB-501, protótipo `#perfil`): nível e
 * conquistas (`achievements.mine`), os números do ano, os times e os bares
 * mais visitados. Amigos e ranking ficam no app.
 */
function Perfil() {
  return (
    <TorcedorShell aba="perfil">
      <Conteudo />
    </TorcedorShell>
  )
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Conteudo() {
  const trpc = useTRPC()
  const session = useSession()
  const conquistas = useQuery({
    ...trpc.achievements.mine.queryOptions(),
    meta: { errorToast: false }
  })
  const visitas = useQuery({
    ...trpc.attendance.visits.queryOptions(),
    meta: { errorToast: false }
  })
  const times = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const cidade = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const nome = session?.user.name ?? ''
  const ano = new Date().getFullYear()
  const doAno = visitasDoAno(visitas.data ?? [], ano)
  const topo = maisVisitados(visitas.data ?? []).slice(0, 4)
  const nivel = conquistas.data?.level
  const medalhas = conquistas.data?.achievements ?? []
  const ganhas = medalhas.filter((m) => m.unlockedAt).length
  const falta = nivel?.nextAt != null ? nivel.nextAt - nivel.unlocked : null

  return (
    <div className="page">
      <div className="prof">
        <span className="pic">
          {session?.user.image ? (
            <img src={session.user.image} alt="" />
          ) : (
            iniciais(nome)
          )}
        </span>
        <div>
          <div className="hd">
            {cidade.data
              ? `${cidade.data.name}, ${cidade.data.uf}`
              : 'Torcedor'}
          </div>
          <h1 className="disp">{nome}</h1>
        </div>
        <div className="pa cta-row">
          <Link className="btn b-ghost sm" to="/dashboard/preferencias">
            <Ic n="gear" s={18} />
            Preferências
          </Link>
        </div>
      </div>

      {conquistas.isError ? (
        <div className="empty" role="alert" style={{ marginTop: 24 }}>
          <b>Não carregou</b>
          <p>
            {getUserFacingMessage(
              conquistas.error,
              'Não deu para abrir suas conquistas agora.'
            )}
          </p>
          <button
            type="button"
            className="btn b-ink sm"
            onClick={() => void conquistas.refetch()}
          >
            Tentar de novo
          </button>
        </div>
      ) : nivel ? (
        <div className="lvl">
          <span className="n">{nivel.level}</span>
          <span>
            <b>
              {nivel.name} · nível {nivel.level}
            </b>
            <span>
              {falta === null
                ? 'Você chegou ao último nível.'
                : `Mais ${falta} ${falta === 1 ? 'conquista' : 'conquistas'} para o nível ${nivel.level + 1}.`}
            </span>
            <span className="bar2">
              <i
                style={{
                  width: `${nivel.nextAt ? Math.min(100, (nivel.unlocked / nivel.nextAt) * 100) : 100}%`
                }}
              />
            </span>
          </span>
          <Link className="btn b-acid sm" to="/dashboard/pra-voce">
            Achar bar novo
          </Link>
        </div>
      ) : null}

      <div className="stats3" style={{ marginTop: 22 }}>
        <div>
          <b>{doAno.jogos}</b>
          <span>jogos vistos em bar em {ano}</span>
        </div>
        <div>
          <b>{doAno.bares}</b>
          <span>bares diferentes</span>
        </div>
        <div>
          <b>{doAno.bairros}</b>
          <span>bairros</span>
        </div>
      </div>

      <section className="secx" aria-labelledby="t-conq">
        <div className="hdx">
          <h2 id="t-conq">Conquistas</h2>
          <span className="muted">
            {ganhas} de {medalhas.length}
          </span>
        </div>
        <ul className="medals">
          {medalhas.map((m) => (
            <li key={m.id} className={`medal2${m.unlockedAt ? '' : ' lock'}`}>
              <img
                src={`/torcedor/medalhas/${m.id}${m.unlockedAt ? '' : '-locked'}.webp`}
                alt=""
                width={288}
                height={288}
                loading="lazy"
              />
              <b>{m.name}</b>
              <span>
                {m.unlockedAt
                  ? 'conquistada'
                  : `${Math.min(m.progress, m.target)} de ${m.target}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="secx" aria-labelledby="t-times">
        <div className="hdx">
          <h2 id="t-times">Seus times</h2>
          <Link to="/dashboard/preferencias">Editar</Link>
        </div>
        {times.data?.length ? (
          <div className="teams">
            {times.data.map((t) => (
              <span key={t.id} className="team">
                <span className="cr" style={{ background: '#12120f' }}>
                  {iniciais(t.name) || t.name.slice(0, 3)}
                </span>
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">
            Nenhum time ainda. Escolha em Preferências para ver os jogos deles
            primeiro.
          </p>
        )}
      </section>

      <section className="secx" aria-labelledby="t-top">
        <div className="hdx">
          <h2 id="t-top">Bares mais visitados</h2>
          <Link to="/dashboard/seus-bares">Seus bares</Link>
        </div>
        {topo.length ? (
          <ul className="toplist">
            {topo.map(({ visita, n }, i) => (
              <li key={visita.barId}>
                <span className="p">{i + 1}</span>
                {visita.photoUrl ? (
                  <img src={visita.photoUrl} alt="" />
                ) : (
                  <span className="top-vazio" />
                )}
                <span>
                  <b>{visita.barName}</b>
                  <span>{visita.neighborhood}</span>
                </span>
                <span className="vchip n">
                  {n} {n === 1 ? 'visita' : 'visitas'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Ainda sem visitas. Conta o código validado no balcão ou o check-in
            no bar.
          </p>
        )}
      </section>

      <AppChegando />
      <p className="pastnote">Amigos e ranking ficam no app.</p>
    </div>
  )
}
