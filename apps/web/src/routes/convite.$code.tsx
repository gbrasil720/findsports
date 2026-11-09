import { APP_SCHEME } from '@findsports_oficial/auth/trusted-origins'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { type AuthPanel, AuthShell } from '@/components/entrada/auth-shell'
import { QRCode } from '@/components/qr-code'
import { pageHead } from '@/lib/page-head'

/*
 * O link de convite dos amigos do app (S1 do design do app mobile). Os amigos
 * não têm tela no web: esta página só existe porque link de WhatsApp não abre
 * `onside://` direto (WEB-468). No celular ela tenta abrir o app no convite e,
 * se não abrir, fica o botão; no computador, o QR leva o convite ao celular. O
 * app cuida do resto (`apps/mobile/app/convite/[code].tsx`).
 */

const PANEL: AuthPanel = {
  kind: 'caption',
  led: 'scarf',
  title: (
    <>
      Bora assistir <span>junto.</span>
    </>
  ),
  items: [
    'Vocês veem quem vai a cada jogo',
    'Chame o amigo para o mesmo bar',
    'Ranking do mês entre amigos'
  ]
}

export const Route = createFileRoute('/convite/$code')({
  head: ({ params }) =>
    pageHead({
      path: `/convite/${params.code}`,
      title: 'Convite de amigo — Onside',
      description: 'Abra no app da Onside para aceitar o convite.',
      indexable: false
    }),
  component: InvitePage
})

function InvitePage() {
  const { code } = Route.useParams()
  const appLink = `${APP_SCHEME}://convite/${encodeURIComponent(code)}`
  // A URL do QR é a da página aberta; no servidor ainda não há `location`.
  // No celular não há QR: a página já tenta abrir o app.
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      window.location.href = appLink
      return
    }
    setQr(window.location.href.split('#')[0] ?? null)
  }, [appLink])

  return (
    <AuthShell panel={PANEL}>
      <div className="w-full">
        <div className="mb-8">
          <p className="onside-kicker">Convite de amigo</p>
          <h1 className="onside-display mb-3">
            Te chamaram{' '}
            <span className="text-[var(--onside-live-text)]">pra Onside</span>
          </h1>
          <p className="ent-sub">
            Abra no app para aceitar o convite. Se você ainda não tem conta, é
            só criar pelo app: quem entra pelo convite já vira amigo de quem
            chamou.
          </p>
        </div>
        <a
          className="onside-btn onside-btn-acid onside-btn-full ent-full"
          href={appLink}
        >
          Abrir no app
        </a>
        {qr ? (
          <div className="mt-8 flex items-center gap-4">
            <div
              role="img"
              aria-label="QR code: abre esta página no celular"
              className="shrink-0 rounded-xl bg-white p-2"
              style={{ width: 112, height: 112 }}
            >
              <QRCode value={qr} size={96} />
            </div>
            <p className="text-sm text-[var(--onside-muted)] leading-relaxed">
              No computador? Aponte a câmera do celular para o código e o
              convite abre no app.
            </p>
          </div>
        ) : null}
      </div>
    </AuthShell>
  )
}
