import type { AnyFieldApi } from '@tanstack/form-core'

/**
 * `onChange` dos campos de auth. As regras rodam no `blur` e no envio; com o
 * erro na tela, passam a rodar também a cada alteração, e a linha de erro some
 * enquanto a pessoa digita a correção. Se sumisse só no `blur`, o formulário
 * subiria ~30px no meio do clique seguinte e o clique cairia fora do botão.
 * Sem erro na tela nada muda: ninguém é avisado de erro enquanto ainda digita.
 */
export function changeAuthField(field: AnyFieldApi, value: string) {
  const showingError = field.state.meta.errors.length > 0
  field.handleChange(value)
  if (showingError) field.validate('blur')
}
