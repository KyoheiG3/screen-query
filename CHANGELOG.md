# Changelog

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
