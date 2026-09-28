import {
  type QueryKey,
  useQueryErrorResetBoundary,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { ScreenQueryResult } from '~/providers/ScreenQueryProvider'
import { useScreenQueryContext } from './useScreenQueryContext'

/**
 * Options for `useSyncQuery`.
 */
type SyncQueryOptions = {
  /** If true, suspends when an observer is first created (default: false) */
  suspendOnCreate?: boolean
}

/**
 * Hook that reads one or more query results synchronously.
 *
 * @description
 * Wraps `getQueryResult` for use inside a component: loading suspends to the
 * nearest Suspense boundary, a failure without data is thrown to the nearest
 * ErrorBoundary, and only the data comes back. It also passes the
 * `QueryErrorResetBoundary` the component renders under, so resetting the
 * ErrorBoundary with `onReset={reset}` fetches failed queries again without
 * `clearCache` - `getQueryResult` is not a hook and cannot read it itself.
 *
 * @example
 * ```tsx
 * // A single query returns its data
 * const user = useSyncQuery(useQueryKey({ queryKey: ['user'], queryFn: fetchUser }))
 *
 * // Several queries return their data in order, resolved together
 * const [user, posts] = useSyncQuery([userQuery, postsQuery])
 * ```
 *
 * @param result - Query result, or an array of them, with `queryKey` included
 * @param options - Optional configuration
 * @param options.suspendOnCreate - If true, suspends when an observer is first created (default: false)
 * @returns The data, or an array of data in the same order as the input
 * @throws {Promise} During loading state (handled by Suspense)
 * @throws {Error} When a query failed without data (handled by ErrorBoundary)
 */
export function useSyncQuery<T, E>(
  result: ScreenQueryResult<T, E>,
  options?: SyncQueryOptions,
): T

export function useSyncQuery<T extends readonly ScreenQueryResult[]>(
  results: [...T],
  options?: SyncQueryOptions,
): { [K in keyof T]: T[K] extends ScreenQueryResult<infer D> ? D : never }

export function useSyncQuery(
  result: ScreenQueryResult | ScreenQueryResult[],
  options?: SyncQueryOptions,
) {
  const { getQueryResult, retainQueries } = useScreenQueryContext()
  const errorResetBoundary = useQueryErrorResetBoundary()
  const isArray = Array.isArray(result)
  const results = isArray ? result : [result]

  // Keyed by the serialized keys so a new result object for the same queries
  // does not release and hold them on every render
  const queryKeys = JSON.stringify(results.map((query) => query.queryKey))
  useEffect(
    () =>
      retainQueries(
        JSON.parse(queryKeys).map((queryKey: QueryKey) => ({ queryKey })),
      ),
    [retainQueries, queryKeys],
  )

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  const data = getQueryResult(results, {
    ...options,
    errorResetBoundary,
    mounted: mounted.current,
  })

  return isArray ? data : data[0]
}
