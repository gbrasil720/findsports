import { Redirect } from 'expo-router'

// Aba desabilitada na barra (ver `_layout.tsx`): só existe para a barra ter o
// item. Se alguém chegar aqui por link, volta para o Explorar.
export default function NotYet() {
  return <Redirect href="/explore" />
}
