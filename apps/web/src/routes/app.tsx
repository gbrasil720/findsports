import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `start_url` do manifest (WEB-72).
 *
 * Não existe uma URL que sirva aos dois papéis: torcedor abre em `/dashboard`,
 * dono de bar abre em `/admin`. O manifest é estático e não sabe quem
 * instalou, então o ícone da tela inicial aponta para cá e esta rota
 * reaproveita a decisão que o `applyAuthGuards` já toma.
 *
 * Sem ela, metade dos usuários instalados abriria o app na tela do papel
 * errado e levaria um redirect visível a cada abertura.
 *
 * A rota está em `AUTHENTICATED_PREFIXES`: abrir o ícone sem sessão cai no
 * login, e não numa tela vazia.
 */
export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    const role = context.session?.user.role

    throw redirect({
      to:
        role === 'pub'
          ? '/admin'
          : role === 'admin'
            ? '/internal'
            : '/dashboard'
    })
  }
})
