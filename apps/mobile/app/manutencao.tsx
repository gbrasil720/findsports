import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { MaintenanceScreen } from '@/components/maintenance'

// A manutenção (26d, 26e) para o navegador DEV: `?volta=<minutos>` dá a
// previsão; sem ele, sem previsão. A de verdade é a `MaintenanceGate`, por
// cima de tudo, ligada pelo Houdini.
function Preview() {
  const { volta } = useLocalSearchParams<{ volta?: string }>()
  const [backAt] = useState(() =>
    volta ? new Date(Date.now() + Number(volta) * 60_000).toISOString() : null
  )
  return <MaintenanceScreen maintenance={{ on: true, backAt }} />
}

export default __DEV__ ? Preview : () => <Redirect href="/" />
