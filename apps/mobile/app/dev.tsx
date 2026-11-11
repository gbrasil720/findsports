import { Redirect } from 'expo-router'

// Navegador de telas (`dev/navegador.tsx`): o `require` dentro do `__DEV__`
// tira a tela, e o que ela carrega, do bundle de produção.
export default __DEV__
  ? require('@/dev/navegador').default
  : () => <Redirect href="/" />
