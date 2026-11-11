import { Redirect } from 'expo-router'

// Item da barra que abre outra coisa (ver `_layout.tsx`): o menu do Bar ou
// a validação. Se alguém chegar aqui por link, volta para Hoje na casa.
export default function NotHere() {
  return <Redirect href="/casa" />
}
