import { useCallback, useEffect, useState } from 'react'

/*
 * O que "Primeiros passos" e o passeio não acham no banco: passeio feito,
 * telas do passeio já vistas, link mandado, código de exemplo validado e o
 * card escondido. Fica no navegador, por conta (a chave leva o id), e a
 * leitura nunca derruba a tela: sem armazenamento, tudo começa por fazer.
 */

export type PassoDoPasseio =
  | 'hoje'
  | 'jogos'
  | 'espaco'
  | 'codigo'
  | 'desempenho'
  | 'fim'

export type PassosLocais = {
  passeio?: boolean
  codigo?: boolean
  link?: boolean
  oculto?: boolean
  vistos?: PassoDoPasseio[]
}

const chave = (userId: string) => `onside:primeiros-passos:${userId}`
const EVENTO = 'onside:primeiros-passos'

export function lerPassos(userId: string): PassosLocais {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave(userId)) ?? '{}')
    return salvo && typeof salvo === 'object' ? (salvo as PassosLocais) : {}
  } catch {
    return {}
  }
}

export function marcarPassos(userId: string, patch: PassosLocais) {
  try {
    localStorage.setItem(
      chave(userId),
      JSON.stringify({ ...lerPassos(userId), ...patch })
    )
  } catch {
    // Sem armazenamento, a marca vale só até recarregar.
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { userId, patch } }))
}

/** Os passos locais da conta, atualizados quando outra tela marca algum. */
export function usePassosLocais(userId: string | undefined) {
  const [passos, setPassos] = useState<PassosLocais>({})
  useEffect(() => {
    if (!userId) return
    setPassos(lerPassos(userId))
    const atualizar = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          userId: string
          patch: PassosLocais
        }>
      ).detail
      // O que chegou vale mesmo sem armazenamento (navegação privada).
      if (detail?.userId === userId)
        setPassos((atual) => ({
          ...atual,
          ...lerPassos(userId),
          ...detail.patch
        }))
      else setPassos(lerPassos(userId))
    }
    window.addEventListener(EVENTO, atualizar)
    window.addEventListener('storage', atualizar)
    return () => {
      window.removeEventListener(EVENTO, atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [userId])
  const marcar = useCallback(
    (patch: PassosLocais) => {
      if (userId) marcarPassos(userId, patch)
    },
    [userId]
  )
  return [passos, marcar] as const
}
