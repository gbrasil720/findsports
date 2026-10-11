import { describe, expect, test } from 'bun:test'
import { FieldApi, FormApi } from '@tanstack/form-core'
import { changeAuthField, revalidateShownError } from './auth-field-change'

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

describe('revalidateShownError', () => {
  function mountPasswords() {
    const form = new FormApi({ defaultValues: { password: '', confirm: '' } })
    form.mount()
    const password = new FieldApi({
      form,
      name: 'password',
      listeners: { onChange: () => revalidateShownError(form, 'confirm') }
    })
    password.mount()
    const confere = ({ value }: { value: string }) =>
      value === form.getFieldValue('password')
        ? undefined
        : 'As senhas não coincidem.'
    const confirm = new FieldApi({
      form,
      name: 'confirm',
      validators: { onBlur: confere, onSubmit: confere }
    })
    confirm.mount()
    return { password, confirm }
  }

  test('corrigir a senha apaga o erro da confirmação', () => {
    const { password, confirm } = mountPasswords()
    changeAuthField(password, 'senha-com-erro')
    changeAuthField(confirm, 'senha-certa-1')
    confirm.handleBlur()
    expect(confirm.state.meta.errors).toEqual(['As senhas não coincidem.'])

    changeAuthField(password, 'senha-certa-1')
    expect(confirm.state.meta.errors).toHaveLength(0)
  })

  test('sem erro na tela, mudar a senha não acusa a confirmação', () => {
    const { password, confirm } = mountPasswords()
    changeAuthField(password, 'senha-certa-1')
    changeAuthField(confirm, 'senha-certa-1')
    confirm.handleBlur()

    changeAuthField(password, 'outra-senha-2')
    expect(confirm.state.meta.errors).toHaveLength(0)
  })
})
