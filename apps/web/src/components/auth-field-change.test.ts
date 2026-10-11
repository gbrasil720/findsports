import { describe, expect, test } from 'bun:test'
import { FieldApi, FormApi } from '@tanstack/form-core'
import { changeAuthField } from './auth-field-change'

const validate = ({ value }: { value: string }) =>
  value.length >= 8 ? undefined : 'A senha deve ter pelo menos 8 caracteres.'

function mountField() {
  const form = new FormApi({ defaultValues: { password: '' } })
  form.mount()
  const field = new FieldApi({
    form,
    name: 'password',
    validators: { onBlur: validate, onSubmit: validate }
  })
  field.mount()
  return field
}

describe('changeAuthField', () => {
  test('com erro na tela, a correção apaga o erro sem esperar o blur', () => {
    const field = mountField()
    changeAuthField(field, 'curta')
    field.handleBlur()
    expect(field.state.meta.errors).toHaveLength(1)

    changeAuthField(field, 'curta ainda')
    expect(field.state.meta.errors).toHaveLength(0)
  })

  test('com erro na tela, valor ainda inválido mantém o erro', () => {
    const field = mountField()
    changeAuthField(field, 'curta')
    field.handleBlur()

    changeAuthField(field, 'curta!')
    expect(field.state.meta.errors).toHaveLength(1)
  })

  test('sem erro na tela, digitar valor inválido não mostra erro', () => {
    const field = mountField()
    changeAuthField(field, 'c')
    expect(field.state.meta.errors).toHaveLength(0)
  })
})
