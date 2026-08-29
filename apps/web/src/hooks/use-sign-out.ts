import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { authClient } from '@/lib/auth-client'

export function useSignOut(destination: '/' | '/login' = '/') {
  const navigate = useNavigate()

  return useCallback(() => {
    return authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate({ to: destination })
      }
    })
  }, [destination, navigate])
}
