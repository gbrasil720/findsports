import { APIError } from 'better-auth/api'

/**
 * O papel (fan/pub) é escolhido no cadastro e não pode ser trocado pelo
 * próprio usuário no endpoint genérico `/update-user`. O plugin local
 * `allow-role-on-signup` deixa `role` com `input: true`, e o better-auth
 * não distingue signup de update nesse atributo — o `input: false` do
 * plugin admin bloquearia também o cadastro. O único caminho legítimo de
 * troca é administrativo (`/admin/set-role` do plugin admin).
 */
export function assertNoSelfRoleChange(body: unknown): void {
  if (body && typeof body === 'object' && 'role' in body) {
    throw new APIError('BAD_REQUEST', {
      message:
        'O papel é definido no cadastro e só pode ser alterado por um administrador.'
    })
  }
}
