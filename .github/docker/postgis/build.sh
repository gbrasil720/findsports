#!/usr/bin/env bash
# Build da imagem do CI (publish-ci-postgis.yml). Lê IMAGE_NAME, BASE_IMAGE e
# POSTGIS_REF do ambiente do workflow.
set -euo pipefail
# Commit fixo: o master do docker-postgis tirou 17-3.5/alpine em 18/10/2026
# (#463), e um clone do master quebrava o build.
git init -q /tmp/docker-postgis
git -C /tmp/docker-postgis fetch -q --depth 1 https://github.com/postgis/docker-postgis.git "${POSTGIS_REF}"
git -C /tmp/docker-postgis checkout -q FETCH_HEAD
docker build \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  -t "${IMAGE_NAME}:17-3.5-alpine" \
  -t "${IMAGE_NAME}:latest" \
  /tmp/docker-postgis/17-3.5/alpine
