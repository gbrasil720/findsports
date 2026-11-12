import { Redirect } from 'expo-router'

// Os estados da taça (`dev/mascote.tsx`): o `require` dentro do `__DEV__`
// tira a tela, e o que ela carrega, do bundle de produção.
export default __DEV__
  ? require('@/dev/mascote').default
  : () => <Redirect href="/" />
