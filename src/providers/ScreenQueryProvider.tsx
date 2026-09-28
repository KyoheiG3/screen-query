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
  /**
   * Whether the caller is already on screen (default: false). A caller that is
   * on screen waits only for the queries it passes: the queries others registered
   * belong to components still resolving, and waiting for them would take down
   * what is already painted. Passing it also hands the queries' registration to
   * `retainQueries`; a call that omits it keeps its queries registered for good.
   */
  mounted?: boolean
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
  /**
   * Hold queries in the registration while a component on screen reads them.
   * A query nothing holds any more leaves the registration once the release has
   * settled, so `refetchQueries` and the suspend decision no longer include it.
   * A query a `getQueryResult` call without `mounted` registered stays.
   * @param queryKeys - Keys of the queries the component reads
   * @returns Function that releases them
   */
  retainQueries: (queryKeys: readonly QueryKey[]) => () => void
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
  keyString: string
  observer: QueryObserver
  isPending: boolean
}

/**
 * What the provider knows about a registered query besides its Observer.
 * - `passedPending` - Whether the result last passed for it read as pending
 * - `registeredBy` - Who registered it last: `direct` (a call without `mounted`;
 *   it stays for good, so a later call does not change it), `mounting` (a caller
 *   coming on screen) or `mounted` (a caller already on screen)
 */
type Registration = {
  passedPending: boolean
  registeredBy: 'direct' | 'mounting' | 'mounted'
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
 * Whether a registered query reads as pending: its observer's snapshot says so and
 * the result last passed for it did too.
 *
 * A provider-owned observer only reports what it saw when the query last settled:
 * it is unsubscribed as soon as its suspend Promise resolves, and a query rewound in
 * place - `resetQueries()` keeps the same Query object and only puts its state back
 * to pending - notifies nobody who is not subscribed. A caller that got a result it
 * could paint (placeholder data) painted it, while the observer nobody subscribes to
 * would report the query as pending for good, so that result also counts.
 * @param observer - Provider-owned Observer of the query
 * @param registration - What is known about the query
 * @returns true if the query reads as pending
 */
function isRegisteredPending(
  observer: QueryObserver,
  registration: Registration | undefined,
) {
  return (
    registration?.passedPending !== false &&
    observer.getCurrentResult().isPending
  )
}

/**
 * Read the state of the queries a caller waits for.
 *
 * A result the caller passed decides for its own query. It is recomputed from the
 * live cache entry on every render and it is what `getQueryResult` hands back, so
 * deciding from it keeps the suspend decision and the returned data in step - a
 * query can never be treated as settled while its data is still `undefined`. The
 * one exception is a query that already failed (`readSettledFailures`): it is
 * settled, and it is thrown rather than returned.
 *
 * The other registered queries decide through `isRegisteredPending`, and only the
 * ones `isPeer` accepts: the queries of components coming on screen alongside the
 * caller, which is what keeps them from painting in parts.
 * @param observers - Registered Observers, keyed by query key string
 * @param results - Query results the caller passed
 * @param failures - Passed queries that already failed
 * @param registrations - What is known about each registered query
 * @param isPeer - Whether the caller waits for a query it did not pass
 * @returns State of every query the caller waits for
 */
function readQueryStates(
  observers: Map<string, QueryObserver>,
  results: readonly ScreenQueryResult[],
  failures: ReadonlyMap<string, QueryState>,
  registrations: ReadonlyMap<string, Registration>,
  isPeer: (keyString: string) => boolean,
): RegisteredQueryState[] {
  const passed = new Map(
    results.map((result) => [getQueryKeyString(result), result]),
  )

  return [...observers]
    .filter(([keyString]) => passed.has(keyString) || isPeer(keyString))
    .map(([keyString, observer]) => {
      const result = passed.get(keyString)
      return {
        keyString,
        observer,
        isPending:
          !failures.has(keyString) &&
          (result
            ? result.isPending
            : isRegisteredPending(observer, registrations.get(keyString))),
      }
    })
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
 * Generate unique set key from the queries a suspend Promise waits for.
 * Used as identifier for Promise management: callers that pass the same queries
 * can still wait for different ones (a mounting caller also waits for its peers),
 * so the key is taken from what is waited for, not from what was passed
 * @param states - State of every query the caller waits for
 * @returns Sorted pipe-delimited string
 */
function generateQuerySetKey(states: readonly RegisteredQueryState[]) {
  return states
    .map((state) => state.keyString)
    .sort()
    .join('|')
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
  const registrationsRef = useRef<Map<string, Registration>>(new Map())
  // Queries that got an Observer since the provider mounted or `clearCache` ran.
  // `suspendOnCreate` reads it rather than `observersRef`, since the sweep drops
  // Observers of queries a component can return to
  const observedKeysRef = useRef<Set<string>>(new Set())
  // Queries components on screen hold (`retainQueries`), with how many hold each.
  // A hold keeps its own query: the sweep can drop the registration of a query a
  // component rendered but has not held yet, before its effect holds it
  const holdersRef = useRef<Map<string, { query: ScreenQuery; count: number }>>(
    new Map(),
  )

  /**
   * Whether a registered query is on screen: a component holds it, or a call
   * without `mounted` registered it (nothing can tell when its reader is gone)
   * @param keyString - Serialized query key
   * @returns true if the query is on screen
   */
  const isOnScreen = useCallback(
    (keyString: string) =>
      holdersRef.current.has(keyString) ||
      registrationsRef.current.get(keyString)?.registeredBy === 'direct',
    [],
  )

  /**
   * Register queries and Observers or get existing ones
   * @param queries - Array of queries to register
   * @param mounted - The `mounted` option of the call, undefined if it was omitted
   * @returns true if any of the queries got its first Observer
   */
  const registerQueriesAndObservers = useCallback(
    (queries: readonly ScreenQueryResult[], mounted: boolean | undefined) => {
      // Mapped before reducing so every query is registered, not just the ones
      // before the first newly created Observer
      return queries
        .map((query) => {
          const keyString = getQueryKeyString(query)

          // Save query to Map
          queriesRef.current.set(keyString, query)
          const direct =
            mounted === undefined ||
            registrationsRef.current.get(keyString)?.registeredBy === 'direct'
          registrationsRef.current.set(keyString, {
            passedPending: query.isPending,
            registeredBy: direct ? 'direct' : mounted ? 'mounted' : 'mounting',
          })

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

          const firstObserver = !observedKeysRef.current.has(keyString)
          observedKeysRef.current.add(keyString)
          return firstObserver
        })
        .some(Boolean)
    },
    [queryClient],
  )

  /**
   * Create or get Promise that waits for every query the caller waits for to settle
   * Reuses existing Promise for the same query set
   * @param states - State of every query the caller waits for
   * @param errorResetBoundary - QueryErrorResetBoundary to clear when a query fails
   * @returns Promise that waits for all pending queries to settle
   */
  const createCombinedPromise = useCallback(
    (
      states: readonly RegisteredQueryState[],
      errorResetBoundary?: ErrorResetBoundary,
    ) => {
      const querySetKey = generateQuerySetKey(states)

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
      const observerCreated = registerQueriesAndObservers(
        results,
        options?.mounted,
      )

      // Read the state of every registered query, not only the ones passed in
      // An ErrorBoundary reset asks for every failed query again
      const failures = errorResetBoundary?.isReset()
        ? new Map<string, QueryState>()
        : readSettledFailures(queryClient, results)
      const queryStates = readQueryStates(
        observersRef.current,
        results,
        failures,
        registrationsRef.current,
        (keyString) =>
          // A caller on screen waits only for its own queries. A mounting one waits
          // for the queries of other components still coming on screen - not the
          // ones painted components hold or update (a transition, a refetch)
          !options?.mounted &&
          !holdersRef.current.has(keyString) &&
          registrationsRef.current.get(keyString)?.registeredBy !== 'mounted',
      )

      // Check loading state and throw Promise for React Suspense
      if (
        (suspendOnCreate && observerCreated) ||
        queryStates.some((state) => state.isPending)
      ) {
        // React Suspense pattern: Throwing a Promise is the correct way to trigger Suspense.
        // When React catches this Promise, it will show the fallback UI and re-render when resolved.
        // This ensures all queries complete before rendering, preventing partial UI updates.
        throw createCombinedPromise(queryStates, errorResetBoundary)
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
   * Refetch the registered queries that are on screen: the ones components hold,
   * and the ones a call without `mounted` registered. A query only a render still
   * resolving - or one React discarded - registered is not on screen yet
   * Used for pull-to-refresh etc.
   */
  const refetchQueries = useCallback(async () => {
    const onScreen = new Map<string, ScreenQuery>()
    for (const [keyString, query] of queriesRef.current) {
      if (registrationsRef.current.get(keyString)?.registeredBy === 'direct') {
        onScreen.set(keyString, query)
      }
    }
    for (const [keyString, { query }] of holdersRef.current) {
      onScreen.set(keyString, query)
    }
    const queries = [...onScreen.values()]

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
      observedKeysRef.current.clear()
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

  /**
   * Drop the registered queries that are not on screen and nobody waits for: the
   * ones a caller already on screen registered last (a deferred render, discarded
   * or still resolving - nobody else waits for it), and the settled ones. A render
   * still resolving a dropped query registers it again when it retries.
   *
   * What stays is a pending query a mounting render registered, since the other
   * mounting components wait for it.
   *
   * The Observer is not destroyed: a suspend Promise may still be subscribed to it,
   * and it detaches itself once the query settles.
   */
  const dropUnheldQueries = useCallback(() => {
    // Walked from the queries, not the Observers: `clearCache` empties the latter
    for (const keyString of queriesRef.current.keys()) {
      if (isOnScreen(keyString)) continue

      const observer = observersRef.current.get(keyString)
      const registration = registrationsRef.current.get(keyString)
      if (
        registration?.registeredBy === 'mounting' &&
        observer &&
        isRegisteredPending(observer, registration)
      ) {
        continue
      }

      queriesRef.current.delete(keyString)
      observersRef.current.delete(keyString)
      registrationsRef.current.delete(keyString)
    }
  }, [isOnScreen])

  /**
   * Hold queries while a component on screen reads them
   * @param queryKeys - Keys of the queries the component reads
   * @returns Function that releases them
   */
  const retainQueries = useCallback(
    (queryKeys: readonly QueryKey[]) => {
      const keyStrings = queryKeys.map((queryKey) => JSON.stringify(queryKey))
      const holders = holdersRef.current
      queryKeys.forEach((queryKey, index) => {
        const keyString = keyStrings[index]
        const count = (holders.get(keyString)?.count ?? 0) + 1
        holders.set(keyString, { query: { queryKey }, count })
      })

      return () => {
        for (const keyString of keyStrings) {
          const hold = holders.get(keyString)
          if (hold && hold.count > 1) hold.count--
          else holders.delete(keyString)
        }
        // Dropped once the commit has settled: StrictMode and a key that moves
        // between components release and hold it again within the same commit
        queueMicrotask(dropUnheldQueries)
      }
    },
    [dropUnheldQueries],
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
        retainQueries,
      }}
    >
      {children}
    </ScreenQueryContext.Provider>
  )
}
