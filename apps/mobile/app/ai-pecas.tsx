import { Redirect } from 'expo-router'

// Quadro das peças do chat (`dev/ai-pecas.tsx`): o `require` dentro do
// `__DEV__` tira a tela, e o que ela carrega, do bundle de produção.
export default __DEV__
  ? require('@/dev/ai-pecas').default
  : () => <Redirect href="/" />
