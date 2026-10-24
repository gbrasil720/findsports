import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useMyBar } from '@/components/admin/admin-queries'
import { entradaHead } from '@/components/entrada/auth'
import { MedalhaPlano } from '@/components/entrada/onboarding'
import { EmBreve, Icone, propsBotao } from '@/components/painel'

/**
 * "Seu bar está no ar" (design 4r/4w): a tela depois do cadastro do bar, com o
 * teste grátis e o próximo passo, que é pôr jogo na grade. As sugestões da
 * rodada do design não existem ainda (WEB-433): no lugar da lista, o atalho
 * para cadastrar o primeiro jogo, com o formulário aberto
 * (`/admin/jogos?novo=1`, o `validateSearch` da tela de Jogos).
 *
 * Só para bar com o cadastro feito; o guard deixa esta passar entre as
 * `/onboarding/*` (`PUB_LIVE_PATH`).
 */
export const Route = createFileRoute('/(onboarding)/onboarding/pub_/no-ar')({
  beforeLoad: ({ context, location }) => {
    const user = context.session?.user
    if (!user) {
      throw redirect({ to: '/login', search: { callbackUrl: location.href } })
    }
    if (user.role !== 'pub' || !user.onboardingCompleted) {
      throw redirect({ to: '/onboarding/pub' })
    }
  },
  head: () =>
    entradaHead({
      path: '/onboarding/pub/no-ar',
      title: 'Seu bar está no ar — Onside',
      description: 'Seu bar já aparece para os torcedores da região.',
      indexable: false
    }),
  component: NoAr
})

/** Os quadradinhos soltos do design, por cima do fundo. */
const CONFETE = [
  [120, 90, 'var(--painel-acid)'],
  [640, 140, 'var(--painel-live-fill)'],
  [90, 700, 'var(--painel-fg)'],
  [700, 760, 'var(--painel-acid)']
] as const

function NoAr() {
  const { data: bar } = useMyBar()
  const plano = PLAN_NAMES[ONBOARDING_TRIAL.plan]

  return (
    <div className="onside-app painel entrada">
      <div className="entrada-noar">
        {CONFETE.map(([x, y, cor], k) => (
          <span
            key={`${x}-${y}`}
            aria-hidden="true"
            className="entrada-noar-confete"
            style={{
              left: x,
              top: y,
              background: cor,
              transform: `rotate(${k * 30}deg)`
            }}
          />
        ))}

        <main className="entrada-noar-texto">
          <span className="entrada-noar-check" aria-hidden="true">
            <Icone nome="check" tamanho={42} />
          </span>
          <h1
            className="entrada-disp"
            style={{ '--entrada-disp': '72px', marginTop: 10 } as never}
          >
            Seu bar está <span className="entrada-tint">no ar.</span>
          </h1>
          <p>
            {bar ? (
              <>
                {bar.name} já aparece no mapa
                {bar.neighborhood ? `, em ${bar.neighborhood}` : ''}.{' '}
              </>
            ) : null}
            Agora falta o que o torcedor procura: <b>onde vai passar o jogo</b>.
          </p>
          <div className="entrada-noar-plano">
            <MedalhaPlano />
            <div>
              <b>
                {plano} grátis por {ONBOARDING_TRIAL.days} dias
              </b>
              Sem cartão. Jogos ilimitados, oferta da casa e lista de quem vai.
            </div>
          </div>
          <Link to="/plan" className="entrada-noar-planos">
            Conhecer os planos →
          </Link>
        </main>

        <aside className="entrada-noar-lado" aria-labelledby="noar-proximo">
          <div>
            <span className="entrada-noar-kicker">
              <Icone
                nome="fire"
                tamanho={20}
                acento="var(--painel-live-fill)"
              />
              Próximo passo
            </span>
            <h2
              id="noar-proximo"
              className="entrada-disp"
              style={{ '--entrada-disp': '40px' } as never}
            >
              Coloque os jogos da semana no ar
            </h2>
            <p>Bar sem jogo na grade não aparece nas buscas do dia.</p>
          </div>
          <div className="entrada-noar-sugestoes">
            <Icone nome="spark" tamanho={22} />
            <div>
              <b>Sugestões da rodada</b>
              Os jogos que os torcedores perto de você seguem, para marcar e
              publicar de uma vez.
            </div>
            <EmBreve />
          </div>
          <div className="entrada-noar-pe">
            <Link
              to="/admin/jogos"
              search={{ novo: 1 }}
              {...propsBotao({ variante: 'acid' })}
            >
              <Icone nome="bolt" tamanho={18} acento="var(--painel-ink)" />
              Cadastrar o primeiro jogo
            </Link>
            <Link to="/admin">Fazer isso depois</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
