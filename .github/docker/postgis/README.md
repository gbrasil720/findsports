# Imagem PostGIS para CI

O CI usa `ghcr.io/gbrasil720/findsports/ci-postgis:17-3.5-alpine` em vez de puxar
`imresamu/postgis` do Docker Hub (rate limit anônimo no GitHub Actions).

A imagem é gerada pelo workflow `.github/workflows/publish-ci-postgis.yml`, que
roda o `build.sh` desta pasta: compila o Dockerfile oficial do PostGIS 3.5 sobre
`public.ecr.aws/docker/library/postgres:17-alpine` (mirror público da AWS, sem
Docker Hub). Em PR só o build roda; o push para o GHCR, com `packages: write`, é
um job à parte que só existe fora de PR.

Localmente o `docker-compose.yml` continua com `imresamu/postgis:17-3.5-alpine`.

**Primeira vez / rebuild:** Actions → *Publish CI PostGIS image* → *Run workflow*.
Depois do push, deixe o pacote **público** em
https://github.com/orgs/gbrasil720/packages (ou garanta `packages: read` no CI —
já configurado no workflow).
