import { Stack } from 'expo-router'

/*
 * A pilha da aba "Você" (WEB-407): a primeira tela é o Explorar com o menu
 * por cima; o que o menu abre entra aqui, com a barra de abas visível e
 * "Você" marcado, como no design. Tocar em "Você" de novo volta ao menu.
 */
export default function YouStack() {
  return <Stack screenOptions={{ headerShown: false }} />
}
