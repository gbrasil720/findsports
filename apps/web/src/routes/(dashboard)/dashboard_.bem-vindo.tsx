import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  confirmDroppingTeams,
  type FavoriteTeam,
  TeamPicker
} from '@/components/sports/team-picker'
import { lerNovo, type Novo } from '@/components/torcedor/acao'
import {
  CONTA_NOVA,
  concluirOnboarding,
  DEPOIS_AVISO,
  useConcluirOnboarding
} from '@/components/torcedor/conta-nova'
import { Ic } from '@/components/torcedor/icones'
import {
  avisarNaProxima,
  TorcedorShell,
  useTorcedor
} from '@/components/torcedor/shell'
import { normalizeRadiusKm } from '@/domain/discovery'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getSafeCallbackUrl } from '@/utils/callback-url'
import { useTRPC } from '@/utils/trpc'

type Busca = { feito?: Novo; callbackUrl?: string }

export const Route = createFileRoute('/(dashboard)/dashboard_/bem-vindo')({
  head: () => ({
    meta: [
      { title: 'Do que você gosta? — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  validateSearch: (search: Record<string, unknown>): Busca => {
    const feito = lerNovo(search.feito)
    return {
      ...(feito ? { feito } : {}),
      ...(typeof search.callbackUrl === 'string'
        ? { callbackUrl: search.callbackUrl }
        : {})
    }
  },
  component: BemVindo
})

/**
 * As preferências da conta nova por uma ação (WEB-501, protótipo
 * `#bem-vindo-curto`): esportes, times e raio numa página só, tudo opcional,
 * com o que já foi feito no topo. "Depois" e "Salvar" concluem o onboarding
 * (`onboarding.completeFan`), e a guarda não manda mais ao de 5 passos.
 */
function BemVindo() {
  return (
    <TorcedorShell aba="perfil" semAbas>
      <Conteudo />
    </TorcedorShell>
  )
}

function Conteudo() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const session = useSession()
  const { avisar } = useTorcedor()
  const search = Route.useSearch()
  const volta = getSafeCallbackUrl(search.callbackUrl ?? '/dashboard')
  const [titulo] = CONTA_NOVA[search.feito ?? 'fav']
  const concluir = useConcluirOnboarding()
  const [salvando, setSalvando] = useState<'depois' | 'salvar' | null>(null)

  const esportes = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })
  const [marcados, setMarcados] = useState<string[]>([])
  const [times, setTimes] = useState<FavoriteTeam[]>([])
  const [raio, setRaio] = useState(() =>
    normalizeRadiusKm(session?.user.searchRadiusKm)
  )
  const escolhidos = (esportes.data ?? []).filter((s) =>
    marcados.includes(s.id)
  )

  const alternar = (id: string) => {
    if (!marcados.includes(id)) return setMarcados([...marcados, id])
    if (!confirmDroppingTeams(times.filter((t) => t.sportId === id))) return
    setTimes(times.filter((t) => t.sportId !== id))
    setMarcados(marcados.filter((x) => x !== id))
  }

  const terminar = async (como: 'depois' | 'salvar') => {
    setSalvando(como)
    const erro = await concluirOnboarding(
      concluir,
      como === 'depois'
        ? {}
        : {
            sportIds: marcados,
            teamIds: times.map((t) => t.id),
            searchRadiusKm: raio
          }
    )
    if (erro) {
      setSalvando(null)
      return avisar(erro)
    }
    if (como === 'salvar')
      analytics.onboardingCompleted({
        role: 'fan',
        sports: escolhidos.map((s) => s.slug),
        radius_km: raio
      })
    avisarNaProxima(
      como === 'depois'
        ? DEPOIS_AVISO
        : 'Pronto. Os seus jogos e bares aparecem primeiro.'
    )
    await navigate({ to: volta, replace: true })
  }

  return (
    <div className="page short">
      <span className="feito">
        <Ic n="check" s={16} />
        {titulo}
      </span>
      <h1 className="disp">
        Do que você <span className="hl">gosta?</span>
      </h1>
      <p className="sub">
        Assim os jogos e os bares que importam pra você aparecem primeiro. Tudo
        opcional, e dá para mudar em Preferências.
      </p>

      <section className="box2" aria-labelledby="bv-esp">
        <h3 id="bv-esp">Esportes</h3>
        <div className="chips2">
          {(esportes.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={marcados.includes(s.id)}
              onClick={() => alternar(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        {esportes.isError ? (
          <div className="row2">
            <span role="alert">Não carregou os esportes.</span>
            <button
              type="button"
              className="btn b-ghost sm"
              disabled={esportes.isFetching}
              onClick={() => esportes.refetch()}
            >
              {esportes.isFetching ? 'Tentando…' : 'Tentar de novo'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="box2" aria-labelledby="bv-times">
        <h3 id="bv-times">Seus times</h3>
        <p className="d">Avisamos quando um bar perto passar o jogo deles.</p>
        {escolhidos.length ? (
          <div className="tc-picker">
            <TeamPicker
              sports={escolhidos}
              selected={times}
              onChange={setTimes}
            />
          </div>
        ) : (
          <p className="d">Escolha um esporte para ver os times.</p>
        )}
      </section>

      <section className="box2" aria-labelledby="bv-raio">
        <h3 id="bv-raio">Até onde você topa ir</h3>
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
          onChange={(e) => setRaio(normalizeRadiusKm(Number(e.target.value)))}
        />
        <div className="rngl">
          <span>1 km</span>
          <span>50 km</span>
        </div>
      </section>

      <div className="obnav">
        <button
          className="btn b-ghost sm"
          type="button"
          disabled={salvando !== null}
          onClick={() => terminar('depois')}
        >
          {salvando === 'depois' ? 'Saindo…' : 'Depois'}
        </button>
        <button
          className="btn b-acid"
          type="button"
          disabled={salvando !== null}
          onClick={() => terminar('salvar')}
        >
          {salvando === 'salvar' ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
