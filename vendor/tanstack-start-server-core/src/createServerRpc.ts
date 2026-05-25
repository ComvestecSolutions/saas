import { TSS_SERVER_FUNCTION } from '@tanstack/start-client-core'
import type { ServerFnMeta } from '@tanstack/start-client-core'
import { serverFnFetcher } from '@tanstack/start-client-core/client-rpc'

export const createServerRpc = (
  serverFnMeta: ServerFnMeta,
  splitImportFn: (...args: any) => any,
) => {
  const url = process.env.TSS_SERVER_FN_BASE + serverFnMeta.id

  const fn = (...args: Array<any>) =>
    typeof window === 'undefined'
      ? splitImportFn(...args)
      : serverFnFetcher(url, args, fetch)

  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true,
  })
}
