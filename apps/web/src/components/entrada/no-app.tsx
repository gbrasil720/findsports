import { APP_SCHEME } from '@findsports_oficial/auth/trusted-origins'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay
} from '@findsports_oficial/db/event-window'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import QRCodeModule from 'react-qr-code'
import { Badge, EmBreve } from '@/components/painel'
import type { BarTeaser } from '@/functions/get-bar-teaser'
import { Disp, Marca } from './auth'

// O pacote é CommonJS: no navegador o componente pode vir em `default`
// (o mesmo desvio de `account/two-factor-settings.tsx`).
const qrModule = QRCodeModule as unknown as { default?: typeof QRCodeModule }
const QRCode = qrModule.default ?? QRCodeModule

const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit'
})
const DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  weekday: 'short'
})

/** "21:30" hoje; "sáb 21:30" em outro dia (sempre no relógio de Brasília). */
export function horaDoJogo(startsAt: string, now = new Date()) {
  const hora = HORA.format(new Date(startsAt))
  if (brasiliaDay(startsAt) === brasiliaDay(now)) return hora
  return `${DIA.format(new Date(startsAt)).replace('.', '')} ${hora}`
}

// O texto da antiga página do convite, que ela substitui.
const CONVITE =
  'Abra no app para aceitar o convite. Se você ainda não tem conta, é só criar pelo app: quem entra pelo convite já vira amigo de quem chamou.'

/** O cartão escuro do bar (`barTeaser`), com o próximo jogo. */
function CartaoBar({ bar }: { bar: BarTeaser }) {
  const next = bar.next
  return (
    <div className="entrada-teaser">
      <div
        className="entrada-teaser-foto"
        style={{
          backgroundImage: `url(${JSON.stringify(bar.photoUrl ?? '/hero-bar.jpg')})`
        }}
      />
      <div className="entrada-teaser-corpo">
        {bar.elite || next?.live ? (
          <div className="entrada-teaser-selos">
            {bar.elite ? <Badge tipo="acid">Elite</Badge> : null}
            {next?.live ? <Badge tipo="live">Ao vivo</Badge> : null}
          </div>
        ) : null}
        <Disp nivel={2} tamanho={40} linhas={[{ texto: bar.name }]} />
        <span className="entrada-teaser-lugar">
          {bar.neighborhood} · {bar.city}
        </span>
        {next ? (
          <div className="entrada-teaser-jogo">
            <span className="entrada-teaser-hora">
              {horaDoJogo(next.startsAt)}
            </span>
            <div>
              <b>{next.title}</b>
              {next.going ? <span>{next.going} vão assistir</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Lojas() {
  return (
    <div className="entrada-lojas">
      {[
        ['Baixar na', 'App Store'],
        ['Disponível no', 'Google Play']
      ].map(([sub, loja]) => (
        <span key={loja} className="entrada-loja" aria-disabled="true">
          <i aria-hidden="true" />
          <span>
            <small>{sub}</small>
            <b>{loja}</b>
          </span>
        </span>
      ))}
      <EmBreve />
    </div>
  )
}

/** O head da página sem bar: `/torcedor` e o link de bar fora do ar. */
export const SEM_BAR_HEAD = {
  title: 'A Onside de torcedor está no app — Onside',
  description:
    'Ache o bar que vai passar o seu jogo, marque que vai assistir e ganhe a oferta da casa no app Onside.'
}

/**
 * O `onside://` do "Abrir no app": o convite de amigo, o bar (só se está no
 * ar; fora do ar o app também não o mostra) ou o app.
 */
export function linkDoApp({
  barId,
  convite
}: {
  barId?: string | null
  convite?: string
}) {
  if (convite) return `${APP_SCHEME}://convite/${encodeURIComponent(convite)}`
  if (barId) return `${APP_SCHEME}://bar/${encodeURIComponent(barId)}`
  return `${APP_SCHEME}://`
}

/**
 * "O Bar do Zé está no app" (design 4x/4y no computador, 4z no celular): o
 * web é só para bares, e quem chega por um link de bar, ou é torcedor e
 * entrou, vai ao app. Sem `bar` — torcedor logado, bar fora do ar, convite de
 * amigo —, a mesma página fala da Onside em geral (WEB-468: link sem bar não
 * tem desenho próprio).
 *
 * O QR leva a esta mesma página: no celular ela tem o "Abrir no app"
 * (`onside://`), e quem não tem o app não cai num link que não abre nada.
 * Com `convite`, o "Abrir no app" aceita o convite, e no celular a página já
 * tenta abrir o app sozinha: link de WhatsApp não abre `onside://` direto.
 */
export function NoApp({
  bar,
  barId,
  convite
}: {
  bar: BarTeaser | null
  barId?: string
  convite?: string
}) {
  const appLink = linkDoApp({ barId: bar ? barId : null, convite })
  // A URL do QR é a da página aberta; no servidor ainda não há `location`.
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => setQr(window.location.href.split('#')[0] ?? null), [])

  // Só no celular: no computador o esquema não abre nada (o Safari ainda
  // mostra erro), e o caminho é o QR.
  useEffect(() => {
    if (convite && window.matchMedia('(pointer: coarse)').matches) {
      window.location.href = appLink
    }
  }, [convite, appLink])

  const titulo = bar
    ? [{ texto: bar.name }, { texto: 'está no app.', tint: true }]
    : [
        { texto: 'A Onside para torcedores' },
        { texto: 'está no app.', tint: true }
      ]

  return (
    <div className="onside-app painel entrada">
      <div className="entrada-app">
        <header className="entrada-app-topo">
          <Link to="/" aria-label="Onside — página inicial">
            <Marca altura={26} />
          </Link>
          <span>
            Tem um bar?{' '}
            <Link to="/login" className="entrada-link">
              Onside para bares
            </Link>
          </span>
        </header>

        <main className="entrada-app-meio" data-com-bar={bar ? '' : undefined}>
          <div className="entrada-app-texto">
            <span className="entrada-app-icone">
              <img src="/onside-app-icon.png" alt="" width={48} height={48} />
              <span>
                <b>App Onside</b>
                <small>Grátis · iPhone e Android</small>
              </span>
            </span>
            <Disp tamanho={80} linhas={titulo} className="entrada-app-titulo" />
            <p className="entrada-app-linha">
              {convite
                ? CONVITE
                : bar
                  ? 'Para ver os jogos, marcar que vai assistir e ganhar a oferta da casa, abra no app Onside. O web agora é só para bares.'
                  : 'Para achar o bar que vai passar o seu jogo, marcar que vai assistir e ganhar a oferta da casa, use o app Onside. O web agora é só para bares.'}
            </p>
            <p className="entrada-app-linha-cel">
              {convite
                ? CONVITE
                : 'Abra no app para marcar que vai assistir e ganhar a oferta da casa.'}
            </p>
            <div className="entrada-app-qr">
              <div className="entrada-qr">
                {qr ? (
                  <QRCode
                    value={qr}
                    size={116}
                    bgColor="#ffffff"
                    fgColor="#12120f"
                    title="QR code: abre esta página no celular"
                  />
                ) : null}
              </div>
              <div>
                <span>Aponte a câmera do celular ou baixe:</span>
                <Lojas />
              </div>
            </div>
          </div>
          {bar ? (
            <div className="entrada-app-cartao">
              <CartaoBar bar={bar} />
            </div>
          ) : null}
        </main>

        <footer className="entrada-app-pe">
          <a
            href={appLink}
            className="painel-btn entrada-cta"
            data-variante="acid"
          >
            Abrir no app
          </a>
          <span>
            Ainda não tenho o app · Baixar <EmBreve />
          </span>
        </footer>
      </div>
    </div>
  )
}
