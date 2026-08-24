# 06: Validar loja e caminho exatos das fotos

**What to build:** a foto de um bar só pode apontar para o hostname oficial da loja Vercel Blob e para o pathname exato autorizado durante o upload; URLs semelhantes de outras lojas ou caminhos prefixados são rejeitados.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Loja oficial e caminho exato são aceitos.
- [x] Outra loja, prefixo acrescido, porta alternativa, HTTP e esquemas não web são recusados.
- [x] Limites atuais de sessão, proprietário, MIME e tamanho permanecem ativos.

