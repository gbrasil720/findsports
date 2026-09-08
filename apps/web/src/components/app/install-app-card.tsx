import { useEffect, useRef, useState } from 'react'
import Download from 'reicon-react/icons/Download'
import Share from 'reicon-react/icons/Share'
import Xmark from 'reicon-react/icons/Xmark'
import {
  analytics,
  type InstallPlatform,
  type InstallSurface
} from '@/lib/analytics'
import {
  ehIOS,
  estaInstalado,
  foiDispensado,
  marcarDispensado,
  registrarServiceWorker
} from '@/lib/pwa'

/**
 * Convite para instalar o Onside na tela inicial (WEB-72).
 *
 * Enquanto não existe app nativo, o PWA **é** o app — então o convite não pode
 * ficar escondido atrás do menu do navegador. O Chrome guarda o
 * `beforeinstallprompt` e escolhe sozinho a hora de oferecer; normalmente ele
 * não escolhe.
 *
 * Ele é um cartão no corpo da tela, não uma faixa no topo: a pessoa abriu o
 * dashboard para achar um bar, e o convite não pode competir com a busca de
 * jogos.
 *
 * Só aparece em `/dashboard` e `/admin`. Fora dali — e principalmente em
 * `/plan`, que é checkout — ele atrapalha mais do que converte.
 */

/**
 * `BeforeInstallPromptEvent` não está no lib.dom. Só o Chromium implementa, e
 * é o único caminho de instalação programática que existe.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppCard({
  userId,
  surface
}: {
  userId: string
  surface: InstallSurface
}) {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [plataforma, setPlataforma] = useState<InstallPlatform | null>(null)
  const [oculto, setOculto] = useState(true)
  const exibicaoRegistrada = useRef(false)

  useEffect(() => {
    // O service worker é requisito de instalabilidade no Android, então ele é
    // registrado mesmo quando o convite não aparece — inclusive para quem já
    // instalou, que é justamente quem precisa receber deploy novo.
    registrarServiceWorker()

    // Mostrar "instale o app" para quem já está dentro do app instalado é o
    // erro clássico deste componente.
    if (estaInstalado()) return
    if (foiDispensado(userId)) return

    setOculto(false)
    if (ehIOS(navigator.userAgent, navigator.maxTouchPoints)) {
      setPlataforma('ios')
    }
  }, [userId])

  useEffect(() => {
    function aoPoderInstalar(evento: Event) {
      // Sem o preventDefault o Chrome decide a hora sozinho, e o botão daqui
      // perde o evento.
      evento.preventDefault()
      setEvento(evento as BeforeInstallPromptEvent)
      setPlataforma('android')
    }

    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    return () =>
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
  }, [])

  // No iOS não existe API de instalação: o cartão é instrucional e não tem
  // botão que não faz nada. No Android ele só aparece quando o navegador
  // avisou que dá para instalar.
  const visivel =
    !oculto && (plataforma === 'ios' || (plataforma === 'android' && !!evento))

  useEffect(() => {
    if (!visivel || !plataforma || exibicaoRegistrada.current) return
    exibicaoRegistrada.current = true
    analytics.installPromptShown(plataforma, surface)
  }, [visivel, plataforma, surface])

  if (!visivel || !plataforma) return null

  async function instalar() {
    if (!evento || !plataforma) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === 'accepted') {
      analytics.installAccepted(plataforma, surface)
    }
    // Aceito ou recusado, o evento não pode ser reusado.
    setEvento(null)
    setOculto(true)
  }

  function dispensar() {
    if (plataforma) analytics.installDismissed(plataforma, surface)
    marcarDispensado(userId)
    setOculto(true)
  }

  return (
    <section
      aria-labelledby="convite-instalacao"
      className="onside-panel onside-shadow relative flex flex-col gap-3 p-5"
    >
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar convite de instalação"
        className="absolute top-2 right-2 grid min-h-11 min-w-11 place-items-center border border-transparent transition-colors hover:border-[var(--onside-ink)]"
      >
        <Xmark size={14} color="currentColor" aria-hidden="true" />
      </button>

      <h2
        id="convite-instalacao"
        className="onside-heading pr-11 text-base leading-tight"
      >
        Deixe o Onside a um toque
      </h2>

      <p className="max-w-prose text-sm leading-relaxed text-[var(--onside-muted)]">
        O app nativo ainda não saiu. Até lá, dá para pôr o ícone do Onside na
        tela inicial e abrir direto — sem digitar endereço com o jogo prestes a
        começar.
      </p>

      {plataforma === 'android' ? (
        <button
          type="button"
          onClick={() => void instalar()}
          className="onside-btn onside-btn-acid min-h-11 self-start text-xs"
        >
          <Download size={14} color="currentColor" aria-hidden="true" />
          Instalar o Onside
        </button>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Share size={16} color="currentColor" aria-hidden="true" />
          <span>
            Toque em <strong>Compartilhar</strong> e depois em{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </span>
        </p>
      )}
    </section>
  )
}
