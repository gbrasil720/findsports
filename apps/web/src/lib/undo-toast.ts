import { toast } from 'sonner'

/**
 * Tempo do aviso com "Desfazer" (WEB-321). O aviso comum fica 4 s, o que dá
 * para ler; aqui é preciso ler, perceber o toque errado e chegar ao botão.
 * Pelo teclado, Alt+T leva o foco aos avisos e segura o tempo enquanto o foco
 * está neles.
 */
const UNDO_TOAST_MS = 10_000

/**
 * Aviso de confirmação com "Desfazer". O botão some junto com o aviso: passado
 * o tempo, a resposta fica. Se desfazer falhar, a resposta continua valendo e
 * o aviso diz isso.
 */
export function toastWithUndo(message: string, undo: () => Promise<unknown>) {
  toast.success(message, {
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Desfazer',
      onClick: () =>
        undo().then(
          () => toast.success('Resposta desfeita.'),
          () =>
            toast.error(
              'Não foi possível desfazer. Sua resposta continua valendo.'
            )
        )
    }
  })
}
