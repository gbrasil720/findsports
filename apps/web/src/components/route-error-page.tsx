import { getErrorStatus } from '@findsports_oficial/api/lib/transient-error'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PaginaErro, type TipoErro } from '@/components/erro/pagina-erro'
import { useSignOut } from '@/hooks/use-sign-out'

/** Qual das páginas de erro (WEB-554) mostrar para a falha de uma rota. */
export function tipoDoErro(error: unknown, online = true): TipoErro {
  if (!online) return 'off'
  const status = getErrorStatus(error)
  if (status === 403) return '403'
  if (status === 429) return '429'
  if (status === 503) return '503'
  return '500'
}

/** Oito caracteres para o suporte achar a falha no log. */
function novaReferencia() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
}

/**
 * Tela de erro padrão das rotas. Sem ela, falha num `beforeLoad` ou loader
 * caía na tela do TanStack Router: em inglês e com a mensagem crua do erro.
 * Aqui o erro não chega à tela, nem mensagem, nem stack: o 500 mostra só um
 * código de referência, que vai ao log junto com o erro.
 */
export function RouteErrorPage({ error }: { error?: unknown }) {
  const router = useRouter()
  const sair = useSignOut('/login')
  // No servidor e na primeira pintura, 500 sem referência: a rede e o código
  // só existem no navegador (sem divergência na hidratação).
  const [tipo, setTipo] = useState<TipoErro>(() => tipoDoErro(error))
  const [referencia, setReferencia] = useState<string>()
  useEffect(() => {
    const atual = tipoDoErro(error, navigator.onLine)
    setTipo(atual)
    if (atual !== '500') return
    const ref = novaReferencia()
    setReferencia(ref)
    console.error(JSON.stringify({ msg: 'route_error', ref }), error)
  }, [error])

  return (
    <PaginaErro
      tipo={tipo}
      referencia={referencia}
      // Recarrega `beforeLoad`/loaders e, com isso, desarma o limite de erro.
      // Se falhar de novo, esta tela volta com o botão liberado.
      onTentar={() => router.invalidate()}
      onOutraConta={() => void sair()}
    />
  )
}
