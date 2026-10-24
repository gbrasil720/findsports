import { Stack } from 'expo-router'

// O menu fica sempre no fundo da pilha: um link ou `navigate` direto para
// `/voce/meus-jogos` com a aba ainda fechada montava a pilha só com Meus
// jogos, o `popToTop` do blur não tinha para onde voltar e tocar em "Você"
// caía em Meus jogos de novo.
export const unstable_settings = { initialRouteName: 'index' }

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
