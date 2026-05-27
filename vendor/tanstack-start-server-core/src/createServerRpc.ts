import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import type { ServerFnMeta } from '@tanstack/start-client-core'
import { createClientRpc } from '@tanstack/start-client-core/client-rpc'

export const createServerRpc = (
  serverFnMeta: ServerFnMeta,
  splitImportFn: (...args: any) => any,
) => {
  const url = process.env.TSS_SERVER_FN_BASE + serverFnMeta.id
  const clientRpc = createClientRpc(serverFnMeta.id)

  const fn = (...args: Array<any>) =>
    typeof window === 'undefined'
      ? splitImportFn(...args)
      : clientRpc(...args)

  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
