import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  FOUNDER_COUPON_WAIT_MS,
  founderCouponFromQuery
} from '@/lib/plan-catalog'
import { useTRPC } from '@/utils/trpc'

/**
 * Cupom de fundador para o preço da tela, com teto de espera (WEB-534): `null`
 * enquanto a consulta não responde, até `FOUNDER_COUPON_WAIT_MS`; depois, a
 * tabela cheia. Resposta que chega depois do teto ainda troca o preço.
 */
export function useFounderCoupon(): boolean | null {
  const trpc = useTRPC()
  const query = useQuery(trpc.pub.getFounderCouponAvailable.queryOptions())
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (!query.isPending) return
    const timer = setTimeout(() => setWaited(true), FOUNDER_COUPON_WAIT_MS)
    return () => clearTimeout(timer)
  }, [query.isPending])
  return founderCouponFromQuery(query, waited)
}
