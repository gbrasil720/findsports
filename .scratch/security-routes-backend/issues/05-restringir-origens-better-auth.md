# 05: Restringir origens confiáveis do Better Auth

**What to build:** produção confia somente na origem canônica do produto. Um túnel HTTPS pode ser habilitado explicitamente em desenvolvimento, sem wildcard e sem contaminar a fronteira de CSRF/open redirect de produção.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Configuração de produção não contém origem ngrok.
- [x] Desenvolvimento aceita somente uma origem adicional HTTPS válida e explícita.
- [x] Wildcards, protocolos inseguros e valores inválidos falham durante a configuração.

