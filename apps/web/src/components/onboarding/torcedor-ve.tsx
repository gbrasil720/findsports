import { barPath } from '@findsports_oficial/db/bar-slug'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AdminBar, AdminEvent } from '@/components/admin/admin-model'
import { Arrow, Share } from '@/components/landing/v3/icons'
import { gameOffer, gameScreen } from '@/components/painel/dados'
import {
  brasiliaDay,
  brasiliaTime,
  eventTitle
} from '@/components/painel/noite'
import { usePassosLocais } from '@/components/painel/primeiros-passos-local'
import { diaDaSugestao } from '@/components/painel/sugestoes-de-jogo'
import { QRCode } from '@/components/qr-code'
import {
  CartaoBar,
  CartaoSemJogo
} from '@/components/torcedor/explorar/cartao-bar'
import { useSession } from '@/hooks/use-session'

/*
 * "Assim o torcedor vê" (WEB-501; protótipo `torcedorVe`): o card de verdade
 * do Explorar web (`components/torcedor/explorar`), a página pública do bar
 * num celular (a própria página, num iframe) e o link do bar para mandar aos
 * clientes: WhatsApp, copiar e o QR para imprimir. Nada aqui é clicável no
 * card: é a vitrine, não o app.
 */

/** Distância do torcedor de exemplo, a mesma da prévia de Meu espaço. */
const EXEMPLO_KM = 0.8

export function useLinkDoBar(bar: AdminBar) {
  const [origin, setOrigin] = useState('https://onside.sh')
  useEffect(() => setOrigin(window.location.origin), [])
  const url = `${origin}${barPath(bar)}`
  return { url, curto: url.replace(/^https?:\/\//, '') }
}

export function mensagemDoJogo(
  bar: AdminBar,
  jogo: AdminEvent | undefined,
  url: string,
  now = Date.now()
): string {
  if (!jogo) {
    return `Os jogos do ${bar.name} estão na Onside. Diz que vai: ${url}`
  }
  const dia = diaDaSugestao(String(jogo.startsAt), now)
  const quando =
    dia === 'hoje' ? 'Hoje' : dia === 'amanhã' ? 'Amanhã' : `Dia ${dia}`
  const tela = gameScreen(jogo, bar)
  const extras = [
    tela.onBigScreen ? 'no telão' : null,
    tela.withSound ? 'com som' : null
  ].filter(Boolean)
  return `${quando} tem ${eventTitle(jogo)} às ${brasiliaTime(jogo.startsAt)} aqui no ${bar.name}${extras.length ? `, ${extras.join(' e ')}` : ''}. Diz que vai: ${url}`
}

/** Meia folha com o QR para colar no balcão, numa janela só dela. */
function imprimirQr(svg: SVGSVGElement | null | undefined, bar: AdminBar) {
  const folha = window.open('', '_blank', 'width=640,height=820')
  if (!folha || !svg) {
    toast.error(
      'O navegador bloqueou a janela. Libere pop-ups e tente de novo.'
    )
    return
  }
  const doc = folha.document
  doc.title = `QR do ${bar.name} — Onside`
  const style = doc.createElement('style')
  style.textContent =
    '@page{size:A5;margin:14mm}body{font-family:system-ui,sans-serif;color:#111;text-align:center}h1{font-size:30px;margin:0 0 8px}p{font-size:18px;margin:0 0 24px}svg{width:70mm;height:70mm}small{display:block;margin-top:18px;font-size:12px;color:#555}'
  doc.head.append(style)
  const title = doc.createElement('h1')
  title.textContent = bar.name
  const text = doc.createElement('p')
  text.textContent = 'Aponte a câmera e veja os jogos que passam aqui.'
  const code = svg.cloneNode(true) as SVGSVGElement
  const footer = doc.createElement('small')
  footer.textContent = 'onside.sh'
  doc.body.append(title, text, code, footer)
  folha.focus()
  folha.print()
}

export function TorcedorVe({
  bar,
  jogo,
  elite,
  heading,
  nav
}: {
  bar: AdminBar
  jogo: AdminEvent | undefined
  elite: boolean
  heading: (content: ReactNode) => ReactNode
  nav: ReactNode
}) {
  const session = useSession()
  const [, marcar] = usePassosLocais(session?.user.id)
  const { url, curto } = useLinkDoBar(bar)
  const qr = useRef<HTMLSpanElement>(null)
  const mensagem = mensagemDoJogo(bar, jogo, url)
  const titulo = jogo ? eventTitle(jogo) : null

  const tela = jogo ? gameScreen(jogo, bar) : null
  const startsAt = jogo ? new Date(jogo.startsAt).toISOString() : ''
  const card = jogo ? (
    <CartaoBar
      bar={{
        eventId: jogo.id,
        barId: bar.id,
        name: bar.name,
        neighborhood: bar.neighborhood,
        photoUrl: bar.photoUrl,
        latitude: Number(bar.latitude),
        longitude: Number(bar.longitude),
        distanceKm: EXEMPLO_KM,
        elite,
        amenities: bar.amenities,
        onBigScreen: tela?.onBigScreen ?? false,
        withSound: tela?.withSound ?? false,
        offer: gameOffer(jogo, bar, elite),
        rating: null,
        closes: null,
        attendanceEnabled: jogo.attendanceEnabled,
        going: null,
        classic: null
      }}
      jogo={{
        key: jogo.id,
        title: titulo ?? '',
        championship: jogo.championship,
        startsAt,
        endsAt: jogo.endsAt ? new Date(jogo.endsAt).toISOString() : null,
        bars: []
      }}
      estado="next"
      rotuloDoDia={
        brasiliaDay(startsAt) === brasiliaDay(Date.now())
          ? 'hoje'
          : diaDaSugestao(startsAt)
      }
      salvo={false}
      vou={false}
      onSalvar={() => undefined}
      onVou={() => undefined}
    />
  ) : (
    <CartaoSemJogo
      bar={{
        barId: bar.id,
        name: bar.name,
        neighborhood: bar.neighborhood,
        photoUrl: bar.photoUrl,
        latitude: Number(bar.latitude),
        longitude: Number(bar.longitude),
        distanceKm: EXEMPLO_KM,
        amenities: bar.amenities,
        opening: null
      }}
    />
  )

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link copiado: ${curto}`)
      marcar({ link: true })
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie à mão.')
    }
  }

  return (
    <div className="ob-tv-w">
      <span className="ob-k">
        {titulo ? `Publicado agora · ${titulo}` : `${bar.name} está no ar`}
      </span>
      {heading(
        titulo ? (
          <>
            Funcionou. Seu jogo <span className="hl">já aparece</span>
          </>
        ) : (
          <>
            Assim o torcedor <span className="hl">acha seu bar</span>
          </>
        )
      )}
      <p className="ob-sub">
        {titulo
          ? `É assim que o torcedor encontra o ${bar.name} agora: no Explorar, quando procura o jogo perto, e na página do bar.`
          : `Sem jogo na grade, o ${bar.name} não aparece nas buscas do dia, mas a página do bar já está no ar. Ponha o primeiro jogo quando quiser.`}
      </p>

      <div className="ob-tvg">
        <div>
          <p className="ob-k">No Explorar</p>
          {/* A vitrine: o card é o do app, sem as ações dele. */}
          <div className="tc ob-tc" inert>
            {card}
          </div>
        </div>
        <div>
          <p className="ob-k">Na página do bar</p>
          <div className="ob-phone">
            <iframe
              src={barPath(bar)}
              title={`Página do ${bar.name} no celular`}
              loading="lazy"
              tabIndex={-1}
            />
          </div>
        </div>
        <div>
          <p className="ob-k">Mande para os seus clientes</p>
          <div className="ob-card ob-shr">
            <p className="ob-wa">{mensagem}</p>
            <a
              className="btn btn-acid"
              href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => marcar({ link: true })}
            >
              <Share size={18} />
              Mandar no WhatsApp
            </a>
            <div className="ob-lnk">
              <span className="mono">{curto}</span>
              <button
                type="button"
                className="btn btn-ghost ob-sm"
                onClick={() => void copiar()}
              >
                Copiar link
              </button>
            </div>
            <div className="ob-qrb">
              <span
                className="ob-q"
                ref={qr}
                role="img"
                aria-label="QR da página do bar"
              >
                <QRCode value={url} size={108} />
              </span>
              <span>
                <b>QR para o balcão</b>
                <span>
                  Cole na mesa ou no caixa. Abre a página do bar com os jogos.
                </span>
                <button
                  type="button"
                  className="btn btn-ghost ob-sm"
                  onClick={() => {
                    imprimirQr(qr.current?.querySelector('svg'), bar)
                    marcar({ link: true })
                  }}
                >
                  Baixar para imprimir
                  <Arrow size={16} />
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
      {nav}
    </div>
  )
}
