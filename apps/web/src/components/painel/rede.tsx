import type { ActionPhase } from '@findsports_oficial/api/lib/transient-error'
import { onlineManager } from '@tanstack/react-query'
import {
  type ComponentProps,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { Icone } from './icone'
import { Botao } from './pecas'

/*
 * Rede no painel (WEB-460). O React Query já sabe se há rede
 * (`navigator.onLine`): sem ela, as consultas esperam e as mutations ficam
 * paradas até voltar; ao voltar, o `router.tsx` relê a tela.
 */

const subscribe = (avisar: () => void) => onlineManager.subscribe(avisar)

/** `false` enquanto o navegador está sem rede. No servidor, sempre `true`. */
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => onlineManager.isOnline(),
    () => true
  )
}

/**
 * A faixa de "sem conexão": uma só, presa no topo da tela, por cima do
 * conteúdo (não empurra nada). Some sozinha quando a rede volta.
 */
export function FaixaSemConexao() {
  const online = useOnline()
  return (
    <>
      <div className="painel-faixa-rede" data-visivel={!online} aria-hidden>
        <span className="painel-faixa-rede-ponto" />
        Sem conexão. O painel se atualiza quando a rede voltar.
      </div>
      <span role="status" className="sr-only">
        {online
          ? ''
          : 'Sem conexão. O painel se atualiza quando a rede voltar.'}
      </span>
    </>
  )
}

/**
 * O bloco que não carregou (WEB-460), no lugar do que sumiria: o que houve,
 * o que fazer e "Tentar de novo" quando a falha é passageira. Recusa da
 * nossa API (plano, permissão) aparece com o texto dela, sem botão: repetir
 * só repetiria a recusa. `compacto` é a linha só, dentro de um card pequeno.
 */
export function ErroBloco({
  titulo,
  erro,
  tentar,
  tentando = false,
  compacto = false
}: {
  /** O que não carregou: "Não foi possível carregar os jogos." */
  titulo: string
  erro: unknown
  tentar: () => unknown
  /** A nova tentativa está no ar (`isFetching` da consulta). */
  tentando?: boolean
  compacto?: boolean
}) {
  const online = useOnline()
  const passageira = isRetryableError(erro)
  const mensagem = getUserFacingMessage(erro, titulo)
  const rotulo = tentando ? 'Tentando de novo…' : 'Tentar de novo'
  const tentarAgora = () => void tentar()

  if (compacto)
    return (
      <p className="painel-erro" data-compacto role="alert">
        {mensagem}{' '}
        {passageira ? (
          <button
            type="button"
            className="painel-erro-tentar"
            disabled={tentando}
            onClick={tentarAgora}
          >
            {rotulo}
          </button>
        ) : null}
      </p>
    )
  return (
    <div className="painel-erro" role="alert">
      <Icone nome="alert" tamanho={20} acento="currentColor" />
      <div className="painel-erro-texto">
        <b>{mensagem}</b>
        <span>
          {!online
            ? 'Sem conexão. Tentamos de novo quando a rede voltar.'
            : passageira
              ? 'Tente novamente. Se o problema continuar, volte mais tarde.'
              : 'Verifique o acesso à sua conta ou volte mais tarde.'}
        </span>
      </div>
      {passageira ? (
        <BotaoAcao
          variante="ink"
          altura={40}
          fase={tentando ? 'sending' : 'idle'}
          rotulos={{
            idle: 'Tentar de novo',
            sending: 'Tentando de novo…',
            done: 'Tentar de novo'
          }}
          onClick={tentarAgora}
        />
      ) : null}
    </div>
  )
}

/** `true` por um instante depois de `marcar()`: o "Salvo" do botão. */
export function useFeito(ms = 1600) {
  const [feito, setFeito] = useState(0)
  useEffect(() => {
    if (!feito) return
    const timer = setTimeout(() => setFeito(0), ms)
    return () => clearTimeout(timer)
  }, [feito, ms])
  return [feito > 0, () => setFeito(Date.now())] as const
}

/** A ordem das fases: a que vem depois entra por baixo; a de antes, por cima. */
const FASES: ActionPhase[] = [
  'idle',
  'sending',
  'waiting',
  'retrying',
  'failed',
  'done'
]
const ROTULOS_PADRAO = {
  waiting: 'Esperando a rede…',
  retrying: 'Tentando de novo…',
  failed: 'Tentar de novo'
}

/**
 * O botão que conta o que está acontecendo (WEB-460): "Salvar alterações" →
 * "Salvando…" → "Tentando de novo…" → "Salvo", trocando o texto no lugar.
 * Todos os rótulos ocupam a mesma célula, então a largura é a do maior e o
 * botão não muda de tamanho nem empurra o vizinho. Ocupado, não aceita
 * clique, mas não esmaece: quem conta é o texto.
 */
export function BotaoAcao({
  fase,
  rotulos,
  disabled,
  ...rest
}: Omit<ComponentProps<typeof Botao>, 'children'> & {
  fase: ActionPhase
  rotulos: { idle: string; sending: string; done: string } & Partial<
    Record<ActionPhase, string>
  >
}) {
  const textos = { ...ROTULOS_PADRAO, ...rotulos }
  const ativa = FASES.indexOf(fase)
  const ocupado = fase !== 'idle' && fase !== 'failed'
  return (
    <>
      <Botao
        {...rest}
        data-fase={fase}
        aria-busy={ocupado && fase !== 'done'}
        disabled={disabled || ocupado}
      >
        <span className="painel-btn-rotulos">
          {FASES.map((f, i) => (
            <span
              key={f}
              aria-hidden={f !== fase}
              data-lado={i < ativa ? 'antes' : i > ativa ? 'depois' : undefined}
            >
              {f === 'done' ? (
                <Icone nome="check" tamanho={16} acento="currentColor" />
              ) : null}
              {textos[f]}
            </span>
          ))}
        </span>
      </Botao>
      <span role="status" className="sr-only">
        {fase === 'idle' ? '' : textos[fase]}
      </span>
    </>
  )
}
