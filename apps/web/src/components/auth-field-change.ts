import type { AnyFieldApi } from '@tanstack/form-core'

/**
 * `onChange` dos campos de auth. As regras rodam no `blur` e no envio; com o
 * erro na tela, passam a rodar também a cada alteração, e a linha de erro some
 * enquanto a pessoa digita a correção. Se sumisse só no `blur`, o formulário
 * subiria ~30px no meio do clique seguinte e o clique cairia fora do botão.
 * Sem erro na tela nada muda: ninguém é avisado de erro enquanto ainda digita.
 */
export function changeAuthField(
  field: Pick<AnyFieldApi, 'state' | 'handleChange' | 'validate'>,
  value: string
) {
  const showingError = field.state.meta.errors.length > 0
  field.handleChange(value)
  if (showingError) field.validate('blur')
}

/**
 * Para campo cuja regra olha outro campo (a confirmação olha a senha): quando
 * o outro muda, o erro que já está na tela é conferido de novo. Vai no
 * `listeners.onChange` do outro campo. Sem erro na tela não faz nada, pelo
 * mesmo motivo de `changeAuthField`.
 */
export function revalidateShownError<TName extends string>(
  form: {
    getFieldMeta: (name: TName) => { errors: unknown[] } | undefined
    validateField: (name: TName, cause: 'blur') => unknown
  },
  name: TName
) {
  if (form.getFieldMeta(name)?.errors.length) form.validateField(name, 'blur')
}
