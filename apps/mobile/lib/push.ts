import { isRunningInExpoGo } from 'expo'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { authClient } from './auth-client'
import { queryClient, trpcClient } from './trpc'

/*
 * Push no celular (WEB-416, WEB-429). O servidor manda pela Expo para o
 * token que o app registra (`push.register`); o token fica preso à sessão,
 * então sair da conta o apaga lá. Sem build de desenvolvimento não há push:
 * no Expo Go o módulo nem é carregado (no Android ele lança erro, no iOS
 * avisa a cada abertura), e tudo aqui vira nada.
 *
 * Falta do dono para chegar ao aparelho: `extra.eas.projectId` no
 * `app.json` (`eas init`), o `google-services.json` do Firebase no Android e,
 * no iOS, a chave APNs da conta paga da Apple. Ver AGENTS.md › Push.
 */
type NotificationsModule = typeof import('expo-notifications')
type Response = import('expo-notifications').NotificationResponse

const Notifications: NotificationsModule | null = isRunningInExpoGo()
  ? null
  : require('expo-notifications')
const TaskManager: typeof import('expo-task-manager') | null = Notifications
  ? require('expo-task-manager')
  : null

const projectId = Constants.expoConfig?.extra?.eas?.projectId as
  | string
  | undefined

/** A categoria da 24g, com os botões; o servidor a cita em `categoryId`. */
const CALL_CATEGORY = 'friend_call'
const BACKGROUND_TASK = 'onside-push-response'

if (Notifications) {
  // Com o app aberto a notificação também aparece, como no sistema.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  })
  Notifications.setNotificationCategoryAsync(CALL_CATEGORY, [
    {
      identifier: 'going',
      buttonTitle: 'Vou também',
      options: { opensAppToForeground: false }
    },
    {
      identifier: 'bar',
      buttonTitle: 'Ver o bar',
      options: { opensAppToForeground: true }
    },
    {
      identifier: 'not_now',
      buttonTitle: 'Agora não',
      options: { opensAppToForeground: false }
    }
  ]).catch(() => {})
}

// O botão tocado com o app fechado (só Android): o sistema sobe o JS sem
// tela e roda a tarefa, que precisa estar definida já na carga do módulo
// (`index.ts` importa este arquivo antes do expo-router).
if (Notifications && TaskManager) {
  TaskManager.defineTask<import('expo-notifications').NotificationTaskPayload>(
    BACKGROUND_TASK,
    async ({ data }) => {
      if (data && 'actionIdentifier' in data) await answerCall(data)
    }
  )
  if (Platform.OS === 'android')
    Notifications.registerTaskAsync(BACKGROUND_TASK).catch(() => {})
}

async function register() {
  if (!Notifications || !projectId) return
  if (Platform.OS === 'android')
    // O canal que o servidor cita (`channelId: 'default'`); no Android 13+
    // ele precisa existir antes do pedido de permissão.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos',
      importance: Notifications.AndroidImportance.HIGH
    })
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId
  })
  await trpcClient.push.register.mutate({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android'
  })
}

/**
 * Sem pedir nada: com a permissão dada, registra o aparelho (a cada sessão
 * nova). Permissão tirada nos ajustes do celular: tira o token do servidor.
 */
async function syncRegistration() {
  if (!Notifications || !projectId) return
  try {
    const { granted, status } = await Notifications.getPermissionsAsync()
    if (granted) return await register()
    if (status !== 'denied') return
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId
    })
    await trpcClient.push.unregister.mutate({ token })
  } catch {
    // Sem rede ou sem credencial (FCM, APNs): fica para a próxima abertura.
  }
}

/**
 * Pede a permissão uma vez, logo depois de uma ação que vai gerar aviso
 * (lembrar, avisar, chamar, amizade): é quando o pedido faz sentido. Negada
 * ou já respondida, não pergunta de novo.
 */
export async function askForPush() {
  if (!Notifications || !projectId) return
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return await register()
    if (current.status !== 'undetermined' || !current.canAskAgain) return
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH
      })
    if ((await Notifications.requestPermissionsAsync()).granted)
      await register()
  } catch {
    // O pedido é extra: a ação já foi feita.
  }
}

/** As mutations depois das quais o app pede a permissão (`askForPush`). */
const ASK_AFTER = new Set([
  'recommendations.remind',
  'recommendations.setAlert',
  'friends.request',
  'friends.respond'
])

queryClient.getMutationCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'success') return
  const key = event.mutation.options.mutationKey?.[0]
  const path = Array.isArray(key) ? key.join('.') : ''
  const vars = event.mutation.state.variables as
    | { on?: boolean; accept?: boolean }
    | undefined
  if (ASK_AFTER.has(path) && vars?.on !== false && vars?.accept !== false)
    askForPush()
})

/**
 * "Vou também" e "Agora não" da 24g, sem abrir o app. Já respondido (o
 * outro aparelho, a tarefa e o ouvinte juntos) conta como feito. Outra recusa
 * (jogo começou, lista fechada) volta como notificação com a frase do
 * servidor, que abre Avisos.
 */
async function answerCall(response: Response) {
  const { actionIdentifier, notification } = response
  const data = notification.request.content.data as Record<string, string>
  if (
    !Notifications ||
    data?.type !== 'friend_call' ||
    (actionIdentifier !== 'going' && actionIdentifier !== 'not_now')
  )
    return
  try {
    await trpcClient.friends.respondCall.mutate({
      callId: data.callId as string,
      answer: actionIdentifier
    })
    queryClient.invalidateQueries({ refetchType: 'none' })
  } catch (error) {
    const code = (error as { data?: { code?: string } }).data?.code
    if (code !== 'PRECONDITION_FAILED')
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Não deu para responder',
          body:
            error instanceof Error && code
              ? error.message
              : 'Abra os avisos para tentar de novo.',
          data: { url: '/avisos' }
        },
        trigger: null
      }).catch(() => {})
  }
  await Notifications.dismissNotificationAsync(
    notification.request.identifier
  ).catch(() => {})
}

const handled = new Set<string>()

type Router = ReturnType<typeof useRouter>

function respond(response: Response, router: Router) {
  const id = `${response.notification.request.identifier}:${response.actionIdentifier}`
  if (handled.has(id)) return
  handled.add(id)
  const data = response.notification.request.content.data as Record<
    string,
    string
  >
  if (response.actionIdentifier === 'bar' && data?.barId)
    return router.push(`/bar/${data.barId}`)
  if (
    response.actionIdentifier === 'going' ||
    response.actionIdentifier === 'not_now'
  )
    return void answerCall(response)
  if (typeof data?.url === 'string') router.push(data.url as never)
}

/**
 * Montado no layout raiz, depois do `Stack`: registra o aparelho a cada
 * sessão e leva à tela da notificação tocada, inclusive a que abriu o app.
 */
export function PushResponder() {
  const router = useRouter()
  const sessionId = authClient.useSession().data?.session.id
  useEffect(() => {
    if (sessionId) syncRegistration()
  }, [sessionId])
  useEffect(() => {
    if (!Notifications) return
    const last = Notifications.getLastNotificationResponse()
    if (last) {
      Notifications.clearLastNotificationResponse()
      respond(last, router)
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      respond(r, router)
    )
    return () => sub.remove()
  }, [router])
  return null
}
