import { Stack } from 'expo-router'

/*
 * A pilha da aba "Você" (WEB-407): a primeira tela é o Explorar com o menu
 * por cima; o que o menu abre entra aqui, com a barra de abas visível e
 * "Você" marcado, como no design. Tocar em "Você" de novo volta ao menu.
 * Ao sair da aba a pilha volta ao começo: quem toca em "Você" vindo de outra
 * aba encontra o menu, não a última tela aberta.
 */
export default function YouStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation }) => ({
        blur: () => {
          if (
            !navigation.getParent()?.isFocused() &&
            navigation.getState().index > 0
          )
            navigation.popToTop()
        }
      })}
    />
  )
}
