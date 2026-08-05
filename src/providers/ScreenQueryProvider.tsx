import {
  notifyManager,
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverBaseResult,
  useQueryClient,
} from '@tanstack/react-query'
import type React from 'react'
import { createContext, useCallback, useEffect, useRef } from 'react'

/**
 * Extended query result that includes the query key.
 * Combines TanStack Query's UseQueryResult with query identification.
 * @template T - The type of data returned by the query
 * @template E - The type of error returned by the query
 */
export type ScreenQueryResult<T = unknown, E = Error> = QueryObserverBaseResult<
  T,
  E
> &
  ScreenQuery

type ScreenQuery = {
  queryKey: QueryKey
}

/**
 * Status options for clearing cache.
 * - 'error': Clear only queries in error state
 * - 'all': Clear all registered queries
 */
export type ClearCacheStatus = 'error' | 'all'

/**
 * Function type for getting query results synchronously.
 * Throws Promise during loading, throws Error on error, returns data on success.
 */
type GetQueryResult = <T extends readonly ScreenQueryResult[]>(
  results: [...T],
  options?: { suspendOnCreate?: boolean },
) => {
  [K in keyof T]: T[K] extends ScreenQueryResult<infer D> ? D : never
}

/**
 * Context value type for ScreenQueryProvider.
 * Provides methods to manage query states synchronously.
 */
export type ScreenQueryContextValue = {
  /**
   * Synchronously get results from multiple queries.
   * Integrates with React Suspense/ErrorBoundary for loading and error states.
   * @param results - Array of query results to fetch
   * @param options - Optional configuration
   * @param options.suspendOnCreate - If true, throws Promise when observer is first created (default: false)
   * @throws {Promise} During loading state (handled by Suspense)
   * @throws {Error} When query has error (handled by ErrorBoundary)
   * @returns Array of query data in the same order as input
   */
  getQueryResult: GetQueryResult
  /**
   * Refetch all registered queries with batched notifications.
   * Prevents partial UI updates by batching all refetch notifications.
   * @returns Promise that resolves when all queries are refetched
   */
  refetchQueries: () => Promise<void>
  /**
   * Clear query cache and reset observers based on status.
   * @param status - 'error' to clear only error queries, 'all' to clear everything
   * @returns Promise that resolves when cache is cleared
   */
  clearCache: (status: ClearCacheStatus) => Promise<void>
}

/**
 * React Context for accessing ScreenQuery functionality.
 * Must be used within ScreenQueryProvider.
 * @see {@link useScreenQueryContext} for the preferred way to access this context
 */
export const ScreenQueryContext = createContext<
  ScreenQueryContextValue | undefined
>(undefined)

/**
 * Create a QueryObserver
 * Inherits existing query configuration if available
 * @param queryClient - TanStack Query's QueryClient
 * @param query - Query to observe
 * @returns New QueryObserver
 */
function createObserver(queryClient: QueryClient, query: ScreenQuery) {
  const existingQuery = queryClient.getQueryCache().find({
    queryKey: query.queryKey,
    exact: true,
  })

  // Create new Observer
  return new QueryObserver(queryClient, {
    ...existingQuery?.options, // Inherit existing query configuration
    queryKey: query.queryKey,
  })
}

/**
 * Re-point an Observer at the Query that is currently in the cache.
 *
 * A cache entry can be dropped behind the Observer's back (`removeQueries`,
 * `queryClient.clear()`, or garbage collection), and the consumer side rebuilds it
 * on its next render. The Observer would then keep reporting the state of the
 * detached Query - typically `isSuccess` - while the rebuilt Query is pending, so
 * re-applying the options keeps the snapshot used for the Suspense decision
 * truthful.
 * @param queryClient - TanStack Query's QueryClient
 * @param observer - Observer to re-point
 * @param query - Query being observed
 * @returns true if the Observer was pointing at a detached Query
 */
function syncObserverQuery(
  queryClient: QueryClient,
  observer: QueryObserver,
  query: ScreenQuery,
) {
  const cachedQuery = queryClient.getQueryCache().find({
    queryKey: query.queryKey,
    exact: true,
  })

  if (!cachedQuery || cachedQuery === observer.getCurrentQuery()) {
    return false
  }

  observer.setOptions({
    ...cachedQuery.options,
    queryKey: query.queryKey,
  })

  return true
}

// Bundlers replace `process.env.NODE_ENV` with a literal; declared locally so the
// package does not need Node types for one guard
declare const process: { env?: { NODE_ENV?: string } | undefined } | undefined

/**
 * Check whether the bundle is a production build, keeping warnings out of it.
 * @returns true if NODE_ENV is production
 */
function isProduction() {
  return (
    typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production'
  )
}

/**
 * Warn once per query key that its cache entry was replaced mid-resolution.
 *
 * Recovering from this costs a refetch and re-suspends a screen that had already
 * rendered, so it is worth surfacing rather than silently absorbing: without
 * `syncObserverQuery` the same situation reads as a settled query with `undefined`
 * data, which is a crash at the first property access.
 * @param warned - Keys already warned about, to keep the message to one per key
 * @param keyString - Serialized query key
 * @param queryKey - Query key to include in the message
 */
function warnDetachedQuery(
  warned: Set<string>,
  keyString: string,
  queryKey: QueryKey,
) {
  if (isProduction() || warned.has(keyString)) {
    return
  }
  warned.add(keyString)

  // biome-ignore lint/suspicious/noConsole: reporting a recovery a caller should know about
  console.warn(
    `[screen-query] The cache entry for ${keyString} was replaced while the screen was resolving it, so its data is being fetched again.\n` +
      "Expected right after removeQueries()/clear(). Otherwise the query was garbage collected mid-resolution: the Provider releases its observer as soon as the query settles, and the consumer's own observer only subscribes once the retried render commits, so a `gcTime: 0` entry can be collected in between.\n" +
      'Raise gcTime above that gap (a second is plenty) if this refetch is not intended.',
    queryKey,
  )
}

/**
 * Check loading state of multiple Observers
 * @param observers - Array of Observers to check
 * @returns true if any is pending, false if all are settled
 */
function checkLoadingState(observers: QueryObserver[]) {
  return observers.some((observer) => observer.getCurrentResult().isPending)
}

/**
 * Generate unique key string from query
 * @param query - Query to convert
 * @returns JSON stringified key
 */
function getQueryKeyString(query: ScreenQuery) {
  return JSON.stringify(query.queryKey)
}

/**
 * Generate unique set key from multiple queries
 * Used as identifier for Promise management
 * @param queries - Array of queries
 * @returns Sorted pipe-delimited string
 */
function generateQuerySetKey(queries: readonly ScreenQuery[]) {
  return queries.map(getQueryKeyString).sort().join('|')
}

/**
 * Create Promise that waits for Observer completion
 * Resolves when query succeeds or errors
 * @param observer - Observer to monitor
 * @returns Promise that waits for completion
 */
function createObserverPromise(observer: QueryObserver) {
  return new Promise<void>((resolve) => {
    const result = observer.getCurrentResult()
    if (result.isSuccess || result.isError) {
      resolve()
    } else {
      const unsubscribe = observer.subscribe((result) => {
        if (result.isSuccess || result.isError) {
          unsubscribe()
          resolve()
        }
      })
    }
  })
}

/**
 * Get query error from Observers or query results.
 * Checks both sources to find any existing error.
 *
 * Only errors without existing data are returned, mirroring the default
 * `throwOnError` of useSuspenseQuery/useSuspenseInfiniteQuery
 * (`query.state.data === undefined`). This keeps partial data visible when a
 * refetch or fetchNextPage fails, instead of tearing down the screen via the
 * ErrorBoundary.
 * @param observers - Array of QueryObservers to check
 * @param results - Array of QueryObserverBaseResult to check
 * @returns The first error found, or undefined if no errors
 */
function getQueryError(
  observers: readonly QueryObserver[],
  results: readonly QueryObserverBaseResult[],
) {
  return (
    observers
      .map((observer) => observer.getCurrentResult())
      .find((result) => result.isError && result.data === undefined)?.error ??
    results.find((q) => q.isError && q.data === undefined)?.error
  )
}

/**
 * Provider component that manages query states with React Suspense/ErrorBoundary.
 * Prevents partial UI updates and screen flickering by synchronizing multiple queries.
 *
 * @example
 * ```tsx
 * <QueryClientProvider client={queryClient}>
 *   <ScreenQueryProvider>
 *     <App />
 *   </ScreenQueryProvider>
 * </QueryClientProvider>
 * ```
 *
 * @param props - Component props
 * @param props.children - Child components to wrap
 */
export function ScreenQueryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const queriesRef = useRef<Map<string, ScreenQuery>>(new Map())
  const observersRef = useRef<Map<string, QueryObserver>>(new Map())
  const warnedRef = useRef<Set<string>>(new Set())
  const queryPromiseRef = useRef<Map<string, Promise<void>>>(new Map())

  /**
   * Register queries and Observers or get existing ones
   * @param queries - Array of queries to register
   * @returns Registration result for each query (creation flag and Observer)
   */
  const registerQueriesAndObservers = useCallback(
    (queries: readonly ScreenQuery[]) => {
      return queries.map((query) => {
        const keyString = getQueryKeyString(query)

        // Save query to Map
        queriesRef.current.set(keyString, query)

        // Check for existing Observer, create new if none
        const currentObserver = observersRef.current.get(keyString)
        const observer = currentObserver ?? createObserver(queryClient, query)
        if (currentObserver) {
          // The cache entry may have been replaced since the last render
          if (syncObserverQuery(queryClient, currentObserver, query)) {
            warnDetachedQuery(warnedRef.current, keyString, query.queryKey)
          }
        } else {
          observersRef.current.set(keyString, observer)
        }

        return { created: !currentObserver, observer }
      })
    },
    [queryClient],
  )

  /**
   * Create or get Promise that waits for all Observers in the specified query set to complete
   * Reuses existing Promise for the same query set
   * @param observers - Array of Observers to monitor
   * @param queries - Corresponding query array (for key generation)
   * @returns Promise that waits for all Observers to complete
   */
  const createCombinedPromise = useCallback(
    (observers: readonly QueryObserver[], queries: readonly ScreenQuery[]) => {
      const querySetKey = generateQuerySetKey(queries)

      // Check for existing Promise for the same query set
      const existingPromise = queryPromiseRef.current.get(querySetKey)
      // Create new Promise if none exists
      const combinedPromise =
        existingPromise ??
        Promise.all(observers.map(createObserverPromise)).then(() => {
          queryPromiseRef.current.delete(querySetKey)
        })
      if (!existingPromise) {
        queryPromiseRef.current.set(querySetKey, combinedPromise)
      }

      return combinedPromise
    },
    [],
  )

  /**
   * Get results for specified queries
   * Throws Promise if loading, throws Error if error
   * Returns data if successful
   * @param results - Array of query results to fetch
   * @param options - Optional configuration
   * @param options.suspendOnCreate - If true, throws Promise when observer is first created (default: false)
   * @returns Array of data
   */
  const getQueryResult = useCallback(
    (
      results: readonly ScreenQueryResult[],
      options?: { suspendOnCreate?: boolean },
    ) => {
      const { suspendOnCreate = false } = options ?? {}

      // Register queries and get Observers
      const registerResult = registerQueriesAndObservers(results)
      const observerCreated = registerResult.some((result) => result.created)

      // Get all Observers
      const allObservers = [...observersRef.current.values()]

      // Check loading state and throw Promise for React Suspense
      if (
        (suspendOnCreate && observerCreated) ||
        checkLoadingState(allObservers)
      ) {
        // React Suspense pattern: Throwing a Promise is the correct way to trigger Suspense.
        // When React catches this Promise, it will show the fallback UI and re-render when resolved.
        // This ensures all queries complete before rendering, preventing partial UI updates.
        throw createCombinedPromise(allObservers, results)
      }

      // Get current Observers
      const currentObservers = registerResult.map((result) => result.observer)
      // Check for errors and throw for React ErrorBoundary
      const error = getQueryError(currentObservers, results)
      if (error) {
        // React ErrorBoundary pattern: Throwing an Error triggers the nearest ErrorBoundary.
        // This provides consistent error handling across all queries in the component.
        throw error
      }

      // Return data
      return results.map((q) => q.data)
    },
    [registerQueriesAndObservers, createCombinedPromise],
  ) as GetQueryResult

  /**
   * Refetch all registered queries
   * Used for pull-to-refresh etc.
   */
  const refetchQueries = useCallback(async () => {
    const queries = [...queriesRef.current.values()]

    // Set custom notify function to temporarily ignore notifications
    notifyManager.setNotifyFunction(() => {})

    // Wrap in try-finally as a precaution though refetchQueries rarely errors
    try {
      // Refetch all queries in parallel
      await Promise.all(
        queries.map((query) =>
          queryClient.refetchQueries({
            queryKey: query.queryKey,
            exact: true,
          }),
        ),
      )
    } finally {
      // Restore default notify function, final notification executes at this point
      notifyManager.setNotifyFunction((fn) => fn())
    }
  }, [queryClient])

  /**
   * Clear query cache and reset Observers
   * @param status - 'error': Clear only error state queries / 'all': Clear all queries
   */
  const clearCache = useCallback(
    async (status: ClearCacheStatus) => {
      // Get queries to clear based on status
      const queries = [...observersRef.current.values()]
        .map((observer) => observer.getCurrentQuery())
        .filter((query) => status === 'all' || query.state.status === status)

      // Destroy and clear all Observers
      observersRef.current.forEach((observer) => {
        observer.destroy()
      })
      observersRef.current.clear()
      // Don't clear queriesRef (not for disposal)

      // Reset query cache (parallel execution)
      await notifyManager.batch(() =>
        Promise.all(
          queries.map((query) =>
            queryClient.resetQueries({
              queryKey: query.queryKey,
              exact: true,
            }),
          ),
        ),
      )
    },
    [queryClient],
  )

  // Clean up all Observers when Provider unmounts
  useEffect(() => {
    const currentObservers = observersRef.current
    return () => {
      // Destroy all Observers
      currentObservers.forEach((observer) => {
        observer.destroy()
      })
    }
  }, [])

  return (
    <ScreenQueryContext.Provider
      value={{
        getQueryResult,
        refetchQueries,
        clearCache,
      }}
    >
      {children}
    </ScreenQueryContext.Provider>
  )
}
