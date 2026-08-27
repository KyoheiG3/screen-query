# Changelog

## 0.0.3

### Fixes

- **A query rewound in place no longer resolves as `undefined`.** `getQueryResult`
  decides whether to suspend from the results it was passed - the same source it
  hands back - so a query is never treated as settled while its data is still
  `undefined`, and the declared return type holds.

  A provider-owned observer is unsubscribed as soon as the suspend promise waiting on
  it resolves, so its snapshot stays at whatever the query looked like when it
  settled. `queryClient.resetQueries()` keeps the same `Query` object and only puts
  its state back to pending, and an unsubscribed observer is never told about that, so
  the snapshot kept reading as successful while the consumer's own result was pending.
  Replacing the cache entry - `removeQueries` / `clear()` / garbage collection - was
  already covered, because a replaced entry is something the provider notices.

  Observer snapshots still decide for queries registered by another call, which is
  what keeps a screen from painting in parts.

- **A suspend promise waits on exactly the queries the suspend decision found
  pending.** Deciding against live state while waiting on a stale snapshot resolved
  the promise at once, and the retried render suspended again - spinning through
  renders until the query settled on its own.

- **A screen is no longer torn down by an error its query has recovered from.** The
  error thrown to the ErrorBoundary comes from the results passed in, which follow
  the cache, rather than from an observer snapshot that can still hold an error the
  cache has since replaced with data.

## 0.0.2

### Fixes

- **Observers detached from the cache are no longer trusted as settled.** A reused
  observer is now re-pointed at the query currently in the cache, so the Suspense
  decision is made against live state.

  This is what made `gcTime: 0` queries crash. A suspended render never reaches its
  effects, so neither the consumer's observer nor the provider's is subscribed
  between the fetch settling and the retried render committing — a `gcTime: 0` entry
  is garbage collected in that window. The consumer then rebuilt the query as
  pending while the provider still reported the collected one as successful, so
  `getQueryResult` returned `undefined` for a query it considered settled: a
  `TypeError` at the first property access. The same shape occurs after
  `removeQueries` / `queryClient.clear()`. Such a query now suspends and refetches
  instead.

### Improvements

- **Recovering from a detached query is reported.** Being re-pointed costs a refetch
  and re-suspends a screen that had already painted, so it is logged once per query
  key with `console.warn` outside production instead of being absorbed silently. The
  message points at the usual cause (a `gcTime` shorter than the gap between the
  fetch settling and the render committing) and its fix.

## 0.0.1

Initial release of `screen-query` — React Query integration for synchronized
multi-query management with Suspense and ErrorBoundary support.

### Features

- **`ScreenQueryProvider`** — coordinates multiple queries on a screen through a
  shared set of QueryObservers, integrating React Query with Suspense and
  ErrorBoundary. Exposes `getQueryResult`, `clearCache`, and `refetchQueries`
  via context.
- **`useScreenQueryContext`** — hook to access the provider's query utilities.
- **`useQueryKey` / `useInfiniteQueryKey`** — wrap `useQuery` / `useInfiniteQuery`
  to include `queryKey` in the result (`UseQueryKeyResult` /
  `UseInfiniteQueryKeyResult`).
- **`suspendOnCreate` option** on `getQueryResult` — suspend immediately when a
  QueryObserver is first created, rather than only during the loading state.
- **Custom error types** — `ScreenQueryResult<T, E = Error>` accepts a generic
  error type parameter for type-safe error handling.
- **Resilient error handling** — a query that errors while still holding
  previously-fetched data keeps that data visible and surfaces the error through
  the result instead of tearing down the screen, matching the default
  `throwOnError` behavior of TanStack Query's `useSuspenseQuery` /
  `useSuspenseInfiniteQuery`.
