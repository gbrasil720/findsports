import { useRouteContext } from '@tanstack/react-router'
import { CookiePreferencesButton } from '@/components/consent/cookie-consent'
import {
  LANDING_COPY,
  NAV_ITEMS,
  SOCIAL_LINKS
} from '../onside-landing-content'
import { Logo } from './icons'
import { ThemeSwitch } from './theme-switch'

/*
 * Cabeçalho e rodapé do redesign (WEB-501): os da landing, que as páginas de
 * texto (termos, privacidade, guia) também usam. Precisam estar dentro de um
 * `.lp3`, que traz os tokens e o CSS.
 */

export const BAR_SIGNUP_HREF = '/signup?role=pub'

/** Com sessão, as chamadas levam ao app; sem, ao cadastro (WEB-278). */
export function usePrimaryCta() {
  const session = useRouteContext({
    from: '__root__',
    select: (ctx) => Boolean(ctx.session)
  })
  return session
    ? { session, href: '/app', kind: 'app', short: 'Ver jogos de hoje' }
    : {
        session,
        href: '/signup',
        kind: 'signup',
        short: LANDING_COPY.primaryCta
      }
}
export type Cta = ReturnType<typeof usePrimaryCta>

/**
 * `home`: prefixo das âncoras da landing. Vazio nela mesma, `/` nas páginas
 * que apontam de volta para ela.
 */
type ChromeProps = { home?: '' | '/' }

export function SiteNav({ home = '' }: ChromeProps) {
  const cta = usePrimaryCta()
  return (
    <header>
      <nav className="nav" id="lp3-nav" aria-label="Principal">
        <a className="logo" href={`${home}#top`} aria-label="Onside, início">
          <Logo />
          <b>
            ONSIDE<i></i>
          </b>
        </a>
        <div className="links">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={`${home}${item.href}`}>
              {item.label}
            </a>
          ))}
        </div>
        <div className="right">
          <ThemeSwitch variant="nav" />
          <a
            className="btn btn-ghost"
            href={BAR_SIGNUP_HREF}
            data-cta="nav_pub_signup"
          >
            Cadastre seu bar
          </a>
          <a
            className="btn btn-acid"
            href={cta.href}
            data-cta={`nav_${cta.kind}`}
          >
            {cta.short}
          </a>
        </div>
      </nav>
    </header>
  )
}

/** `current`: a página aberta, acesa na coluna dela. */
export function SiteFooter({
  home = '',
  current
}: ChromeProps & { current?: '/termos' | '/privacidade' }) {
  const cta = usePrimaryCta()
  const here = (href: string) =>
    href === current ? { 'aria-current': 'page' as const } : {}
  return (
    <footer className="foot">
      <div className="wrap foot-grid">
        <div className="foot-lead">
          <a
            className="logo"
            href={`${home}#top`}
            aria-label="Onside, início"
            style={{ color: 'var(--paper)' }}
          >
            <Logo size={26} />
            <b style={{ fontSize: '22px' }}>
              ONSIDE<i></i>
            </b>
          </a>
          <p>Feito por quem prefere a mesa ao sofá.</p>
          <a
            className="btn btn-acid"
            href={cta.href}
            data-cta={`footer_${cta.kind}`}
          >
            {cta.short}
          </a>
        </div>
        <nav className="foot-cols" aria-label="Rodapé">
          <div className="foot-col">
            <p>Produto</p>
            {NAV_ITEMS.map((item) => (
              <a key={item.id} href={`${home}${item.href}`}>
                {item.label}
              </a>
            ))}
            <a href="/guia">Guia</a>
          </div>
          <div className="foot-col conta">
            <p>Conta</p>
            {cta.session ? (
              <a href={cta.href}>{cta.short}</a>
            ) : (
              <>
                <a href="/login">Entrar</a>
                <a href="/signup">Criar conta</a>
              </>
            )}
          </div>
          <div className="foot-col">
            <p>Para bares</p>
            <a href={BAR_SIGNUP_HREF} data-cta="footer_pub_signup">
              Cadastre seu bar
            </a>
            <a href="mailto:contato@onside.sh">Fale com a gente</a>
          </div>
          <div className="foot-col">
            <p>Onside</p>
            <a href="mailto:contato@onside.sh">Contato</a>
            <a href="/termos" {...here('/termos')}>
              Termos
            </a>
            <a href="/privacidade" {...here('/privacidade')}>
              Privacidade
            </a>
            <CookiePreferencesButton />
          </div>
          <div className="foot-col">
            <p>Redes sociais</p>
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {social.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
      <div className="wrap foot-bar">
        <div className="foot-meta">
          <span>© 2026 Onside</span>
          <span className="st">{LANDING_COPY.footerStatus}</span>
        </div>
        <ThemeSwitch />
      </div>
    </footer>
  )
}
