// A tarefa do push (botão da notificação com o app fechado, WEB-429) tem de
// estar definida antes de o expo-router subir: o Android roda o JS sem tela.
import './lib/push'
import 'expo-router/entry'
