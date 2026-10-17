import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useEffect } from 'react'
import { latest } from '@/lib/achievements'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

/**
 * Abre a conquista desbloqueada (2k) quando sai medalha nova: o bar validou
 * o código (a tela do código no balcão acompanha) ou o torcedor avaliou um
 * jogo. As já vistas ficam no aparelho; na primeira leitura todas contam
 * como vistas, para quem já tinha medalha não ganhar uma fila de telas.
 *
 * ponytail: "vista" é por aparelho. Em dois celulares a mesma medalha
 * aparece nos dois; guardar no servidor quando isso incomodar.
 */
export function useNewAchievement() {
  const router = useRouter()
  const userId = authClient.useSession().data?.user.id
  const mine = useQuery({
    ...trpc.achievements.mine.queryOptions(),
    enabled: Boolean(userId),
    retry: false,
    meta: { errorToast: false }
  })
  const list = mine.data?.achievements
  useEffect(() => {
    if (!userId || !list) return
    const key = `achievements-seen.${userId}`
    const unlocked = list.filter((a) => a.unlockedAt)
    SecureStore.getItemAsync(key)
      .then((raw) => {
        SecureStore.setItemAsync(key, JSON.stringify(unlocked.map((a) => a.id)))
        if (raw === null) return
        const seen = new Set<string>(JSON.parse(raw))
        const fresh = latest(unlocked.filter((a) => !seen.has(a.id)))
        if (fresh) router.push(`/conquista/${fresh.id}?nova=1`)
      })
      .catch(() => {})
  }, [list, userId, router])
}
