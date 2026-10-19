const NOT_FOUND_DESCRIPTION =
  'Essa página saiu de campo. O link pode estar quebrado ou a página não existe mais.'

/**
 * Meta da página de não encontrado. Vale para a rota curinga (`$.tsx`) e para
 * o `notFound()` lançado por uma rota que existe (bar com id que não existe):
 * nesse caso o `head` da rota não roda, e quem põe o `noindex` é a raiz.
 */
export const NOT_FOUND_META = [
  { title: 'Página não encontrada — Onside' },
  { name: 'description', content: NOT_FOUND_DESCRIPTION },
  { name: 'robots', content: 'noindex, nofollow' }
]
