import {
  notifyManager,
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverBaseResult,
  type QueryState,
  useQueryClient,
  type useQueryErrorResetBoundary,
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
 * The value of TanStack Query's QueryErrorResetBoundary, as returned by
 * `useQueryErrorResetBoundary()`: an ErrorBoundary calls `reset()` to retry, and
 * `isReset()` holds until a query read under it commits.
 */
export type ErrorResetBoundary = ReturnType<typeof useQueryErrorResetBoundary>

/**
 * Options for `getQueryResult`.
 */
type GetQueryResultOptions = {
  /** If true, throws Promise when observer is first created (default: false) */
  suspendOnCreate?: boolean
  /**
   * The QueryErrorResetBoundary the caller renders under, from
   * `useQueryErrorResetBoundary()`. While it is reset, a failed query is fetched
   * again instead of thrown; without it, only `clearCache` retries a failed query.
   */
  errorResetBoundary?: ErrorResetBoundary
}

/**
 * Function type for getting query results synchronously.
 * Throws Promise during loading, throws Error on error, returns data on success.
 */
type GetQueryResult = <T extends readonly ScreenQueryResult[]>(
  results: [...T],
  options?: GetQueryResultOptions,
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
   * @param options.errorResetBoundary - The QueryErrorResetBoundary to retry failed queries on reset
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
 * on its next render. The Observer would then still hold the detached Query, so
 * the suspend Promise waiting on it would subscribe to - and fetch - a Query the
 * cache has thrown away: nothing would ever fetch the entry the screen is actually
 * reading, and it would never leave its fallback.
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
 * rendered, so it is worth surfacing rather than silently absorbing.
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
 * State of one registered query, paired with the Observer a suspend Promise can
 * wait on to learn that it settled.
 */
type RegisteredQueryState = {
  observer: QueryObserver
  isPending: boolean
}

/**
 * Read the failures among the queries the caller passed: queries whose cache entry
 * has settled with an error and no data, while the result passed for them reads as
 * pending.
 *
 * A render retried after a suspend mounts the consumer's observer afresh, and a
 * fresh observer reports a query that failed without data as pending - it expects to
 * fetch it on mount (`retryOnMount`). The consumer never makes that fetch: the render
 * is suspended and never commits. Taking the result at its word would make the
 * suspend promise fetch it through the provider's observer instead, so a query that
 * keeps failing would be fetched again on every retried render and never reach the
 * ErrorBoundary. The cache entry tells the two apart - a fetch puts a query without
 * data back to pending, and so do `clearCache` and `resetQueries()`, so an `error`
 * status means nothing has asked for it again. A reset QueryErrorResetBoundary is
 * the other way to ask, and `getQueryResult` skips this read while it holds.
 * @param queryClient - TanStack Query's QueryClient
 * @param results - Query results the caller passed
 * @returns Settled cache state of each failed query, keyed by query key string
 */
function readSettledFailures(
  queryClient: QueryClient,
  results: readonly ScreenQueryResult[],
) {
  const failures = new Map<string, QueryState>()

  for (const result of results) {
    if (!result.isPending) continue

    const state = queryClient.getQueryState(result.queryKey)
    if (state?.status === 'error') {
      failures.set(getQueryKeyString(result), state)
    }
  }

  return failures
}

/**
 * Read the state of every registered query.
 *
 * A result the caller passed decides for its own query. It is recomputed from the
 * live cache entry on every render and it is what `getQueryResult` hands back, so
 * deciding from it keeps the suspend decision and the returned data in step - a
 * query can never be treated as settled while its data is still `undefined`. The
 * one exception is a query that already failed (`readSettledFailures`): it is
 * settled, and it is thrown rather than returned.
 *
 * A provider-owned observer only reports what it saw when the query last settled:
 * it is unsubscribed as soon as its suspend Promise resolves, and a query rewound
 * in place - `resetQueries()` keeps the same Query object and only puts its state
 * back to pending - notifies nobody who is not subscribed. So its snapshot decides
 * only for the queries nobody passed this render, which is what keeps the whole
 * screen suspended together.
 * @param observers - Registered Observers, keyed by query key string
 * @param results - Query results the caller passed
 * @param failures - Passed queries that already failed
 * @returns State of every registered query
 */
function readQueryStates(
  observers: Map<string, QueryObserver>,
  results: readonly ScreenQueryResult[],
  failures: ReadonlyMap<string, QueryState>,
): RegisteredQueryState[] {
  const passed = new Map(
    results.map((result) => [getQueryKeyString(result), result]),
  )

  return [...observers].map(([keyString, observer]) => ({
    observer,
    isPending:
      !failures.has(keyString) &&
      (passed.get(keyString) ?? observer.getCurrentResult()).isPending,
  }))
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
 * Create Promise that waits for a registered query to settle.
 *
 * Whether it has already settled is taken from the state that made the suspend
 * decision, not from the Observer's own snapshot: a Promise that resolves against
 * a snapshot the decision rejected would resolve at once and suspend again on the
 * retried render, spinning until the query settles on its own.
 * @param state - State of the query to wait for
 * @returns Promise that waits for completion
 */
function createObserverPromise(
  { observer, isPending }: RegisteredQueryState,
  errorResetBoundary?: ErrorResetBoundary,
) {
  return new Promise<void>((resolve) => {
    if (!isPending) {
      resolve()
      return
    }

    const unsubscribe = observer.subscribe((result) => {
      if (result.isSuccess || result.isError) {
        // A reset holds until a query read under it commits, and a retried render
        // never commits: without clearing it here, a retry that fails again would be
        // fetched once more on every retried render instead of thrown
        if (result.isError) errorResetBoundary?.clearReset()
        unsubscribe()
        resolve()
      }
    })
  })
}

/**
 * Get query error from the results the caller passed.
 *
 * Only errors without existing data are returned, mirroring the default
 * `throwOnError` of useSuspenseQuery/useSuspenseInfiniteQuery
 * (`query.state.data === undefined`). This keeps partial data visible when a
 * refetch or fetchNextPage fails, instead of tearing down the screen via the
 * ErrorBoundary. A passed query that already failed while its result reads as
 * pending contributes the error its cache entry settled with.
 * @param results - Query results the caller passed
 * @param failures - Passed queries that already failed
 * @returns The first error found, or undefined if no errors
 */
function getQueryError(
  results: readonly ScreenQueryResult[],
  failures: ReadonlyMap<string, QueryState>,
) {
  for (const result of results) {
    if (result.isError && result.data === undefined) return result.error

    const failure = failures.get(getQueryKeyString(result))
    if (failure) return failure.error
  }

  return undefined
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
   * @returns true if an Observer was created for any of the queries
   */
  const registerQueriesAndObservers = useCallback(
    (queries: readonly ScreenQuery[]) => {
      // Mapped before reducing so every query is registered, not just the ones
      // before the first newly created Observer
      return queries
        .map((query) => {
          const keyString = getQueryKeyString(query)

          // Save query to Map
          queriesRef.current.set(keyString, query)

          // Check for existing Observer, create new if none
          const currentObserver = observersRef.current.get(keyString)
          if (currentObserver) {
            // The cache entry may have been replaced since the last render
            if (syncObserverQuery(queryClient, currentObserver, query)) {
              warnDetachedQuery(warnedRef.current, keyString, query.queryKey)
            }
          } else {
            observersRef.current.set(
              keyString,
              createObserver(queryClient, query),
            )
          }

          return !currentObserver
        })
        .some(Boolean)
    },
    [queryClient],
  )

  /**
   * Create or get Promise that waits for every registered query to settle
   * Reuses existing Promise for the same query set
   * @param states - State of every registered query
   * @param queries - Corresponding query array (for key generation)
   * @param errorResetBoundary - QueryErrorResetBoundary to clear when a query fails
   * @returns Promise that waits for all pending queries to settle
   */
  const createCombinedPromise = useCallback(
    (
      states: readonly RegisteredQueryState[],
      queries: readonly ScreenQuery[],
      errorResetBoundary?: ErrorResetBoundary,
    ) => {
      const querySetKey = generateQuerySetKey(queries)

      // Check for existing Promise for the same query set
      const existingPromise = queryPromiseRef.current.get(querySetKey)
      // Create new Promise if none exists
      const combinedPromise =
        existingPromise ??
        Promise.all(
          states.map((state) =>
            createObserverPromise(state, errorResetBoundary),
          ),
        ).then(() => {
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
   * @param options.errorResetBoundary - The QueryErrorResetBoundary to retry failed queries on reset
   * @returns Array of data
   */
  const getQueryResult = useCallback(
    (
      results: readonly ScreenQueryResult[],
      options?: GetQueryResultOptions,
    ) => {
      const { suspendOnCreate = false, errorResetBoundary } = options ?? {}

      // Register queries and Observers
      const observerCreated = registerQueriesAndObservers(results)

      // Read the state of every registered query, not only the ones passed in
      // An ErrorBoundary reset asks for every failed query again
      const failures = errorResetBoundary?.isReset()
        ? new Map<string, QueryState>()
        : readSettledFailures(queryClient, results)
      const queryStates = readQueryStates(
        observersRef.current,
        results,
        failures,
      )

      // Check loading state and throw Promise for React Suspense
      if (
        (suspendOnCreate && observerCreated) ||
        queryStates.some((state) => state.isPending)
      ) {
        // React Suspense pattern: Throwing a Promise is the correct way to trigger Suspense.
        // When React catches this Promise, it will show the fallback UI and re-render when resolved.
        // This ensures all queries complete before rendering, preventing partial UI updates.
        throw createCombinedPromise(queryStates, results, errorResetBoundary)
      }

      // Check for errors and throw for React ErrorBoundary
      const error = getQueryError(results, failures)
      if (error) {
        // React ErrorBoundary pattern: Throwing an Error triggers the nearest ErrorBoundary.
        // This provides consistent error handling across all queries in the component.
        throw error
      }

      // Every result is settled here, and an error was only tolerated while it had
      // data to show, so no element of this array is undefined: the declared
      // return type holds
      return results.map((q) => q.data)
    },
    [queryClient, registerQueriesAndObservers, createCombinedPromise],
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
