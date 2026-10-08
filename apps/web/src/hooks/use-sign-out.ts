import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { toast } from 'sonner'

import { authClient } from '@/lib/auth-client'

export function useSignOut(destination: '/' | '/login' = '/') {
  const navigate = useNavigate()

  return useCallback(async () => {
    // WEB-253: o pedido pode levar segundos e, quando falhava, falhava calado.
    // Sem retorno nenhum, o clique parecia não ter funcionado e a sessão
    // seguia aberta depois de recarregar.
    const id = toast.loading('Saindo…')
    const { error } = await authClient
      .signOut()
      .catch(() => ({ error: true as const }))
    if (error) {
      toast.error('Não foi possível sair. Tente de novo.', { id })
      return
    }
    toast.dismiss(id)
    await navigate({ to: destination })
  }, [destination, navigate])
}
