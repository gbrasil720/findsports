import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { Jules, type JulesEstado } from '@/components/jules/jules'

export type TipoErro = '404' | '403' | '500' | '503' | '429' | 'off'

type Erro = {
  /** O número gigante e apagado atrás do Jules. */
  codigo: string
  etiqueta: string
  /** Vermelha quando algo foi barrado ou quebrou (403, 500, 429). */
  quente: boolean
  titulo: string
  texto: string
  estado: JulesEstado
}

/**
 * As seis páginas de erro (WEB-554, desenho aprovado pelo dono em
 * 14/11/2026): uma só, que troca o número, a frase, a pose do Jules e o
 * botão principal. O segundo botão é sempre "Voltar ao início".
 */
export const ERROS: Record<TipoErro, Erro> = {
  '404': {
    codigo: '404',
    etiqueta: 'Erro 404 · página não encontrada',
    quente: false,
    titulo: 'Bola fora.',
    texto:
      'Essa página não está em campo. Pode ter mudado de endereço ou nunca ter existido.',
    estado: 'empty'
  },
  '403': {
    codigo: '403',
    etiqueta: 'Erro 403 · acesso negado',
    quente: true,
    titulo: 'Cartão vermelho.',
    texto:
      'Essa área não é para a sua conta. Se você tem um bar, entre com a conta dele.',
    estado: 'refused'
  },
  '500': {
    codigo: '500',
    etiqueta: 'Erro 500 · falha nossa',
    quente: true,
    titulo: 'Caiu o sinal.',
    texto:
      'Algo quebrou do nosso lado. Já fomos avisados; tente de novo em instantes.',
    estado: 'down'
  },
  '503': {
    codigo: '503',
    etiqueta: 'Erro 503 · manutenção',
    quente: false,
    titulo: 'Intervalo técnico.',
    texto:
      'Estamos ajustando o time. Volta já, e seus jogos e códigos continuam guardados.',
    estado: 'awaiting'
  },
  '429': {
    codigo: '429',
    etiqueta: 'Erro 429 · pedidos demais',
    quente: true,
    titulo: 'Calma, craque.',
    texto:
      'Foram pedidos demais em pouco tempo. Respira um minuto e tenta de novo.',
    estado: 'limit'
  },
  off: {
    codigo: 'OFF',
    etiqueta: 'Sem conexão',
    quente: false,
    titulo: 'Sem sinal.',
    texto:
      'Seu aparelho está sem internet. Assim que voltar, a página carrega sozinha.',
    estado: 'offline'
  }
}

/**
 * A página de erro do site e do painel. `onTentar` é o "Tentar de novo"
 * (sem ele, recarrega a página); `onOutraConta` sai da conta e vai ao login
 * (403). `referencia` é o código que o 500 mostra para o suporte.
 */
export function PaginaErro({
  tipo,
  referencia,
  onTentar,
  onOutraConta
}: {
  tipo: TipoErro
  referencia?: string
  onTentar?: () => Promise<unknown> | void
  onOutraConta?: () => void
}) {
  const erro = ERROS[tipo]
  const [tentando, setTentando] = useState(false)
  const tentar = () => {
    if (!onTentar) return location.reload()
    setTentando(true)
    void Promise.resolve(onTentar()).finally(() => setTentando(false))
  }

  // Sem rede: a página volta sozinha quando a conexão volta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só pelo tipo
  useEffect(() => {
    if (tipo !== 'off') return
    addEventListener('online', tentar)
    return () => removeEventListener('online', tentar)
  }, [tipo])

  return (
    <div className="onside-page erro-pg">
      <header className="erro-topo">
        <Link to="/" aria-label="Onside — página inicial">
          <OnsideBrand />
        </Link>
      </header>
      <main className="erro-painel">
        <div className="erro-codigo" aria-hidden="true">
          {erro.codigo}
        </div>
        <div className="erro-texto">
          <small className={erro.quente ? 'quente' : undefined}>
            {erro.etiqueta}
          </small>
          <h1>{erro.titulo}</h1>
          <p>{erro.texto}</p>
          {referencia ? (
            <p className="erro-ref">
              Código para o suporte: <code>{referencia}</code>
            </p>
          ) : null}
          <div className="erro-acoes">
            {tipo === '404' ? (
              <Link to="/dashboard" className="erro-p">
                Ver jogos de hoje
              </Link>
            ) : tipo === '403' ? (
              onOutraConta ? (
                <button type="button" className="erro-p" onClick={onOutraConta}>
                  Entrar com outra conta
                </button>
              ) : (
                <Link to="/login" className="erro-p">
                  Entrar com outra conta
                </Link>
              )
            ) : (
              <button
                type="button"
                className="erro-p"
                disabled={tentando}
                onClick={tentar}
              >
                {tentando ? 'Tentando…' : 'Tentar de novo'}
              </button>
            )}
            <Link to="/" className="erro-s">
              Voltar ao início
            </Link>
          </div>
        </div>
        <Jules estado={erro.estado} tinta className="erro-jules" />
      </main>
    </div>
  )
}
