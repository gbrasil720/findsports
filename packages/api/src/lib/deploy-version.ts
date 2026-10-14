/**
 * Versão do Worker no ar, para o Bastidores (WEB-389). Vem do binding
 * `version_metadata`, que só existe no Worker: o `worker.ts` entrega aqui, e
 * no `vite dev` fica nula ("local").
 */
export type DeployVersion = { id: string; tag: string; timestamp: string }

let current: DeployVersion | null = null

export function setDeployVersion(version: DeployVersion) {
  current = version
}

export function getDeployVersion() {
  return current
}
