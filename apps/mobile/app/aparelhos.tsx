import { Sessions } from '@/app/configuracoes'
import { BackButton, Screen, SUB, Text, Title, text } from '@/components/ui'

/*
 * "Aparelhos" da Conta (rodada 6): os aparelhos com a conta aberta; os
 * outros saem daqui.
 */

export default function Devices() {
  return (
    <Screen gap={16} top={6}>
      <BackButton />
      <Title lines={[['Seus ', 'aparelhos']]} size={44} />
      <Text style={[text(13.5, 'Regular', 1.4), { color: SUB }]}>
        Onde sua conta está aberta. Sair de um aparelho pede a senha de novo
        nele.
      </Text>
      <Sessions />
    </Screen>
  )
}
